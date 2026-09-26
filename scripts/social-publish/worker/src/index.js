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
 *   REVIEW_KEY         guards GET /review and POST /review/cancel ONLY — a separate secret
 *                      from TRIGGER_KEY, which /review can never reach (secret, added
 *                      2026-09-26 — see SETUP.md "/review"). Absent means every /review*
 *                      request 403s.
 *   NTFY_TOPIC         ntfy.sh topic for gallery-announce HELD/POSTED/FAILED/VETOED phone
 *                      notifications (secret — see notify.mjs and SETUP.md).
 *                      Absent means "skip notifying," never a publish failure.
 *   SUBREQUEST_BUDGET  external subrequests (Graph + ntfy) this invocation may
 *                      spend before deferring the rest to the next tick (var,
 *                      default 40 — conservative under the Workers Free cap of
 *                      50/invocation; raise it once the account's plan is
 *                      confirmed Paid — see SETUP.md "Cloudflare plan").
 *   ACTIVE_EVENTS      comma-separated slugs, HIGHEST PRIORITY (newest) FIRST (var)
 *   ALLOWED_HOURS_UTC  comma-separated UTC hours = daily slots/cap (var)
 *
 * gallery-announce carousel budget (2026-09-26): a CAROUSEL crosspost can need up to
 * ~43 Graph subrequests in one tick (10 IG children + 1 parent + polls/retries, 10
 * Facebook photo uploads + 1 feed post) — see SETUP.md's own count. Rather than trust a
 * plan tier this file can't see, every subrequest that touches the Graph API in the
 * CAROUSEL paths is charged against a per-invocation SubrequestBudget (see makeBudget
 * below), created once in run() and threaded down through every publish call. Hitting
 * the budget mid-build throws Deferred, which is caught where the equivalent "still
 * transcoding" case already is: the item's PARTIAL progress (each IG child container id,
 * each Facebook uploaded photo id) is persisted as it's created, so the NEXT tick resumes
 * from exactly where this one stopped rather than re-creating anything — same shape as
 * uploadFacebookCarouselPhotos' pre-existing facebook_photo_ids resume, extended to the
 * Instagram side (see ig_child_container_ids) and made budget-aware on both.
 *
 * Errors are TERMINAL (never auto-retried) and publish uses publishWithRetry on
 * the SAME container (idempotent) — this is what stopped the double-posting:
 * Meta's "unexpected error" on media_publish often means it DID publish, so we
 * must not re-create+re-publish. See git history / memory for the full story.
 *
 * Route gate (2026-09-21): an item publishes only when its queue carries
 * `meta.route`, a complete standing entry (reason, approved date, accounts,
 * optional expires — the shape route-shape.mjs owns) that is still in date and
 * names the item's account. seed-kv.mjs copies it from the tracked
 * graph-routes.json. Anything else goes terminal with `route_error` set, on
 * both destinations, before any Graph call — in the resume path as well as
 * the fresh-post path. What this proves is narrow: a queue written to KV is no
 * longer, by itself, an instruction to publish. The route in KV is still
 * written by whoever writes KV.
 */

import { standingEntry, inDate, entryCovers } from '../../route-shape.mjs'
import { holdBlock, isHeld } from '../../hold-shape.mjs'
import {
  notify, postedNotification, failedNotification, vetoedNotification,
  chicagoLabel, reviewUrlFor, reviewCancelUrlFor,
} from '../../notify.mjs'
import { veto } from '../../veto-shape.mjs'
import { shortAlbumName } from '../../gallery-announce-caption.mjs'

const GRAPH = 'https://graph.facebook.com/v25.0'
const DEFAULT_ALLOWED_HOURS_UTC = [16, 23] // 11a, 6p CDT → 2/day
const DEFAULT_SUBREQUEST_BUDGET = 40

// Thrown by a carousel build step when spending its next subrequest would exceed the
// invocation's budget. Caught where "still transcoding" already is — it is a deferral,
// never a terminal error, so it must never reach a catch block that sets status='error'.
class Deferred extends Error {}

/**
 * A per-invocation counter for external (Graph + ntfy) subrequests. Created fresh in
 * run() every invocation — Workers isolates can be reused across invocations, so this
 * must NEVER be module-scoped state, or a later invocation would inherit an earlier one's
 * spent budget. canSpend/spend let a caller check before committing to a call ("check
 * before each call and return deferred" — a budget that only found out AFTER the fetch
 * would have already spent the subrequest it was trying to avoid).
 */
function makeBudget(limit) {
  let used = 0
  return {
    limit,
    used: () => used,
    canSpend(n = 1) { return used + n <= limit },
    spend(n = 1) { if (!this.canSpend(n)) return false; used += n; return true },
  }
}

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

async function pollStatus(token, containerId, maxMs = 75000, budget) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    // Budget-exhausted here returns IN_PROGRESS rather than throwing — the caller already
    // treats a non-FINISHED status as "resumes next run" (see publishInstagramItem), so
    // running out of budget mid-poll fits that existing path instead of needing its own.
    if (budget && !budget.spend(1)) return 'IN_PROGRESS'
    const { status_code } = await api(token, containerId, { fields: 'status_code' }, 'GET')
    if (status_code === 'FINISHED') return 'FINISHED'
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`)
    await sleep(5000)
  }
  return 'IN_PROGRESS'
}

// `persist` is called after each new IG carousel child id is recorded — resumable the same
// way uploadFacebookCarouselPhotos already is: it.ig_child_container_ids accumulates one id
// per created child, so a deferred or interrupted build picks up at childIds.length on its
// next attempt instead of re-creating children the account already holds.
async function buildContainer(token, ig, it, budget, persist) {
  if (it.media_type === 'CAROUSEL') {
    if (!Array.isArray(it.ig_child_container_ids)) it.ig_child_container_ids = []
    const childIds = it.ig_child_container_ids
    for (let i = childIds.length; i < it.children.length; i++) {
      if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted building IG carousel children')
      const child = it.children[i]
      // alt_text: Meta's IG media reference lists it as "supported on a single
      // image or image media in a carousel" — an IMAGE child only, never VIDEO.
      const base = child.media_type === 'VIDEO'
        ? { media_type: 'VIDEO', video_url: child.video_url }
        : { image_url: child.image_url, ...(child.alt_text ? { alt_text: child.alt_text } : {}) }
      const { id } = await api(token, `${ig}/media`, { ...base, is_carousel_item: 'true' })
      if (child.media_type === 'VIDEO') await pollStatus(token, id, 75000, budget)
      childIds.push(id)
      if (persist) await persist() // persist THIS child's id before starting the next one
    }
    if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted creating IG carousel parent container')
    const { id } = await api(token, `${ig}/media`, {
      media_type: 'CAROUSEL', children: childIds.join(','), caption: it.caption, ...tagParams(it),
    })
    return id
  }
  if (it.media_type === 'IMAGE') {
    if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted creating IG image container')
    const { id } = await api(token, `${ig}/media`, {
      image_url: it.image_url, caption: it.caption, ...(it.alt_text ? { alt_text: it.alt_text } : {}), ...tagParams(it),
    })
    return id
  }
  if (it.media_type === 'STORIES') {
    // Stories containers take media only — no caption/user_tags (Graph v16+).
    // Mirrors post-reels.mjs's STORIES branch; image containers finish fast so
    // the non-IMAGE pollStatus below returns FINISHED same-run.
    if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted creating IG story container')
    const media = it.video_url ? { video_url: it.video_url } : { image_url: it.image_url }
    const { id } = await api(token, `${ig}/media`, { media_type: 'STORIES', ...media })
    return id
  }
  if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted creating IG reels container')
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
// A hold or a veto blocks BOTH destinations, same as a route refusal, and for the
// same reason: instagramPending/facebookPending decide what may reach the Graph
// API next, and "pending" alone can't tell a held or vetoed item from an ordinary
// one. Checked with `new Date()` at call time, never cached, so a hold clears the
// moment holdUntil passes without needing anything to flip its status.
// 'held' counts as eligible once holdBlock() clears (holdUntil has passed) — the
// item never needs a separate flip to 'pending', so nothing has to run at exactly
// holdUntil to make it publishable again.
const instagramPending = (it) => wantsInstagram(it) && !holdBlock(it) &&
  (it.status === 'pending' || it.status === 'building' || it.status === 'held')
const facebookPending = (it) => wantsFacebook(it) && !holdBlock(it) &&
  ['pending', 'building', 'held'].includes(it.facebook_status || 'pending')

// /review's own held/pending split — same live check as /status's heldNow/pendingNow (item
// stays `status: 'held'` forever; eligibility is checked live via isHeld(), never a status
// flip), named separately here so /review doesn't reach into /status's local closures.
const reviewHeldNow = (it) => it.status === 'held' && isHeld(it)
const reviewPendingNow = (it) => it.status === 'pending' || (it.status === 'held' && !isHeld(it))
// Held/pending on the INSTAGRAM side alone is not enough: a dual-destination item can have
// Instagram still 'held' while Facebook is already 'building' (or holds upload progress with
// no feed post yet) — hasInFlightProgress() (defined near resumeIfBuilding) catches that.
// Without this, /review/cancel could "cancel" an item whose Facebook upload keeps running and
// completes anyway (found by code review 2026-09-26).
const reviewCancelEligible = (it) => (reviewHeldNow(it) || reviewPendingNow(it)) && !hasInFlightProgress(it)

async function persistQueue(env, ev, q) {
  await env.QUEUE.put(ev, JSON.stringify(q))
}

async function loadQueue(env, ev) {
  const raw = await env.QUEUE.get(ev)
  return raw ? JSON.parse(raw) : null
}

const queueRoute = (q, ev) => standingEntry(ev, { events: { [ev]: q.meta?.route } })

// Why this item may not publish, or null when its queue's route covers it.
function routeRefusal(q, ev, item, now) {
  const entry = queueRoute(q, ev)
  if (!q.meta?.route) return `no route: queue "${ev}" carries no meta.route — seed it with seed-kv.mjs from its graph-routes.json entry`
  if (!entry) return `no route: meta.route for "${ev}" is incomplete (needs reason, approved YYYY-MM-DD, accounts[], optional expires YYYY-MM-DD)`
  if (!inDate(entry, now)) return `no route: meta.route for "${ev}" expired ${entry.expires}`
  if (!entryCovers(entry, [item.account], now)) return `no route: meta.route for "${ev}" does not list account "${item.account}"`
  return null
}

// Terminal on every destination still waiting, so neither channel retries it next tick.
function refuse(item, why) {
  const ig = instagramPending(item)
  const fb = facebookPending(item)
  item.route_error = why
  if (ig) { item.status = 'error'; item.error = why }
  if (fb) { item.facebook_status = 'error'; item.facebook_error = why }
}

// The candidates a route covers. The rest are refused and the queue persisted
// once, before the caller makes any Graph call.
async function routed(env, ev, q, candidates, now = new Date()) {
  const allowed = []
  let refused = 0
  for (const item of candidates) {
    const why = routeRefusal(q, ev, item, now)
    if (!why) { allowed.push(item); continue }
    refuse(item, why)
    refused++
    console.error(`refused ${ev}/${item.id}: ${why}`)
  }
  if (refused) await persistQueue(env, ev, q)
  return allowed
}

// Best-effort permalink for a POSTED notification's click target — the failure of this
// single GET must never turn a successful publish into an error, so it's wrapped separately
// from the publish itself and simply omitted (postedNotification handles a null permalink).
async function igPermalink(token, mediaId, budget) {
  try {
    if (budget && !budget.spend(1)) return null
    const { permalink } = await api(token, mediaId, { fields: 'permalink' }, 'GET')
    return permalink || null
  } catch { return null }
}

// gallery-announce only: the phone-notification campaign this was built for. Other events
// on this shared Worker (the legacy reels drip) keep publishing exactly as before, silently.
const notifiable = (ev) => ev === 'gallery-announce'

// Publish the Instagram destination only. Its legacy fields stay intact so all
// pre-Facebook queues continue to work without migration.
async function publishInstagramItem(env, ev, q, item, budget) {
  const acct = ACCOUNTS[item.account]
  if (!acct?.ig_user_id) {
    item.status = 'error'; item.error = `unknown account ${item.account}`
    await persistQueue(env, ev, q); return { error: item.error }
  }
  const token = env.IG_ACCESS_TOKEN
  try {
    let containerId = item.ig_container_id
    if (!containerId) {
      containerId = await buildContainer(token, acct.ig_user_id, item, budget, () => persistQueue(env, ev, q))
      item.ig_container_id = containerId; item.status = 'building'
      await persistQueue(env, ev, q) // persist before the slow poll/publish
    }
    if (item.media_type !== 'IMAGE') {
      const st = await pollStatus(token, containerId, 75000, budget)
      if (st !== 'FINISHED') {
        await persistQueue(env, ev, q)
        return { note: 'transcoding — resumes next run' }
      }
    }
    if (budget && !budget.spend(1)) { await persistQueue(env, ev, q); return { note: 'subrequest budget exhausted before publish — resumes next run' } }
    const mediaId = await publishWithRetry(token, acct.ig_user_id, containerId)
    item.status = 'posted'; item.ig_media_id = mediaId; item.posted_at = new Date().toISOString(); item.error = null
    await persistQueue(env, ev, q)
    if (notifiable(ev)) {
      const permalink = await igPermalink(token, mediaId, budget)
      await notify({ topic: env.NTFY_TOPIC, ...postedNotification({
        albumName: shortAlbumName(item.album_name, item.album_key || item.id), channel: 'instagram', permalink,
        collaborator: item.collaborators?.[0],
      }) })
    }
    return { posted: item.id, mediaId, account: acct.handle }
  } catch (e) {
    if (e instanceof Deferred) {
      await persistQueue(env, ev, q)
      return { note: `${e.message} — resumes next run` }
    }
    item.status = 'error'; item.error = String(e?.message || e) // TERMINAL
    await persistQueue(env, ev, q)
    if (notifiable(ev)) {
      await notify({ topic: env.NTFY_TOPIC, ...failedNotification({
        albumName: shortAlbumName(item.album_name, item.album_key || item.id), channel: 'instagram', error: item.error,
        reviewUrl: reviewUrlFor(env.REVIEW_KEY, item.id),
      }) })
    }
    return { error: item.error }
  }
}

const pageTokenCache = new Map()
// Whether the cached token for a Page is a real Page token ('dedicated' | 'page-lookup')
// or the System User token used as a last resort ('system-fallback'). SETUP.md's live
// probe (2026-07-29) found unpublished photos (published=false, what the carousel
// crosspost below needs) work ONLY with a Page token — the System User token 400s with
// "(#200) Unpublished posts must be posted to a page as the page itself". A published
// IMAGE or a REELS upload tolerates the fallback; an unpublished multi-photo upload must not.
const pageTokenKindCache = new Map()

// Test-only: pageTokenCache/pageTokenKindCache are module-scoped so a real Worker
// instance can reuse a resolved Page token across requests. That same persistence
// bleeds a token resolved in one test into the next when they share a page_id —
// call this between tests that need a fresh resolution.
export function _resetPageTokenCacheForTests() {
  pageTokenCache.clear()
  pageTokenKindCache.clear()
}

async function pageAccessToken(env, acct) {
  const cached = pageTokenCache.get(acct.page_id)
  if (cached) return cached

  const dedicated = acct.fb_token_binding ? env[acct.fb_token_binding] : null
  if (dedicated) {
    pageTokenCache.set(acct.page_id, dedicated)
    pageTokenKindCache.set(acct.page_id, 'dedicated')
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
      pageTokenKindCache.set(acct.page_id, 'page-lookup')
      return page.access_token
    }
  } catch { /* try /me/accounts */ }

  try {
    const pages = await api(systemToken, 'me/accounts', { fields: 'id,access_token', limit: '100' }, 'GET')
    const page = (pages.data || []).find((candidate) => candidate.id === acct.page_id)
    if (page?.access_token) {
      pageTokenCache.set(acct.page_id, page.access_token)
      pageTokenKindCache.set(acct.page_id, 'page-lookup')
      return page.access_token
    }
  } catch { /* fall back to the assigned System User token */ }

  pageTokenCache.set(acct.page_id, systemToken)
  pageTokenKindCache.set(acct.page_id, 'system-fallback')
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

/**
 * Facebook Page crosspost of a CAROUSEL: upload each image child as an
 * UNPUBLISHED photo (published=false, carrying alt_text_custom), then attach
 * every returned photo id to one /{page-id}/feed post via attached_media —
 * SETUP.md's 2026-07-29 capability probe verified both calls live. Resumable:
 * item.facebook_photo_ids accumulates one id per uploaded child and picks up
 * where a prior run stopped, the same shape as uploadHostedFacebookReel's
 * facebook_video_id/facebook_uploaded pair.
 */
async function uploadFacebookCarouselPhotos(token, acct, item, persist, budget) {
  if (!Array.isArray(item.facebook_photo_ids)) item.facebook_photo_ids = []
  const children = item.children || []
  for (let i = item.facebook_photo_ids.length; i < children.length; i++) {
    if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted uploading Facebook carousel photos')
    const child = children[i]
    if (child.media_type === 'VIDEO') {
      throw new Error('Facebook carousel crosspost supports IMAGE children only (received a VIDEO child)')
    }
    const altText = typeof child.alt_text === 'string' && child.alt_text ? child.alt_text : null
    const { id } = await api(token, `${acct.page_id}/photos`, {
      url: child.image_url,
      published: 'false',
      ...(altText ? { alt_text_custom: altText } : {}),
    })
    item.facebook_photo_ids.push(id)
    // First upload flips facebook_status to 'building' — without this, a deferred/interrupted
    // partial upload (facebook_photo_ids non-empty, but facebook_status still 'pending'/'held')
    // was invisible to anything that only checked status, not the array. postDuePending still
    // resumes it correctly either way (see the module header), but /status and a human reading
    // KV should see "building," not "pending," once photos exist.
    if (item.facebook_photo_ids.length === 1) item.facebook_status = 'building'
    await persist()
  }
  return item.facebook_photo_ids
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

// Approximate permalink for a Facebook POSTED notification — a real permalink needs
// another Graph call (?fields=permalink_url) that isn't worth its own subrequest for a
// click target; the pageid_postid feed/photo id and the watch-URL video id both resolve on
// facebook.com as published. Pure — no network — so it never touches the budget.
function facebookPermalink(postId, mediaType) {
  if (!postId) return null
  return mediaType === 'REELS' ? `https://www.facebook.com/watch/?v=${postId}` : `https://www.facebook.com/${postId}`
}

async function publishFacebookItem(env, ev, q, item, budget) {
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
      if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted publishing Facebook image')
      const altText = typeof item.facebook_alt_text === 'string' && item.facebook_alt_text ? item.facebook_alt_text : null
      const result = await api(token, `${acct.page_id}/photos`, {
        url: item.image_url,
        message: item.facebook_caption || item.caption || '',
        published: 'true',
        ...(altText ? { alt_text_custom: altText } : {}),
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
    } else if (item.media_type === 'CAROUSEL') {
      // Unpublished multi-photo upload needs a real Page token (see pageTokenKindCache's
      // comment) — fail explicitly here rather than let /photos 400 with a generic message
      // after the first child already uploaded.
      if (pageTokenKindCache.get(acct.page_id) === 'system-fallback') {
        throw new Error(`Facebook carousel crosspost needs a Page access token for "${item.account}" — ` +
          `the System User token cannot create an unpublished photo on this Page. Set FB_${item.account.toUpperCase()}_ACCESS_TOKEN ` +
          'or grant the Page-publisher System User this Page directly (SETUP.md).')
      }
      const photoIds = await uploadFacebookCarouselPhotos(token, acct, item, () => persistQueue(env, ev, q), budget)
      if (budget && !budget.spend(1)) throw new Deferred('subrequest budget exhausted before the Facebook feed post')
      const attached = {}
      photoIds.forEach((id, i) => { attached[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }) })
      const result = await api(token, `${acct.page_id}/feed`, {
        message: item.facebook_caption || item.caption || '',
        ...attached,
      })
      postId = result.id
    } else {
      throw new Error(`Facebook Page publishing supports IMAGE, REELS and CAROUSEL here; received ${item.media_type}`)
    }

    item.facebook_status = 'posted'
    item.facebook_post_id = postId
    item.facebook_posted_at = new Date().toISOString()
    item.facebook_error = null
    await persistQueue(env, ev, q)
    if (notifiable(ev)) {
      await notify({
        topic: env.NTFY_TOPIC,
        ...postedNotification({
          albumName: shortAlbumName(item.album_name, item.album_key || item.id), channel: 'facebook',
          permalink: facebookPermalink(postId, item.media_type),
        }),
      })
    }
    return { posted: item.id, postId, pageId: acct.page_id }
  } catch (e) {
    if (e instanceof Deferred) {
      await persistQueue(env, ev, q)
      return { note: `${e.message} — resumes next run` }
    }
    item.facebook_status = 'error'
    item.facebook_error = String(e?.message || e)
    await persistQueue(env, ev, q)
    if (notifiable(ev)) {
      await notify({ topic: env.NTFY_TOPIC, ...failedNotification({
        albumName: shortAlbumName(item.album_name, item.album_key || item.id), channel: 'facebook', error: item.facebook_error,
        reviewUrl: reviewUrlFor(env.REVIEW_KEY, item.id),
      }) })
    }
    return { error: item.facebook_error }
  }
}

// Publish every still-pending destination for one campaign item. One channel's
// failure never changes the other channel's state.
async function publishItem(env, ev, q, item, budget) {
  const result = { ev, item: item.id, destinations: {} }
  if (instagramPending(item)) {
    result.destinations.instagram = await publishInstagramItem(env, ev, q, item, budget)
  }
  if (facebookPending(item)) {
    result.destinations.facebook = await publishFacebookItem(env, ev, q, item, budget)
  }
  return result
}

// True when EITHER destination has real in-progress build/upload state — not just
// status/facebook_status === 'building' (a budget deferral leaves those wherever they were,
// pending/held, so the partial-progress arrays are checked too). Shared by resumeIfBuilding
// (below) and /review's cancel eligibility (reviewCancelEligible, near renderItemCard) — a
// review-hook finding 2026-09-26: an item can have Instagram still 'held'/'pending' while
// Facebook is already 'building' (or holds photo ids with no feed post yet), and the naive
// reviewHeldNow/reviewPendingNow check alone would let that item be "cancelled" while its
// Facebook upload keeps running and completes anyway.
//
// The partial-progress clauses (2 and 4) explicitly exclude a destination that has already
// gone terminal ('error') — a second review pass caught that a Facebook upload can fail
// PARTWAY through a carousel (facebook_status -> 'error', but facebook_photo_ids stays
// non-empty and facebook_post_id stays unset forever, since errors are terminal and never
// auto-retried, see this file's own header). Without the exclusion, an item whose Facebook
// leg permanently failed would read as "still in flight" forever: /review/cancel would
// wrongly refuse to cancel its still-eligible Instagram side ("a publish is already in
// flight" — false, nothing is running), and resumeIfBuilding would keep treating it as the
// tick's resume candidate instead of letting postDuePending route it normally.
function hasInFlightProgress(it) {
  return (wantsInstagram(it) && it.status === 'building' && it.ig_container_id) ||
    (wantsInstagram(it) && it.status !== 'error' && Array.isArray(it.ig_child_container_ids) && it.ig_child_container_ids.length > 0 && !it.ig_container_id) ||
    (wantsFacebook(it) && it.facebook_status === 'building' && it.facebook_video_id) ||
    (wantsFacebook(it) && it.facebook_status !== 'error' && Array.isArray(it.facebook_photo_ids) && it.facebook_photo_ids.length > 0 && !it.facebook_post_id)
}

// Finish an in-flight container/upload for this event, if any. Returns result or null.
// Same hold/veto check as postDuePending: a container built before a veto lands must
// not be published just because it is already in flight. Also resumes a CAROUSEL that
// was deferred mid-build (some child container ids or some Facebook photo ids exist, but
// the top-level parent/feed post doesn't yet).
async function resumeIfBuilding(env, ev, budget) {
  const q = await loadQueue(env, ev); if (!q) return null
  const building = q.items.filter((it) => !holdBlock(it) && hasInFlightProgress(it))
  if (!building.length) return null
  const [item] = await routed(env, ev, q, building)
  if (!item) return null
  return publishItem(env, ev, q, item, budget)
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
async function postDuePending(env, ev, hourAllowed, budget) {
  const q = await loadQueue(env, ev); if (!q) return null
  const now = Date.now()
  const due = await routed(env, ev, q, q.items.filter((it) =>
    (instagramPending(it) || facebookPending(it)) &&
    hasMedia(it) &&
    eligibleNow(it, now, hourAllowed)))
  if (!due.length) return null
  const scheduled = due.filter((it) => it.scheduledAt).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
  const item = scheduled.length ? scheduled[0] : due[Math.floor(Math.random() * due.length)]
  return publishItem(env, ev, q, item, budget)
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
// Named notifyWebhook (not notify) so it doesn't collide with notify.mjs's notify(),
// imported above for the gallery-announce phone notifications — a different sink, a
// different shape (env+entries here vs. {topic,title,...} there), same word otherwise.
async function notifyWebhook(env, entries) {
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
  await notifyWebhook(env, real)
  return all
}

async function run(env, force = false) {
  // One budget per invocation — NEVER module-scoped (a reused isolate must not inherit an
  // earlier invocation's spent subrequests). See makeBudget's own comment.
  const budget = makeBudget(Number(env.SUBREQUEST_BUDGET) || DEFAULT_SUBREQUEST_BUDGET)
  const evs = events(env) // priority order: newest first
  // 1) Always finish any in-flight container first (counts as this run's post).
  for (const ev of evs) { const r = await resumeIfBuilding(env, ev, budget); if (r) return [r] }
  // 2) Fresh post. Scheduled items gate on their own scheduledAt (any hour);
  //    legacy items gate on the allowed-hour slot. force=1 opens the slot for
  //    legacy items but never overrides a scheduled item's future scheduledAt.
  const hourAllowed = force || allowedHours(env).includes(new Date().getUTCHours())
  for (const ev of evs) { const r = await postDuePending(env, ev, hourAllowed, budget); if (r) return [r] }
  return [{ note: 'nothing due in any active event' }]
}

// ============================================= /review (2026-09-26) ==============
// Server-rendered review + one-tap cancel for held/pending gallery-announce items —
// the answer to "where do I go to see what's on hold to post" (Nino, 2026-09-26):
// /status is JSON behind TRIGGER_KEY and queue/gallery-announce.json shows neither
// the photos nor the caption; this renders both, plus a Cancel button that vetoes
// through the exact same veto() function seed-kv.mjs --veto uses (see
// veto-shape.mjs), so there is one veto format, not two.
//
// Auth is its own secret, REVIEW_KEY — never TRIGGER_KEY, and never able to reach
// /run — view + cancel only. Constant-time compare via a fixed-length XOR loop
// rather than Node's crypto.timingSafeEqual (unavailable under `node --test`, and
// this file has to run identically there and in the Worker — no nodejs_compat).
// Every response is Cache-Control: no-store: the page shows unposted photos of
// minors, and a shared/CDN cache must never hold a copy.

function safeEqual(a, b) {
  const sa = typeof a === 'string' ? a : ''
  const sb = typeof b === 'string' ? b : ''
  const len = Math.max(sa.length, sb.length, 1)
  let diff = sa.length ^ sb.length
  for (let i = 0; i < len; i++) diff |= (sa.charCodeAt(i) || 0) ^ (sb.charCodeAt(i) || 0)
  return diff === 0
}

// Missing/empty REVIEW_KEY always refuses — an unset secret must never read as "any key matches".
function authorizedReview(env, key) {
  return typeof env.REVIEW_KEY === 'string' && env.REVIEW_KEY.length > 0 && safeEqual(key, env.REVIEW_KEY)
}

const NO_STORE = { 'cache-control': 'no-store' }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function itemAccountLabel(it) {
  return ACCOUNTS[it.account]?.handle || it.account || 'unknown account'
}

function itemStatusLabel(it) {
  if (reviewHeldNow(it)) return 'Held'
  if (reviewPendingNow(it)) return 'Pending'
  return { posted: 'Posted', vetoed: 'Vetoed', building: 'Building', error: 'Error' }[it.status] || it.status || 'unknown'
}

function renderSlide(child, i) {
  return `<figure class="slide"><img src="${esc(child.image_url)}" alt="${esc(child.alt_text || '')}" loading="lazy">` +
    `<figcaption>#${i + 1}${child.alt_text ? ` — ${esc(child.alt_text)}` : ''}</figcaption></figure>`
}

function renderItemCard(it, { reviewKey }) {
  const canCancel = reviewCancelEligible(it)
  const slides = (it.children || []).map(renderSlide).join('\n')
  const fbCaptionBlock = it.facebook_caption && it.facebook_caption !== it.caption
    ? `<div class="caption"><h3>Facebook caption</h3><pre>${esc(it.facebook_caption)}</pre></div>` : ''
  // The next posting slot is item.scheduledAt itself, not a re-derived guess — that field is
  // exactly what eligibleNow() in this file gates the real publish on (see build-gallery-
  // announce.mjs's own comment on why it no longer equals holdUntil), so this can never show
  // a time the Worker doesn't agree with. Shown only while the item can still be cancelled —
  // a posted/vetoed item's scheduledAt is history, not a promise.
  const nextSlot = canCancel ? it.scheduledAt : null
  return `<section class="item" id="${esc(it.id)}">
  <header>
    <h2>${esc(it.album_name || it.album_key || it.id)}</h2>
    <span class="badge badge-${esc(it.status || 'unknown')}">${esc(itemStatusLabel(it))}</span>
  </header>
  <div class="meta">
    <div>Account: <strong>${esc(itemAccountLabel(it))}</strong>${Array.isArray(it.collaborators) && it.collaborators.length ? ` &middot; Collab: ${esc(it.collaborators.join(', '))}` : ''}</div>
    ${it.holdUntil ? `<div>Hold until: ${esc(chicagoLabel(it.holdUntil))}</div>` : ''}
    ${nextSlot ? `<div>Next posting slot: ${esc(chicagoLabel(nextSlot))}</div>` : ''}
  </div>
  <div class="slides">${slides}</div>
  <div class="caption"><h3>Instagram caption</h3><pre>${esc(it.caption || '')}</pre></div>
  ${fbCaptionBlock}
  ${canCancel ? `<form method="POST" action="/review/cancel">
    <input type="hidden" name="key" value="${esc(reviewKey)}">
    <input type="hidden" name="id" value="${esc(it.id)}">
    <button type="submit" class="cancel">Cancel this post</button>
  </form>` : ''}
</section>`
}

function renderReviewPage({ queue, key }) {
  const items = queue?.items || []
  const primary = items.filter((it) => reviewHeldNow(it) || reviewPendingNow(it))
  const secondary = items.filter((it) => !reviewHeldNow(it) && !reviewPendingNow(it)).slice(-5)
  const opts = { reviewKey: key }
  const primaryHtml = primary.length
    ? primary.map((it) => renderItemCard(it, opts)).join('\n')
    : '<p class="empty">Nothing held or pending.</p>'
  const secondaryHtml = secondary.length
    ? `<details><summary>Recent posted / vetoed / error (${secondary.length})</summary>${secondary.map((it) => renderItemCard(it, opts)).join('\n')}</details>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gallery review</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: #14161a; color: #e6e6e6;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
h1 { font-size: 18px; margin: 0 0 16px; }
h2 { font-size: 16px; margin: 0; }
h3 { font-size: 12px; margin: 12px 0 4px; color: #9aa0a6; text-transform: uppercase; letter-spacing: .04em; }
section.item { background: #1c1f24; border: 1px solid #2a2e35; border-radius: 10px;
  padding: 14px; margin: 0 0 16px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #333; white-space: nowrap; }
.badge-held { background: #4a3b1a; color: #ffcf6a; }
.badge-pending { background: #1a3b4a; color: #6ad4ff; }
.badge-posted { background: #1a4a24; color: #7dffa0; }
.badge-vetoed { background: #4a1a1a; color: #ff8a8a; }
.badge-error { background: #4a1a1a; color: #ff8a8a; }
.badge-building { background: #33301a; color: #e8d97a; }
.meta { font-size: 13px; color: #b7bcc4; margin-bottom: 10px; }
.meta div { margin: 2px 0; }
.slides { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; margin-bottom: 8px; }
figure.slide { margin: 0; }
figure.slide img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; display: block; background: #000; }
figcaption { font-size: 10px; color: #8b9099; margin-top: 3px; }
pre { white-space: pre-wrap; word-break: break-word; font: 13px/1.5 -apple-system, sans-serif; margin: 0; color: #d8dade; }
.empty { color: #8b9099; }
form { margin-top: 10px; }
button.cancel { width: 100%; padding: 12px; border: 1px solid #5a2020; background: #2a1414;
  color: #ff8a8a; border-radius: 8px; font-size: 15px; font-weight: 600; -webkit-appearance: none; }
details summary { cursor: pointer; color: #9aa0a6; margin: 8px 0; }
</style>
</head>
<body>
<h1>Gallery announcements &mdash; review</h1>
${primaryHtml}
${secondaryHtml}
</body>
</html>`
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
        const q = await loadQueue(env, ev)
        if (!q) { out.events[ev] = 'no queue'; continue }
        const by = (s) => q.items.filter((i) => i.status === s).length
        const facebookItems = q.items.filter(wantsFacebook)
        const facebookBy = (s) => facebookItems.filter((i) => (i.facebook_status || 'pending') === s).length
        const entry = queueRoute(q, ev)
        // held vs pending: item.status STAYS the literal string 'held' after holdUntil passes
        // — nothing flips it back (see hold-shape.mjs's own header) — so counting by that
        // string alone would report an elapsed, about-to-publish hold as still held. isHeld()
        // is the same still-blocked check the publishers themselves use; "pending" here means
        // "would be picked up by the next tick," which includes an elapsed hold.
        const heldNow = (i) => i.status === 'held' && isHeld(i)
        const pendingNow = (i) => i.status === 'pending' || (i.status === 'held' && !isHeld(i))
        const facebookHeldNow = (i) => (i.facebook_status || 'pending') === 'held' && isHeld(i)
        const facebookPendingNow = (i) => (i.facebook_status || 'pending') === 'pending' || ((i.facebook_status || 'pending') === 'held' && !isHeld(i))
        out.events[ev] = { total: q.items.length, posted: by('posted'),
          pending: q.items.filter(pendingNow).length,
          held: q.items.filter(heldNow).length,
          heldItems: q.items.filter(heldNow).map((i) => ({ id: i.id, holdUntil: i.holdUntil })),
          building: by('building'), error: by('error'),
          route: entry ? { approved: entry.approved, accounts: entry.accounts, expires: entry.expires ?? null }
            : q.meta?.route ? 'incomplete' : 'none',
          route_refused: q.items.filter((i) => i.route_error).length,
          errors: q.items.filter((i) => i.status === 'error').map((i) => ({ id: i.id, err: i.error })),
          facebook: {
            enabled: facebookItems.length,
            posted: facebookBy('posted'),
            pending: facebookItems.filter(facebookPendingNow).length,
            held: facebookItems.filter(facebookHeldNow).length,
            heldItems: facebookItems.filter(facebookHeldNow).map((i) => ({ id: i.id, holdUntil: i.holdUntil })),
            building: facebookBy('building'),
            error: facebookBy('error'),
            errors: facebookItems
              .filter((i) => i.facebook_status === 'error')
              .map((i) => ({ id: i.id, err: i.facebook_error })),
          } }
      }
      return Response.json(out)
    }
    if (url.pathname === '/review') {
      if (req.method !== 'GET' || !authorizedReview(env, url.searchParams.get('key'))) {
        return new Response('forbidden', { status: 403, headers: NO_STORE })
      }
      const q = await loadQueue(env, 'gallery-announce')
      const html = renderReviewPage({ queue: q, key: url.searchParams.get('key') })
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } })
    }
    if (url.pathname === '/review/cancel') {
      if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: NO_STORE })
      // Two input shapes, both accepted: the review page's own HTML form POST (key/id in the
      // body), and ntfy's one-tap Cancel action (an `http` action sends no form content-type,
      // so key/id ride the URL query string instead — see notify.mjs's reviewCancelUrlFor).
      // The query-string shape is the API-style call (no browser to redirect), so it gets a
      // fast plain-text response; the form shape redirects back to /review so a tap in the
      // page itself lands on the now-updated list.
      const viaQuery = url.searchParams.has('id')
      let key = null; let id = null; let reason = null
      if (viaQuery) {
        key = url.searchParams.get('key'); id = url.searchParams.get('id'); reason = url.searchParams.get('reason')
      } else {
        let form = null
        try { form = await req.formData() } catch { form = null }
        key = form?.get('key') ?? null; id = form?.get('id') ?? null; reason = form?.get('reason') ?? null
      }
      if (!authorizedReview(env, key)) return new Response('forbidden', { status: 403, headers: NO_STORE })
      if (!id) return new Response('missing id', { status: 400, headers: NO_STORE })

      // KV has no compare-and-set (same limit seed-kv.mjs's own --put documents), and this
      // handler reads the whole queue, mutates it, and writes the whole queue back — exactly
      // like the hourly publish run does. A cancel landing while a run is mid-publish can
      // revert whatever that run already saved (a posted receipt, a partial carousel build),
      // which then either loses that state or, worse, un-does the cancel itself. Two guards,
      // NEITHER of which closes the race (found in code review 2026-09-26 — stated precisely,
      // not just "narrows it", after a second review pass showed the first draft of this
      // comment overclaimed what guard 2 actually catches):
      //   1. Refuse inside the same :55-:05 tick window seed-kv.mjs's --put already refuses in.
      //      This is a heuristic, not a guarantee: a slow carousel build (multiple container
      //      polls, retries with 8s sleeps) can still be running well past :05, and a manual
      //      /run?force=1 can start at any minute this window doesn't cover at all.
      //   2. Re-read the queue immediately before persisting and refuse if it changed since the
      //      first read. This only catches a write that lands in the microseconds between
      //      THIS handler's own two reads — it does NOT detect a run that read the queue
      //      before this request started and is still working (and will write) after this
      //      check passes; both of this handler's reads see the same stale value in that case,
      //      and the run's later write silently reverts the cancel. Closing that fully would
      //      need a run-in-progress marker in KV that /review/cancel refuses against, not
      //      implemented here.
      const minute = new Date().getUTCMinutes()
      if (minute >= 55 || minute < 5) {
        return new Response('try again in a few minutes — the hourly publish run may be active (retry after :05)', { status: 409, headers: NO_STORE })
      }

      const q = await loadQueue(env, 'gallery-announce')
      if (!q) return new Response('no gallery-announce queue', { status: 404, headers: NO_STORE })
      // Response.redirect()'s result carries only Location — built by hand instead so the
      // no-store guarantee covers this response too (Location alone isn't sensitive, but the
      // rule is every /review* response, no exceptions to remember later).
      const redirectBack = () => new Response(null, {
        status: 303,
        headers: { location: `${url.origin}/review?key=${encodeURIComponent(key)}#${encodeURIComponent(id)}`, ...NO_STORE },
      })

      const existing = q.items.find((it) => it.id === id)
      if (existing?.status === 'vetoed') {
        // Idempotent: a retried tap (or the ntfy action firing twice) is a no-op — no KV
        // write, no second VETOED alert.
        return viaQuery ? new Response('already cancelled', { status: 200, headers: NO_STORE }) : redirectBack()
      }
      // Same eligibility the page itself shows a Cancel button for (reviewHeldNow/
      // reviewPendingNow) — veto() alone only refuses an already-POSTED item, which would
      // still let this accept a `building` item (mid-publish right now) or a terminal `error`.
      // Cancelling an in-flight item is the worst case of the race above: it reports success
      // and the item almost always publishes anyway, because the in-flight run's own next
      // write overwrites the veto this request just made. reviewCancelEligible() checks BOTH
      // destinations' progress, not just the (Instagram) `status` field alone — a dual-
      // destination item can be Instagram-'held' while Facebook is already 'building'.
      if (existing && !reviewCancelEligible(existing)) {
        const why = hasInFlightProgress(existing) ? 'a publish is already in flight for it' : `item is "${existing.status}", not held or pending`
        return new Response(`not eligible to cancel — ${why}`, { status: 400, headers: NO_STORE })
      }

      const result = veto(q, [id], reason || 'cancelled from /review')
      if (result.refused) return new Response(result.refused, { status: 400, headers: NO_STORE })
      if (JSON.stringify(await loadQueue(env, 'gallery-announce')) !== JSON.stringify(q)) {
        return new Response('the queue changed since this request read it (a publish run likely wrote to it) — reload /review and try again', { status: 409, headers: NO_STORE })
      }
      await persistQueue(env, 'gallery-announce', result.queue)

      const vetoedItem = result.queue.items.find((it) => it.id === id)
      if (env.NTFY_TOPIC) {
        await notify({
          topic: env.NTFY_TOPIC,
          ...vetoedNotification({
            albumName: shortAlbumName(vetoedItem?.album_name, vetoedItem?.album_key || id),
            reason: reason || 'cancelled from /review',
            localOnly: false,
          }),
        })
      }
      return viaQuery ? new Response('cancelled', { status: 200, headers: NO_STORE }) : redirectBack()
    }
    return new Response('letspepper-reels-worker')
  },
}
