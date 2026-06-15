/**
 * Publish due posts to Instagram via the Graph API — multi-account, with
 * user-tagging and Collab co-author invites. Owned pipeline, no third-party.
 *
 *   IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \
 *   node scripts/social-publish/post-reels.mjs --event bell-pepper-2026 --count 2
 *
 * Auth model: ONE System User token (non-expiring) issued from the Almost
 * Flickday Business Manager, which owns every account in accounts.json. Each
 * account is addressed by its numeric ig_user_id (resolved into accounts.json
 * — see SETUP.md). Host is graph.facebook.com (Business path), NOT
 * graph.instagram.com (that's the single-account Instagram-Login path).
 *
 * Per queue item (see build-queue.mjs):
 *   account        slug into accounts.json (e.g. "letspepper")
 *   media_type     REELS | IMAGE | CAROUSEL
 *   video_url      REELS / carousel video child
 *   image_url      IMAGE / carousel image child
 *   children       [{media_type,image_url|video_url}, ...]  (CAROUSEL only)
 *   caption        post caption
 *   user_tags      ["username", ...]      tag owned accounts in the post
 *   collaborators  ["username", ...]      send Collab co-author invites
 *
 * Flags: --count N (default 2) · --account slug (override) · --force · --dry-run
 *
 * Flow (Graph API v25.0):
 *   POST /{ig}/media  (build container; carousel = children first) → creation_id
 *   GET  /{container}?fields=status_code   poll until FINISHED (video only)
 *   POST /{ig}/media_publish  creation_id  → media id
 * Queue persisted after every item so a crash never double-posts.
 *
 * NOTE: `collaborators` is community-confirmed but absent from Meta's main
 * publishing doc excerpt — verify on first live call; on rejection the item
 * is marked error with the API message rather than silently dropping the tag.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

const TOKEN = process.env.IG_ACCESS_TOKEN
if (!event) { console.error('Required: --event <slug>'); process.exit(1) }
if (!dryRun && !TOKEN) { console.error('Set IG_ACCESS_TOKEN (System User token — see SETUP.md).'); process.exit(1) }

const registry = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts
const queuePath = join(HERE, 'queue', `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }
const q = JSON.parse(readFileSync(queuePath, 'utf8'))
const save = () => writeFileSync(queuePath, JSON.stringify(q, null, 2))

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
const due = q.items.filter((it) => ready(it) && (force || new Date(it.scheduledAt).getTime() <= now))

if (!due.length) {
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
  if (!res.ok || json.error) throw new Error(json.error?.message || JSON.stringify(json))
  return json
}

async function waitFinished(containerId) {
  for (let i = 0; i < 60; i++) {
    await sleep(5000)
    const { status_code } = await api(`${containerId}`, { fields: 'status_code' }, 'GET')
    if (status_code === 'FINISHED') return
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${status_code}`)
  }
  throw new Error('container not ready after 5 min')
}

// optional cross-account params shared by single + carousel-parent containers
function tagParams(it) {
  const p = {}
  if (Array.isArray(it.user_tags) && it.user_tags.length)
    p.user_tags = JSON.stringify(it.user_tags.map((u) => (typeof u === 'string' ? { username: u } : u)))
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
  // REELS (default)
  const { id } = await api(`${ig}/media`, {
    media_type: 'REELS', video_url: it.video_url, caption: it.caption, share_to_feed: 'true', ...tagParams(it),
  })
  await waitFinished(id)
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
    const containerId = await buildContainer(ig, it)
    it.ig_container_id = containerId; save()
    const { id: mediaId } = await api(`${ig}/media_publish`, { creation_id: containerId })
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
