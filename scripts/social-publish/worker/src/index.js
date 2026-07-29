/**
 * letspepper-reels-worker — cloud cron drip for owned Instagram and Facebook Pages.
 *
 * Hourly cron. GLOBAL cadence with EVENT PRIORITY:
 *   - At most ONE fresh campaign item per allowed slot → ALLOWED_HOURS_UTC sets
 *     the daily cap (default 2 slots = 2/day total, ACROSS all events — not per
 *     event). A single item may publish to both Instagram and its paired
 *     Facebook Page; each destination keeps independent state.
 *   - Recency priority: each slot posts a random pending reel from the
 *     highest-priority event first (ACTIVE_EVENTS order, newest listed FIRST);
 *     older events only backfill when the newer one has nothing pending.
 *   - Per-item scheduledAt (optional): an item carrying scheduledAt posts only
 *     when DUE (scheduledAt <= now), earliest-first, at ANY hour — its timestamp
 *     is the gate, NOT ALLOWED_HOURS_UTC. Items WITHOUT scheduledAt keep the slot
 *     cadence above. This lets a dated campaign (one planned post/day) run on the
 *     same worker as a faithful cloud twin of the local launchd drip.
 *   - In-flight containers (slow transcode) resume ANY hour, so a started post
 *     always completes; that counts as the run's single post.
 *
 * Bindings/secrets (wrangler.jsonc):
 *   QUEUE (KV)         one key per event slug → queue JSON ({meta,items[]})
 *   IG_ACCESS_TOKEN    Instagram-publishing System User token (secret)
 *   FB_ACCESS_TOKEN    Page-publishing System User token with
 *                      pages_manage_posts (secret). An asset-specific override
 *                      can be supplied via each account's optional
 *                      FB_*_ACCESS_TOKEN binding.
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
  letspepper: {
    handle: 'letspepper.open',
    ig_user_id: '17841475435692331',
    page_id: '1121553257697663',
    fb_token_binding: 'FB_LETSPEPPER_ACCESS_TOKEN',
  },
  flickday: {
    handle: 'flickday.media',
    ig_user_id: '17841474039989310',
    page_id: '1083438888196332',
    fb_token_binding: 'FB_FLICKDAY_ACCESS_TOKEN',
  },
  ninophoto: {
    handle: 'nino.chavez.photo',
    ig_user_id: '17841401886738878',
    page_id: '739564079232058',
    fb_token_binding: 'FB_NINOPHOTO_ACCESS_TOKEN',
  },
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

const wantsInstagram = (it) => !Array.isArray(it.channels) || it.channels.includes('instagram')
const wantsFacebook = (it) => Array.isArray(it.channels) && it.channels.includes('facebook')
const instagramPending = (it) => wantsInstagram(it) && (it.status === 'pending' || it.status === 'building')
const facebookPending = (it) => wantsFacebook(it) &&
  ((it.facebook_status || 'pending') === 'pending' || it.facebook_status === 'building')

async function persistQueue(env, ev, q) {
  await env.QUEUE.put(ev, JSON.stringify(q))
}

// Publish the Instagram destination only. Its legacy fields stay intact so all
// pre-Facebook queues continue to work without migration.
async function publishInstagramItem(env, ev, q, item) {
  const acct = ACCOUNTS[item.account]
  if (!acct?.ig_user_id) {
    item.status = 'error'; item.error = `unknown account ${item.account}`
    await persistQueue(env, ev, q); return { error: item.error }
  }
  const token = env.IG_ACCESS_TOKEN
  try {
    let containerId = item.ig_container_id
    if (!containerId) {
      containerId = await buildContainer(token, acct.ig_user_id, item)
      item.ig_container_id = containerId; item.status = 'building'
      await persistQueue(env, ev, q) // persist before the slow poll/publish
    }
    if (item.media_type !== 'IMAGE') {
      const st = await pollStatus(token, containerId)
      if (st !== 'FINISHED') {
        await persistQueue(env, ev, q)
        return { note: 'transcoding — resumes next run' }
      }
    }
    const mediaId = await publishWithRetry(token, acct.ig_user_id, containerId)
    item.status = 'posted'; item.ig_media_id = mediaId; item.posted_at = new Date().toISOString(); item.error = null
    await persistQueue(env, ev, q)
    return { posted: item.id, mediaId, account: acct.handle }
  } catch (e) {
    item.status = 'error'; item.error = String(e?.message || e) // TERMINAL
    await persistQueue(env, ev, q)
    return { error: item.error }
  }
}

const pageTokenCache = new Map()

async function pageAccessToken(env, acct) {
  const cached = pageTokenCache.get(acct.page_id)
  if (cached) return cached

  const dedicated = acct.fb_token_binding ? env[acct.fb_token_binding] : null
  if (dedicated) {
    pageTokenCache.set(acct.page_id, dedicated)
    return dedicated
  }

  const systemToken = env.FB_ACCESS_TOKEN || env.IG_ACCESS_TOKEN

  // Depending on how the business System User was provisioned, Meta may expose
  // the Page token directly on the assigned Page or via /me/accounts. Try both,
  // then make the Page call with the System User token itself; any missing
  // pages_manage_posts permission remains visible on the actual publish call.
  try {
    const page = await api(systemToken, acct.page_id, { fields: 'access_token' }, 'GET')
    if (page.access_token) {
      pageTokenCache.set(acct.page_id, page.access_token)
      return page.access_token
    }
  } catch { /* try /me/accounts */ }

  try {
    const pages = await api(systemToken, 'me/accounts', { fields: 'id,access_token', limit: '100' }, 'GET')
    const page = (pages.data || []).find((candidate) => candidate.id === acct.page_id)
    if (page?.access_token) {
      pageTokenCache.set(acct.page_id, page.access_token)
      return page.access_token
    }
  } catch { /* fall back to the assigned System User token */ }

  pageTokenCache.set(acct.page_id, systemToken)
  return systemToken
}

async function uploadHostedFacebookReel(token, acct, item, persist) {
  let videoId = item.facebook_video_id

  if (!videoId) {
    const start = await api(token, `${acct.page_id}/video_reels`, { upload_phase: 'start' })
    videoId = start.video_id
    item.facebook_video_id = videoId
    item.facebook_upload_url = start.upload_url
    item.facebook_status = 'building'
    await persist()
  }

  if (!item.facebook_uploaded) {
    const uploadUrl = item.facebook_upload_url ||
      `https://rupload.facebook.com/video-upload/v25.0/${videoId}`
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_url: item.video_url,
      },
    })
    const uploadJson = await uploadRes.json().catch(() => ({}))
    if (!uploadRes.ok || uploadJson.success !== true) {
      throw new Error(uploadJson.error?.message || `Facebook Reel upload failed (${uploadRes.status})`)
    }
    item.facebook_uploaded = true
    await persist()
  }

  await api(token, `${acct.page_id}/video_reels`, {
    upload_phase: 'finish',
    video_id: videoId,
    video_state: 'PUBLISHED',
    description: item.facebook_caption || item.caption || '',
    ...(item.facebook_title ? { title: item.facebook_title } : {}),
  })

  return videoId
}

function collaboratorPageIds(item, publishingAccount) {
  if (Array.isArray(item.facebook_collaborators)) return item.facebook_collaborators
  if (!Array.isArray(item.collaborators)) return []

  return item.collaborators
    .map((handle) => Object.entries(ACCOUNTS)
      .find(([slug, acct]) => slug !== publishingAccount && acct.handle === handle)?.[1]?.page_id)
    .filter(Boolean)
}

async function inviteFacebookCollaborators(token, item, publishingAccount, videoId) {
  const results = []
  for (const targetId of collaboratorPageIds(item, publishingAccount)) {
    try {
      const invitation = await api(token, `${videoId}/collaborators`, { target_id: targetId })
      results.push({ target_id: targetId, status: 'invited', invitation_link: invitation.invitation_link || null })
    } catch (e) {
      // The Reel is already live. An invitation failure is recorded but must not
      // rewrite the successful Page-publish state.
      results.push({ target_id: targetId, status: 'error', error: String(e?.message || e) })
    }
  }
  return results
}

async function publishFacebookItem(env, ev, q, item) {
  const acct = ACCOUNTS[item.account]
  if (!acct?.page_id) {
    item.facebook_status = 'error'
    item.facebook_error = `unknown Facebook Page for account ${item.account}`
    await persistQueue(env, ev, q)
    return { error: item.facebook_error }
  }

  try {
    const token = await pageAccessToken(env, acct)
    let postId

    if (item.media_type === 'IMAGE') {
      const result = await api(token, `${acct.page_id}/photos`, {
        url: item.image_url,
        message: item.facebook_caption || item.caption || '',
        published: 'true',
      })
      postId = result.post_id || result.id
    } else if (item.media_type === 'REELS') {
      postId = await uploadHostedFacebookReel(
        token,
        acct,
        item,
        () => persistQueue(env, ev, q),
      )
      item.facebook_collaborator_invites = await inviteFacebookCollaborators(
        token,
        item,
        item.account,
        postId,
      )
    } else {
      throw new Error(`Facebook Page publishing supports IMAGE and REELS here; received ${item.media_type}`)
    }

    item.facebook_status = 'posted'
    item.facebook_post_id = postId
    item.facebook_posted_at = new Date().toISOString()
    item.facebook_error = null
    await persistQueue(env, ev, q)
    return { posted: item.id, postId, pageId: acct.page_id }
  } catch (e) {
    item.facebook_status = 'error'
    item.facebook_error = String(e?.message || e)
    await persistQueue(env, ev, q)
    return { error: item.facebook_error }
  }
}

// Publish every still-pending destination for one campaign item. One channel's
// failure never changes the other channel's state.
async function publishItem(env, ev, q, item) {
  const result = { ev, item: item.id, destinations: {} }
  if (instagramPending(item)) {
    result.destinations.instagram = await publishInstagramItem(env, ev, q, item)
  }
  if (facebookPending(item)) {
    result.destinations.facebook = await publishFacebookItem(env, ev, q, item)
  }
  return result
}

// Finish an in-flight container/upload for this event, if any. Returns result or null.
async function resumeIfBuilding(env, ev) {
  const raw = await env.QUEUE.get(ev); if (!raw) return null
  const q = JSON.parse(raw)
  const item = q.items.find((it) =>
    (it.status === 'building' && it.ig_container_id) ||
    (wantsFacebook(it) && it.facebook_status === 'building' && it.facebook_video_id))
  if (!item) return null
  return publishItem(env, ev, q, item)
}

// Eligible to post THIS run:
//   scheduledAt present → only when due (scheduledAt <= now). The allowed-hour
//     slot does NOT gate scheduled items — scheduledAt IS their gate (mirrors
//     post-reels.mjs), so a dated campaign fires at its planned times, any hour.
//   no scheduledAt (legacy drip) → only inside an allowed-hour slot.
function eligibleNow(it, nowMs, hourAllowed) {
  if (it.scheduledAt) return Date.parse(it.scheduledAt) <= nowMs
  return hourAllowed
}

// Post one due pending item from this event. Scheduled items go earliest-first
// (deterministic calendar order); legacy (no-scheduledAt) items keep the random
// pick. Returns result, or null if nothing is due.
async function postDuePending(env, ev, hourAllowed) {
  const raw = await env.QUEUE.get(ev); if (!raw) return null
  const q = JSON.parse(raw)
  const now = Date.now()
  const due = q.items.filter((it) =>
    (instagramPending(it) || facebookPending(it)) &&
    hasMedia(it) &&
    eligibleNow(it, now, hourAllowed))
  if (!due.length) return null
  const scheduled = due.filter((it) => it.scheduledAt).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
  const item = scheduled.length ? scheduled[0] : due[Math.floor(Math.random() * due.length)]
  return publishItem(env, ev, q, item)
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
  // 2) Fresh post. Scheduled items gate on their own scheduledAt (any hour);
  //    legacy items gate on the allowed-hour slot. force=1 opens the slot for
  //    legacy items but never overrides a scheduled item's future scheduledAt.
  const hourAllowed = force || allowedHours(env).includes(new Date().getUTCHours())
  for (const ev of evs) { const r = await postDuePending(env, ev, hourAllowed); if (r) return [r] }
  return [{ note: 'nothing due in any active event' }]
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
        const facebookItems = q.items.filter(wantsFacebook)
        const facebookBy = (s) => facebookItems.filter((i) => (i.facebook_status || 'pending') === s).length
        out.events[ev] = { total: q.items.length, posted: by('posted'), pending: by('pending'),
          building: by('building'), error: by('error'),
          errors: q.items.filter((i) => i.status === 'error').map((i) => ({ id: i.id, err: i.error })),
          facebook: {
            enabled: facebookItems.length,
            posted: facebookBy('posted'),
            pending: facebookBy('pending'),
            building: facebookBy('building'),
            error: facebookBy('error'),
            errors: facebookItems
              .filter((i) => i.facebook_status === 'error')
              .map((i) => ({ id: i.id, err: i.facebook_error })),
          } }
      }
      return Response.json(out)
    }
    return new Response('letspepper-reels-worker')
  },
}
