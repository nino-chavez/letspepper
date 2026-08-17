/**
 * Publish due posts to Instagram via the Graph API — multi-account, with
 * user-tagging and Collab co-author invites. Owned pipeline, no third-party.
 *
 *   IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \
 *   node scripts/social-publish/post-reels.mjs --event bell-pepper-2026 --count 2
 *
 * Auth model: one 60-day Instagram System User token issued from the Almost
 * Flickday Business Manager, which owns every account in accounts.json. Page
 * publishing uses a separate System User and Worker secret. Each Instagram
 * account is addressed by its numeric ig_user_id (resolved into accounts.json
 * — see SETUP.md). Host is graph.facebook.com (Business path), NOT
 * graph.instagram.com (that's the single-account Instagram-Login path).
 *
 * Per queue item (see build-queue.mjs):
 *   account        slug into accounts.json (e.g. "letspepper")
 *   media_type     REELS | IMAGE | CAROUSEL | STORIES
 *   video_url      REELS / STORIES video / carousel video child
 *   image_url      IMAGE / STORIES image / carousel image child
 *   children       [{media_type,image_url|video_url}, ...]  (CAROUSEL only)
 *   caption        post caption
 *   user_tags      ["username", ...] or [{username,x,y}, ...]   real Graph API
 *                  tags (not caption mentions) — IGNORED on STORIES (Graph API
 *                  has no caption/tag support for Stories, media only). On a
 *                  single IMAGE, tagParams() defaults bare usernames to a
 *                  dead-center (0.5, 0.5) position — pass {username,x,y} for
 *                  a precise spot. CAROUSEL/REELS take bare usernames as-is.
 *   collaborators  ["username", ...]      send Collab co-author invites
 *
 * Flags: --count N (default 2) · --account slug (override) · --id <item-id>
 *        (publish only that queue item) · --force · --dry-run
 *
 * Flow (Graph API v25.0):
 *   POST /{ig}/media  (build container; carousel = children first) → creation_id
 *   GET  /{container}?fields=status_code   poll until FINISHED (every type —
 *        image containers race too: publishing one before it's ready throws
 *        "Media ID is not available")
 *   POST /{ig}/media_publish  creation_id  → media id
 * Queue persisted after every item so a crash never double-posts.
 *
 * NOTE: `collaborators` is community-confirmed but absent from Meta's main
 * publishing doc excerpt — verify on first live call; on rejection the item
 * is marked error with the API message rather than silently dropping the tag.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const HERE = dirname(fileURLToPath(import.meta.url))
const GRAPH = process.env.GRAPH_BASE || 'https://graph.facebook.com/v25.0'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, [])
)
const event = args.event
const count = Number(args.count ?? 2)
const force = !!args.force
const dryRun = !!args['dry-run']
const accountOverride = typeof args.account === 'string' ? args.account : null
const idFilter = typeof args.id === 'string' ? args.id : null

const TOKEN = process.env.IG_ACCESS_TOKEN
if (!event) { console.error('Required: --event <slug>'); process.exit(1) }
if (!dryRun && !TOKEN) { console.error('Set IG_ACCESS_TOKEN (System User token — see SETUP.md).'); process.exit(1) }

const registry = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts
const queuePath = join(HERE, 'queue', `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }
const q = JSON.parse(readFileSync(queuePath, 'utf8'))
const save = () => writeFileSync(queuePath, JSON.stringify(q, null, 2))

// Refuse to publish when the current caption queue breaks its reader contract.
// This runs before the first Graph API call and audits only JSON caption fields.
execFileSync('node', [join(HERE, '..', '..', 'tools', 'lib', 'encounter-audit.mjs'),
  `--root=${join(HERE, '..', '..')}`, '--surface=social publishing queue', '--strict'],
  { stdio: 'inherit' })

function igIdFor(item) {
  const slug = accountOverride || item.account
  const acct = registry[slug]
  if (!acct) throw new Error(`unknown account "${slug}" (not in accounts.json)`)
  if (!acct.ig_user_id) throw new Error(`accounts.json: ${slug}.ig_user_id is null — resolve it (SETUP.md)`)
  return acct.ig_user_id
}

const now = Date.now()
const ready = (it) => it.status !== 'posted' &&
  (it.media_type === 'CAROUSEL' ? Array.isArray(it.children) && it.children.length : (it.video_url || it.image_url))
const due = q.items.filter((it) => ready(it) && (!idFilter || it.id === idFilter) &&
  (force || new Date(it.scheduledAt).getTime() <= now))

if (!due.length) {
  if (idFilter) { console.error(`No due item with id "${idFilter}" (missing, already posted, or not hosted).`); process.exit(1) }
  const remaining = q.items.filter((it) => it.status !== 'posted')
  const notReady = remaining.filter((it) => !ready(it)).length
  if (!remaining.length) console.log('Queue empty — all posted.')
  else if (notReady) console.log(`Nothing due: ${notReady} item(s) not yet hosted — run upload-r2.mjs.`)
  else console.log(`Nothing due. Next: ${remaining[0].id} at ${remaining[0].scheduledAt}`)
  process.exit(0)
}

async function api(path, params, method = 'POST') {
  const url = new URL(`${GRAPH}/${path}`)
  const body = new URLSearchParams({ ...params, access_token: TOKEN })
  const res = method === 'GET' ? await fetch(`${url}?${body}`) : await fetch(url, { method, body })
  const json = await res.json()
  if (!res.ok || json.error) {
    // json.error.message alone is often generic ("Invalid parameter") — the
    // actionable text (e.g. "User tag positions are required for image.") is
    // in error_user_msg. Surface both so a failure is diagnosable without a
    // manual curl round-trip.
    const { message, error_user_msg: userMsg } = json.error || {}
    throw new Error([message, userMsg].filter(Boolean).join(' — ') || JSON.stringify(json))
  }
  return json
}

async function waitFinished(containerId) {
  for (let i = 0; i < 60; i++) {
    const { status_code } = await api(`${containerId}`, { fields: 'status_code' }, 'GET')
    if (status_code === 'FINISHED') return
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`)
    await sleep(5000)
  }
  throw new Error('container not ready after 5 min')
}

// media_publish reliably throws Meta's generic "unexpected error, please retry"
// on the FIRST attempt for some accounts, then succeeds on a retry. Without this
// the drip fails every post and only retries on the next hourly run (or stalls if
// the laptop slept). Retry the transient error in-run with backoff; let real
// errors (bad container, permissions) surface immediately.
async function publishWithRetry(ig, creationId, attempts = 5) {
  for (let i = 0; ; i++) {
    try {
      return await api(`${ig}/media_publish`, { creation_id: creationId })
    } catch (e) {
      const transient = /unexpected error|please retry|temporar|try again|media id is not available/i.test(e.message)
      if (i >= attempts - 1 || !transient) throw e
      await sleep(8000 * (i + 1))
    }
  }
}

// optional cross-account params shared by single + carousel-parent containers.
// A single feed IMAGE tag REQUIRES x/y (fractional position on the photo) —
// verified live 2026-07-20: omitting it 400s with error_subcode 2207063
// ("User tag positions are required for image."). CAROUSEL/REELS tags don't
// pin to a point on a photo, so no coordinates needed there. Default bare
// usernames to dead-center (0.5, 0.5) on IMAGE; pass {username,x,y} in
// user_tags for a precise position instead.
function tagParams(it) {
  const p = {}
  if (Array.isArray(it.user_tags) && it.user_tags.length)
    p.user_tags = JSON.stringify(it.user_tags.map((u) => {
      if (typeof u !== 'string') return u
      return it.media_type === 'IMAGE' ? { username: u, x: 0.5, y: 0.5 } : { username: u }
    }))
  if (Array.isArray(it.collaborators) && it.collaborators.length)
    p.collaborators = JSON.stringify(it.collaborators)
  return p
}

async function buildContainer(ig, it) {
  if (it.media_type === 'CAROUSEL') {
    const childIds = []
    for (const child of it.children) {
      const base = child.media_type === 'VIDEO'
        ? { media_type: 'VIDEO', video_url: child.video_url }
        : { image_url: child.image_url }
      const { id } = await api(`${ig}/media`, { ...base, is_carousel_item: 'true' })
      if (child.media_type === 'VIDEO') await waitFinished(id)
      childIds.push(id)
    }
    const { id } = await api(`${ig}/media`, {
      media_type: 'CAROUSEL', children: childIds.join(','), caption: it.caption, ...tagParams(it),
    })
    return id
  }
  if (it.media_type === 'IMAGE') {
    const { id } = await api(`${ig}/media`, { image_url: it.image_url, caption: it.caption, ...tagParams(it) })
    return id
  }
  if (it.media_type === 'STORIES') {
    // Stories containers take no caption/user_tags — media only (Graph v16+).
    const media = it.video_url ? { video_url: it.video_url } : { image_url: it.image_url }
    const { id } = await api(`${ig}/media`, { media_type: 'STORIES', ...media })
    return id
  }
  // REELS (default)
  const { id } = await api(`${ig}/media`, {
    media_type: 'REELS', video_url: it.video_url, caption: it.caption, share_to_feed: 'true', ...tagParams(it),
  })
  return id
}

const batch = due.slice(0, count)
console.log(`${dryRun ? '[dry-run] ' : ''}Publishing ${batch.length} of ${due.length} due items...\n`)

let ok = 0
for (const it of batch) {
  const slug = accountOverride || it.account
  if (dryRun) {
    console.log(`would post: ${it.id} → @${registry[slug]?.handle || slug} [${it.media_type || 'REELS'}]` +
      `${it.collaborators?.length ? ` collab:${it.collaborators.join(',')}` : ''}` +
      `${it.user_tags?.length ? ` tags:${it.user_tags.join(',')}` : ''}`)
    continue
  }
  try {
    const ig = igIdFor(it)
    process.stdout.write(`→ ${it.id} (@${registry[slug].handle}) ... `)
    // Reuse a prior failed run's container — a "failed" media_publish can still
    // land on Meta's side, and rebuilding a fresh container is how the Worker's
    // 2026-06-14 duplicate happened. Same creation_id retries are idempotent.
    let containerId = it.ig_container_id ?? null
    if (containerId) {
      const status = await api(`${containerId}`, { fields: 'status_code' }, 'GET')
        .then((r) => r.status_code).catch(() => null)
      if (status === 'PUBLISHED') {
        it.status = 'posted'; it.posted_at = new Date().toISOString()
        it.error = 'published by a prior run — ig_media_id unknown, reconcile via GET /{ig}/media'
        save(); console.log('already published by a prior run — marked posted'); ok++
        continue
      }
      if (status !== 'FINISHED' && status !== 'IN_PROGRESS') containerId = null // expired/errored — rebuild
    }
    if (!containerId) {
      containerId = await buildContainer(ig, it)
      it.ig_container_id = containerId; save()
    }
    await waitFinished(containerId)
    const { id: mediaId } = await publishWithRetry(ig, containerId)
    it.status = 'posted'; it.ig_media_id = mediaId; it.posted_at = new Date().toISOString(); it.error = null
    save()
    console.log(`posted (media ${mediaId})`)
    ok++
  } catch (e) {
    it.status = 'error'; it.error = e.message; save()
    console.error(`FAILED: ${e.message}`)
  }
}
if (!dryRun) console.log(`\n${ok}/${batch.length} posted. ${q.items.filter((i) => i.status !== 'posted').length} remaining.`)
