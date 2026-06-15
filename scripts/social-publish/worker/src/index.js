/**
 * letspepper-reels-worker — cloud cron drip for Instagram reels.
 *
 * Hourly cron. During an allowed posting hour it posts ONE randomly-chosen
 * pending reel per active event, persists state in KV, and deletes the source
 * video from R2 once posted. No local-machine dependency.
 *
 * Bindings/secrets (wrangler.jsonc):
 *   QUEUE (KV)        one key per event slug → queue JSON (shape: { meta, items[] })
 *   MEDIA (R2)        bucket letspepper-reels — videos deleted after they post
 *   IG_ACCESS_TOKEN   System User token (secret)
 *   TRIGGER_KEY       guards /run and /status (secret)
 *   ACTIVE_EVENTS     comma-separated event slugs (var)
 *
 * Design choices that matter (this replaced a buggy version that double-posted):
 * - SELECTION is random among status==='pending' items — randomized order/grid.
 * - RATE is gated by meta.allowedHoursUTC (default 5 slots/day), 1 post/run.
 * - ERRORS ARE TERMINAL. Meta's "An unexpected error… retry" on media_publish
 *   often means it DID publish; auto-retrying re-created a new container and
 *   re-posted. So a failed publish marks the item 'error' and it is NEVER
 *   auto-retried — it needs manual review (was it actually posted?) + reset.
 * - thumb_offset randomized so the profile-grid cover frame varies per reel.
 * - Two-phase: container saved as 'building' before the (slow) publish; a
 *   slept/timed-out transcode resumes the SAME container next run (no re-upload).
 */

const GRAPH = 'https://graph.facebook.com/v25.0'
const DEFAULT_ALLOWED_HOURS_UTC = [13, 16, 19, 22, 1] // 8a,11a,2p,5p,8p CDT → 5/day

const ACCOUNTS = {
  letspepper: { handle: 'letspepper.open', ig_user_id: '17841475435692331' },
  flickday:   { handle: 'flickday.media',  ig_user_id: '17841474039989310' },
  ninophoto:  { handle: 'nino.chavez.photo', ig_user_id: '17841401886738878' },
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const r2KeyFromUrl = (url) => { try { return decodeURIComponent(url.split('.r2.dev/')[1] || '') } catch { return '' } }

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

// Publishing the SAME creation_id is idempotent on Meta's side (no duplicate post),
// so retrying is dupe-safe. Meta frequently returns "An unexpected error… retry" on
// media_publish even when it succeeded — a retry then returns the real media id (or
// publishes if it truly hadn't). Only after exhausting retries do we surface an error.
async function publishWithRetry(token, ig, creationId, tries = 4) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const { id } = await api(token, `${ig}/media_publish`, { creation_id: creationId })
      return id
    } catch (e) {
      lastErr = e
      if (/already.*publish|has already been/i.test(String(e?.message || e))) {
        // it published on a prior attempt; recover the id from the container
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
  // REELS — random cover frame in [500, 6000]ms (safely under even the shortest clip)
  const thumb_offset = String(500 + Math.floor(Math.random() * 5500))
  const { id } = await api(token, `${ig}/media`, {
    media_type: 'REELS', video_url: it.video_url, caption: it.caption,
    share_to_feed: 'true', thumb_offset, ...tagParams(it),
  })
  return id
}

const hasMedia = (it) => it.media_type === 'CAROUSEL'
  ? Array.isArray(it.children) && it.children.length : (it.video_url || it.image_url)

async function cleanupR2(env, it) {
  const keys = it.media_type === 'CAROUSEL'
    ? (it.children || []).map((c) => r2KeyFromUrl(c.video_url || c.image_url || ''))
    : [r2KeyFromUrl(it.video_url || it.image_url || '')]
  for (const k of keys) { if (k && env.MEDIA) { try { await env.MEDIA.delete(k) } catch { /* non-fatal */ } } }
}

async function dripEvent(env, ev, force = false) {
  const raw = await env.QUEUE.get(ev)
  if (!raw) return { ev, skipped: 'no queue in KV' }
  const q = JSON.parse(raw)
  const token = env.IG_ACCESS_TOKEN
  const allowed = q.meta?.allowedHoursUTC || DEFAULT_ALLOWED_HOURS_UTC

  // 1) Resume an in-flight container (slow transcode from a prior run) — always, regardless of hour.
  let item = q.items.find((it) => it.status === 'building' && it.ig_container_id)
  const resuming = !!item

  // 2) Otherwise, only during an allowed posting hour (or force), pick a RANDOM pending item.
  if (!item) {
    if (!force && !allowed.includes(new Date().getUTCHours())) return { ev, note: 'not a posting slot' }
    const pending = q.items.filter((it) => it.status === 'pending' && hasMedia(it))
    if (!pending.length) return { ev, note: 'nothing pending' }
    item = pending[Math.floor(Math.random() * pending.length)] // ← random selection
  }

  const acct = ACCOUNTS[item.account]
  if (!acct?.ig_user_id) {
    item.status = 'error'; item.error = `unknown account ${item.account}`
    await env.QUEUE.put(ev, JSON.stringify(q)); return { ev, error: item.error }
  }

  try {
    let containerId = item.ig_container_id
    if (!resuming) {
      containerId = await buildContainer(token, acct.ig_user_id, item)
      item.ig_container_id = containerId
      item.status = 'building'
      await env.QUEUE.put(ev, JSON.stringify(q)) // persist before the slow poll/publish
    }
    if (item.media_type !== 'IMAGE') {
      const st = await pollStatus(token, containerId)
      if (st !== 'FINISHED') { await env.QUEUE.put(ev, JSON.stringify(q)); return { ev, item: item.id, note: 'transcoding — resumes next run' } }
    }
    const mediaId = await publishWithRetry(token, acct.ig_user_id, containerId)
    item.status = 'posted'; item.ig_media_id = mediaId; item.posted_at = new Date().toISOString(); item.error = null
    await env.QUEUE.put(ev, JSON.stringify(q))
    await cleanupR2(env, item) // free storage; IG has its own copy now
    return { ev, posted: item.id, mediaId, account: acct.handle }
  } catch (e) {
    // TERMINAL: do not auto-retry. A publish error may mean it actually posted.
    item.status = 'error'; item.error = String(e?.message || e)
    await env.QUEUE.put(ev, JSON.stringify(q))
    return { ev, error: item.error, item: item.id }
  }
}

async function run(env, force = false) {
  const events = (env.ACTIVE_EVENTS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const results = []
  for (const ev of events) results.push(await dripEvent(env, ev, force))
  return results
}

export default {
  async scheduled(_controller, env, ctx) { ctx.waitUntil(run(env)) },
  async fetch(req, env) {
    const url = new URL(req.url)
    const authed = url.searchParams.get('key') && url.searchParams.get('key') === env.TRIGGER_KEY
    if (url.pathname === '/run') {
      if (!authed) return new Response('forbidden', { status: 403 })
      // ?force=1 bypasses the posting-hour gate (manual one-off post / validation)
      return Response.json(await run(env, url.searchParams.get('force') === '1'))
    }
    if (url.pathname === '/status') {
      if (!authed) return new Response('forbidden', { status: 403 })
      const events = (env.ACTIVE_EVENTS || '').split(',').map((s) => s.trim()).filter(Boolean)
      const out = {}
      for (const ev of events) {
        const raw = await env.QUEUE.get(ev)
        if (!raw) { out[ev] = 'no queue'; continue }
        const q = JSON.parse(raw)
        const by = (s) => q.items.filter((i) => i.status === s).length
        out[ev] = { total: q.items.length, posted: by('posted'), pending: by('pending'),
          building: by('building'), error: by('error'),
          errors: q.items.filter((i) => i.status === 'error').map((i) => ({ id: i.id, err: i.error })) }
      }
      return Response.json(out)
    }
    return new Response('letspepper-reels-worker')
  },
}
