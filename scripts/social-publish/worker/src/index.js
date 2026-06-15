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
  async scheduled(_controller, env, ctx) { ctx.waitUntil(run(env)) },
  async fetch(req, env) {
    const url = new URL(req.url)
    const authed = url.searchParams.get('key') && url.searchParams.get('key') === env.TRIGGER_KEY
    if (url.pathname === '/run') {
      if (!authed) return new Response('forbidden', { status: 403 })
      return Response.json(await run(env, url.searchParams.get('force') === '1'))
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
