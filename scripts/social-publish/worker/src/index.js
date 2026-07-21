/**
 * letspepper-reels-worker — cloud cron drip for Instagram reels.
 *
 * Hourly cron. GLOBAL cadence with EVENT PRIORITY:
 *   - At most ONE fresh reel per allowed slot → ALLOWED_HOURS_UTC sets the daily
 *     cap (default 2 slots = 2/day total, ACROSS all events — not per event).
 *   - Recency priority: each slot posts a random pending reel from the
 *     highest-priority event first (ACTIVE_EVENTS order, newest listed FIRST);
 *     older events only backfill when the newer one has nothing pending.
 *   - In-flight containers (slow transcode) resume ANY hour, so a started post
 *     always completes; that counts as the run's single post.
 *
 * Bindings/secrets (wrangler.jsonc):
 *   QUEUE (KV)         one key per event slug → queue JSON ({meta,items[]})
 *   IG_ACCESS_TOKEN    System User token (secret)
 *   TRIGGER_KEY        guards /run, /run?force=1, /status (secret)
 *   ACTIVE_EVENTS      comma-separated slugs, HIGHEST PRIORITY (newest) FIRST (var)
 *   ALLOWED_HOURS_UTC  comma-separated UTC hours = daily slots/cap (var)
 *
 * Errors are TERMINAL (never auto-retried) and publish uses publishWithRetry on
 * the SAME container (idempotent) — this is what stopped the double-posting:
 * Meta's "unexpected error" on media_publish often means it DID publish, so we
 * must not re-create+re-publish. See git history / memory for the full story.
 */

const GRAPH = 'https://graph.facebook.com/v25.0'
const DEFAULT_ALLOWED_HOURS_UTC = [16, 23] // 11a, 6p CDT → 2/day

// --- engagement sweep defaults (see SWEEP.md) ---
const DEFAULT_LOOKBACK_DAYS = 14
const DEFAULT_INTENT = {
  signup: ['sign ?up', 'register', 'how (do|can) (i|we) (join|sign|enter)',
    'where.*(sign|register|enter)', 'how much', 'entry fee', '\\bcost\\b', '\\bprice\\b', '\\$'],
  reply_text: 'Thanks for the interest! Register here: {REGISTRATION_URL}',
}
const DIGEST_CAP = 200

const ACCOUNTS = {
  letspepper: { handle: 'letspepper.open', ig_user_id: '17841475435692331' },
  flickday:   { handle: 'flickday.media',  ig_user_id: '17841474039989310' },
  ninophoto:  { handle: 'nino.chavez.photo', ig_user_id: '17841401886738878' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean)
const events = (env) => list(env.ACTIVE_EVENTS)
const allowedHours = (env) => {
  const h = list(env.ALLOWED_HOURS_UTC).map(Number).filter((n) => !Number.isNaN(n))
  return h.length ? h : DEFAULT_ALLOWED_HOURS_UTC
}

async function api(token, path, params, method = 'POST') {
  const body = new URLSearchParams({ ...params, access_token: token })
  const url = `${GRAPH}/${path}`
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body })
  const json = await res.json()
  if (!res.ok || json.error) throw new Error(json.error?.message || JSON.stringify(json))
  return json
}

function tagParams(it) {
  const p = {}
  if (Array.isArray(it.user_tags) && it.user_tags.length)
    p.user_tags = JSON.stringify(it.user_tags.map((u) => (typeof u === 'string' ? { username: u } : u)))
  if (Array.isArray(it.collaborators) && it.collaborators.length)
    p.collaborators = JSON.stringify(it.collaborators)
  return p
}

// Idempotent: re-publishing the SAME creation_id never duplicates. Meta often
// returns "unexpected error" on media_publish even when it succeeded — a retry
// then returns the real id (or publishes if it truly hadn't).
async function publishWithRetry(token, ig, creationId, tries = 4) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try { const { id } = await api(token, `${ig}/media_publish`, { creation_id: creationId }); return id }
    catch (e) {
      lastErr = e
      if (/already.*publish|has already been/i.test(String(e?.message || e))) {
        try { const r = await api(token, creationId, { fields: 'id' }, 'GET'); return r.id } catch { return null }
      }
      await sleep(8000)
    }
  }
  throw lastErr
}

async function pollStatus(token, containerId, maxMs = 75000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const { status_code } = await api(token, containerId, { fields: 'status_code' }, 'GET')
    if (status_code === 'FINISHED') return 'FINISHED'
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`)
    await sleep(5000)
  }
  return 'IN_PROGRESS'
}

async function buildContainer(token, ig, it) {
  if (it.media_type === 'CAROUSEL') {
    const childIds = []
    for (const child of it.children) {
      const base = child.media_type === 'VIDEO'
        ? { media_type: 'VIDEO', video_url: child.video_url }
        : { image_url: child.image_url }
      const { id } = await api(token, `${ig}/media`, { ...base, is_carousel_item: 'true' })
      if (child.media_type === 'VIDEO') await pollStatus(token, id)
      childIds.push(id)
    }
    const { id } = await api(token, `${ig}/media`, {
      media_type: 'CAROUSEL', children: childIds.join(','), caption: it.caption, ...tagParams(it),
    })
    return id
  }
  if (it.media_type === 'IMAGE') {
    const { id } = await api(token, `${ig}/media`, { image_url: it.image_url, caption: it.caption, ...tagParams(it) })
    return id
  }
  if (it.media_type === 'STORIES') {
    // Stories containers take media only — no caption/user_tags (Graph v16+).
    // Mirrors post-reels.mjs's STORIES branch; image containers finish fast so
    // the non-IMAGE pollStatus below returns FINISHED same-run.
    const media = it.video_url ? { video_url: it.video_url } : { image_url: it.image_url }
    const { id } = await api(token, `${ig}/media`, { media_type: 'STORIES', ...media })
    return id
  }
  const thumb_offset = String(500 + Math.floor(Math.random() * 5500)) // random cover frame
  const { id } = await api(token, `${ig}/media`, {
    media_type: 'REELS', video_url: it.video_url, caption: it.caption,
    share_to_feed: 'true', thumb_offset, ...tagParams(it),
  })
  return id
}

const hasMedia = (it) => it.media_type === 'CAROUSEL'
  ? Array.isArray(it.children) && it.children.length : (it.video_url || it.image_url)

// Publish one item (resume an existing container or build fresh), persist.
async function publishItem(env, ev, q, item, resuming) {
  const acct = ACCOUNTS[item.account]
  if (!acct?.ig_user_id) {
    item.status = 'error'; item.error = `unknown account ${item.account}`
    await env.QUEUE.put(ev, JSON.stringify(q)); return { ev, error: item.error, item: item.id }
  }
  const token = env.IG_ACCESS_TOKEN
  try {
    let containerId = item.ig_container_id
    if (!resuming) {
      containerId = await buildContainer(token, acct.ig_user_id, item)
      item.ig_container_id = containerId; item.status = 'building'
      await env.QUEUE.put(ev, JSON.stringify(q)) // persist before the slow poll/publish
    }
    if (item.media_type !== 'IMAGE') {
      const st = await pollStatus(token, containerId)
      if (st !== 'FINISHED') { await env.QUEUE.put(ev, JSON.stringify(q)); return { ev, item: item.id, note: 'transcoding — resumes next run' } }
    }
    const mediaId = await publishWithRetry(token, acct.ig_user_id, containerId)
    item.status = 'posted'; item.ig_media_id = mediaId; item.posted_at = new Date().toISOString(); item.error = null
    await env.QUEUE.put(ev, JSON.stringify(q))
    return { ev, posted: item.id, mediaId, account: acct.handle }
  } catch (e) {
    item.status = 'error'; item.error = String(e?.message || e) // TERMINAL
    await env.QUEUE.put(ev, JSON.stringify(q))
    return { ev, error: item.error, item: item.id }
  }
}

// Finish an in-flight container for this event, if any. Returns result or null.
async function resumeIfBuilding(env, ev) {
  const raw = await env.QUEUE.get(ev); if (!raw) return null
  const q = JSON.parse(raw)
  const item = q.items.find((it) => it.status === 'building' && it.ig_container_id)
  if (!item) return null
  return publishItem(env, ev, q, item, true)
}

// Post one random pending reel from this event. Returns result, or null if none pending.
async function postRandomPending(env, ev) {
  const raw = await env.QUEUE.get(ev); if (!raw) return null
  const q = JSON.parse(raw)
  const pending = q.items.filter((it) => it.status === 'pending' && hasMedia(it))
  if (!pending.length) return null
  const item = pending[Math.floor(Math.random() * pending.length)]
  return publishItem(env, ev, q, item, false)
}

// ============================ ENGAGEMENT SWEEP ============================
// Poll-based (no webhooks). Standard Access, owned accounts. v1 = comment surface
// only (scope: instagram_manage_comments). Runs after the post step, isolated so a
// sweep failure never blocks a post. See SWEEP.md for the full spec + Phase 2 (DMs).

const lookbackDays = (env) => Number(env.SWEEP_LOOKBACK_DAYS) || DEFAULT_LOOKBACK_DAYS
const autoreplyMode = (env) => (env.SWEEP_AUTOREPLY || 'off').toLowerCase() // off | intent

async function intentConfig(env) {
  try { const raw = await env.QUEUE.get('engage:config'); if (raw) return { ...DEFAULT_INTENT, ...JSON.parse(raw) } }
  catch { /* fall through to defaults */ }
  return DEFAULT_INTENT
}

function classify(text, cfg) {
  const t = (text || '').toLowerCase()
  for (const pat of cfg.signup) { try { if (new RegExp(pat, 'i').test(t)) return 'signup' } catch { /* bad regex */ } }
  return 'other'
}

// rolling digest of new activity, capped, newest first
async function digestAppend(env, entries) {
  if (!entries.length) return
  let cur = []
  try { cur = JSON.parse((await env.QUEUE.get('engage:digest')) || '[]') } catch { cur = [] }
  const next = [...entries, ...cur].slice(0, DIGEST_CAP)
  await env.QUEUE.put('engage:digest', JSON.stringify(next))
}

// push the new entries to a notify sink Nino actually sees (generic webhook —
// point at Discord/Slack/email-relay). No-op if unset; /inbox still serves the pull.
async function notify(env, entries) {
  if (!entries.length || !env.NOTIFY_WEBHOOK_URL) return
  const lines = entries.map((e) =>
    `[${e.account}] @${e.username}: ${JSON.stringify(e.text).slice(0, 120)} — ${e.intent}/${e.action}`)
  const content = `Pepper sweep — ${entries.length} new:\n` + lines.join('\n')
  try {
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, text: content }), // Discord uses `content`, Slack uses `text`
    })
  } catch (e) { console.error('notify failed', e) }
}

// Send the one-shot private reply to a commenter (7-day window, once only).
// Mirrors publishWithRetry's dedupe discipline: mark handled on success AND on
// Meta's "already sent" so a double attempt can't double-send.
async function privateReply(env, ig, commentId, text) {
  try {
    await api(env.IG_ACCESS_TOKEN, `${ig}/messages`, {
      recipient: JSON.stringify({ comment_id: commentId }),
      message: JSON.stringify({ text }),
    })
    return 'sent'
  } catch (e) {
    if (/already|only one|same recipient/i.test(String(e?.message || e))) return 'already'
    throw e
  }
}

async function sweepAccount(env, acct) {
  const token = env.IG_ACCESS_TOKEN
  const cutoff = Date.now() - lookbackDays(env) * 86400000
  const cfg = await intentConfig(env)
  const mode = autoreplyMode(env)
  const entries = []

  const media = await api(token, `${acct.ig_user_id}/media`, { fields: 'id,timestamp', limit: '25' }, 'GET')
  for (const m of media.data || []) {
    if (Date.parse(m.timestamp) < cutoff) continue
    const cs = await api(token, `${m.id}/comments`,
      { fields: 'id,text,username,timestamp,from,replies{from}', limit: '50' }, 'GET')
    for (const c of cs.data || []) {
      if (c.from?.id === acct.ig_user_id) continue // our own comment
      const dedupeKey = `engage:c:${c.id}`
      if (await env.QUEUE.get(dedupeKey)) continue // already handled
      const intent = classify(c.text, cfg)
      let action = 'shadow' // default: log only
      if (intent === 'signup' && mode === 'intent') {
        const text = cfg.reply_text.replace('{REGISTRATION_URL}', env.REGISTRATION_URL || '')
        try { action = await privateReply(env, acct.ig_user_id, c.id, text) }
        catch (e) { action = `error:${String(e?.message || e).slice(0, 80)}` }
      } else if (intent === 'signup') {
        action = 'would-reply' // shadow: a signup match we did NOT send (mode=off)
      }
      // Mark handled for every TERMINAL outcome (sent/already/shadow/would-reply) —
      // deduping the shadow paths prevents a backlog blast when mode flips to intent.
      // But a transient send error must NOT be deduped: leaving the key unset lets the
      // next hourly sweep retry the lead (privateReply is idempotent — Meta caps it to
      // one), so a rate-limit/token blip can't silently drop a real signup for 8 days.
      if (!String(action).startsWith('error:')) {
        await env.QUEUE.put(dedupeKey, '1', { expirationTtl: 8 * 86400 })
      }
      entries.push({ account: acct.handle, media_id: m.id, comment_id: c.id,
        username: c.username, text: c.text, intent, action, ts: c.timestamp })
    }
  }
  return entries
}

async function sweep(env) {
  const all = []
  for (const [key, acct] of Object.entries(ACCOUNTS)) {
    try { all.push(...await sweepAccount(env, acct)) }
    catch (e) { console.error(`sweep ${key} failed`, e); all.push({ account: acct.handle, error: String(e?.message || e) }) }
  }
  const real = all.filter((e) => !e.error)
  await digestAppend(env, all)
  await notify(env, real)
  return all
}

async function run(env, force = false) {
  const evs = events(env) // priority order: newest first
  // 1) Always finish any in-flight container first (counts as this run's post).
  for (const ev of evs) { const r = await resumeIfBuilding(env, ev); if (r) return [r] }
  // 2) Fresh post — gated to allowed slots; highest-priority event with pending wins.
  if (!force && !allowedHours(env).includes(new Date().getUTCHours())) return [{ note: 'not a posting slot' }]
  for (const ev of evs) { const r = await postRandomPending(env, ev); if (r) return [r] }
  return [{ note: 'nothing pending in any active event' }]
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil((async () => {
      await run(env) // post step first — unchanged
      if (env.SWEEP_ENABLED === '1') {
        try { await sweep(env) } catch (e) { console.error('sweep failed', e) } // isolated
      }
    })())
  },
  async fetch(req, env) {
    const url = new URL(req.url)
    const authed = url.searchParams.get('key') && url.searchParams.get('key') === env.TRIGGER_KEY
    if (url.pathname === '/run') {
      if (!authed) return new Response('forbidden', { status: 403 })
      return Response.json(await run(env, url.searchParams.get('force') === '1'))
    }
    if (url.pathname === '/sweep') {
      if (!authed) return new Response('forbidden', { status: 403 })
      return Response.json(await sweep(env))
    }
    if (url.pathname === '/inbox') {
      if (!authed) return new Response('forbidden', { status: 403 })
      let digest = []
      try { digest = JSON.parse((await env.QUEUE.get('engage:digest')) || '[]') } catch { /* empty */ }
      return Response.json({ mode: autoreplyMode(env), count: digest.length, digest })
    }
    if (url.pathname === '/status') {
      if (!authed) return new Response('forbidden', { status: 403 })
      const out = { allowedHoursUTC: allowedHours(env), priorityOrder: events(env), events: {} }
      for (const ev of events(env)) {
        const raw = await env.QUEUE.get(ev)
        if (!raw) { out.events[ev] = 'no queue'; continue }
        const q = JSON.parse(raw)
        const by = (s) => q.items.filter((i) => i.status === s).length
        out.events[ev] = { total: q.items.length, posted: by('posted'), pending: by('pending'),
          building: by('building'), error: by('error'),
          errors: q.items.filter((i) => i.status === 'error').map((i) => ({ id: i.id, err: i.error })) }
      }
      return Response.json(out)
    }
    return new Response('letspepper-reels-worker')
  },
}
