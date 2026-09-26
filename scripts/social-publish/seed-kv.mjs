/**
 * Seed a campaign queue into the scheduled Worker's KV, carrying its route.
 *
 *   node scripts/social-publish/seed-kv.mjs --event <slug>                  # preview: write queue/<slug>.kv.json only
 *   node scripts/social-publish/seed-kv.mjs --event <slug> --put            # and write it to production KV
 *   node scripts/social-publish/seed-kv.mjs --event <slug> --replace --put  # push changed local content (new items, relinked media)
 *   node scripts/social-publish/seed-kv.mjs --event <slug> --append --put   # merge NEW local items into the live queue, none touched
 *   node scripts/social-publish/seed-kv.mjs --event <slug> --revive a,b --put  # re-open items the Worker refused for want of a route
 *
 * The Worker publishes an item only when its queue carries `meta.route`. This
 * script is the one thing that writes that block, and it copies it from the
 * event's entry in the tracked graph-routes.json. With no complete entry, or one
 * that has expired or does not name every account the queue publishes to, it
 * refuses and writes nothing: the approval lives in the tracked file, and KV
 * holds a copy of it. Hand-writing `meta.route` into a KV value forges one.
 *
 * KV, not queue/<slug>.json, is the record of what the Worker has published.
 * So the live key is read first, and when it exists the route is stamped onto
 * the LIVE queue with its items untouched. --replace pushes the local file's
 * content instead, and is refused if that would drop any publish state the
 * Worker recorded (posted, building, error, a container or upload id): with a
 * valid route on it, a queue that forgot an item was posted would post it again.
 * --append is for a standing campaign that grows one item at a time
 * (build-gallery-announce.mjs appends locally as each new album publishes):
 * every existing live item is kept exactly as the Worker recorded it, and only
 * ids the live queue does not have yet are added — appendPayload() never needs
 * lostState()'s refusal, because it never overwrites a Worker-recorded item.
 * KV has no compare-and-set, so --put also refuses within five minutes of the
 * hourly tick and re-reads the key just before writing. That narrows the race
 * with a Worker run (scheduled, or /run over HTTP) to milliseconds; it does not
 * close it.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadRoutes, REFUSED } from './route-gate.mjs'
import { standingEntry, inDate, entryCovers } from './route-shape.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const WRANGLER_CONFIG = join(HERE, 'worker', 'wrangler.jsonc')

/**
 * The KV value for `event`: the queue with `meta.route` copied from its
 * standing entry. Returns { payload } or { refused: <why> }.
 */
export function seedPayload(queue, event, routes, now = new Date()) {
  const entry = standingEntry(event, routes)
  if (!entry) return { refused: `"${event}" has no complete entry in graph-routes.json (reason, approved YYYY-MM-DD, accounts[], optional expires).` }
  if (!inDate(entry, now)) return { refused: `the graph-routes.json entry for "${event}" expired ${entry.expires}.` }
  const accounts = [...new Set((queue.items || []).map((it) => it.account))]
  const unlisted = accounts.filter((a) => !entryCovers(entry, [a], now))
  if (unlisted.length) return { refused: `the graph-routes.json entry for "${event}" does not list ${unlisted.map((a) => `"${a}"`).join(', ')}.` }
  const { reason, approved, accounts: approvedAccounts, expires } = entry
  const route = { reason, approved, accounts: [...approvedAccounts], ...(expires === undefined ? {} : { expires }) }
  return { payload: { ...queue, meta: { ...queue.meta, route } } }
}

// The fields the Worker writes as it publishes. Only KV holds them.
const PUBLISH_STATE = ['status', 'ig_container_id', 'ig_media_id', 'facebook_status', 'facebook_video_id',
  'facebook_uploaded', 'facebook_post_id', 'facebook_photo_ids']
const STARTED = new Set(['posted', 'building', 'error'])
const started = (it) => STARTED.has(it.status) || STARTED.has(it.facebook_status) || !!it.ig_container_id ||
  !!it.facebook_video_id || (Array.isArray(it.facebook_photo_ids) && it.facebook_photo_ids.length > 0)

/** Ids of live items the Worker has started on whose publish state `local` would drop or change. */
export function lostState(live, local) {
  const byId = new Map((local.items || []).map((it) => [it.id, it]))
  return (live.items || []).filter((it) => started(it) && PUBLISH_STATE.some((k) => byId.get(it.id)?.[k] !== it[k])).map((it) => it.id)
}

/**
 * Merge new local items into the live queue without touching a single field the
 * Worker already recorded on an existing item. Built for a standing, growing
 * campaign like gallery-announce: build-gallery-announce.mjs appends one item to
 * the LOCAL file per album, and this is how those new items reach KV — the
 * Worker's only record of what it has published — without the all-or-nothing
 * choice `--replace` forces (which lostState() refuses the moment ANY item in
 * the campaign has posted). Live items are returned untouched, in their
 * existing order; new local items (ids not already live) are appended after
 * them, in the order they appear locally. An id present in both is left as the
 * live copy — this never overwrites a Worker-recorded item, so it never needs
 * lostState()'s refusal.
 */
export function appendPayload(live, local) {
  const liveItems = live?.items || []
  const liveIds = new Set(liveItems.map((it) => it.id))
  const added = (local?.items || []).filter((it) => !liveIds.has(it.id))
  return { queue: { ...live, items: [...liveItems, ...added] }, added: added.map((it) => it.id) }
}

/**
 * Re-open items the Worker refused for want of a route: each destination the
 * refusal closed goes back to pending. Only route refusals — a Graph error stays
 * terminal. Returns { queue } or { refused: <why> }.
 */
export function revive(queue, ids) {
  const next = structuredClone(queue)
  const unknown = ids.filter((id) => !next.items.some((it) => it.id === id && it.route_error))
  if (unknown.length) return { refused: `not route-refused in the live queue: ${unknown.join(', ')}.` }
  for (const it of next.items.filter((i) => ids.includes(i.id))) {
    if (it.status === 'error' && it.error === it.route_error) { it.status = 'pending'; it.error = null }
    if (it.facebook_status === 'error' && it.facebook_error === it.route_error) { it.facebook_status = 'pending'; it.facebook_error = null }
    delete it.route_error
  }
  return { queue: next }
}

function wrangler(args, opts = {}) {
  return execFileSync('npx', ['wrangler', 'kv', 'key', ...args, '--binding=QUEUE', `--config=${WRANGLER_CONFIG}`, '--remote'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
}

// The Worker's copy, or null when the key does not exist. Any other failure stops the run: not knowing is not "empty".
function readLive(event) {
  try { return JSON.parse(wrangler(['get', event])) } catch (e) {
    if (/404: Not Found/.test(`${e.stdout}${e.stderr}`)) return null
    throw new Error(`could not read KV key "${event}", so could not tell what the Worker has already published: ${e.message}`)
  }
}

function refuse(why) {
  console.error(`REFUSED — ${why} Nothing was written.`)
  process.exit(REFUSED)
}

function main() {
  const argv = process.argv.slice(2)
  const value = (flag) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined }
  const event = value('--event')
  const reviveIds = argv.includes('--revive') ? (value('--revive') || '').split(',').map((s) => s.trim()).filter(Boolean) : null
  const append = argv.includes('--append')
  if (!event || (reviveIds && !reviveIds.length)) { console.error('Required: --event <slug> [--replace | --append | --revive <id,id>] [--put]'); process.exit(1) }
  if (reviveIds && argv.includes('--replace')) { console.error('--revive works on the live queue; --replace pushes the local one. Pick one.'); process.exit(1) }
  if (append && (reviveIds || argv.includes('--replace'))) { console.error('--append only merges new local items into the live queue; pick one of --append / --replace / --revive.'); process.exit(1) }

  const routes = loadRoutes()
  // The approval is checked before anything is read from Cloudflare; seedPayload re-checks it against the queue's accounts.
  if (!standingEntry(event, routes)) refuse(seedPayload({ items: [] }, event, routes).refused)
  const live = readLive(event)
  let queue
  let addedIds = null
  if (reviveIds) {
    if (!live) refuse(`KV has no key "${event}" to revive items in.`)
    const r = revive(live, reviveIds)
    if (r.refused) refuse(r.refused)
    queue = r.queue
  } else if (append) {
    // For a standing campaign that grows one item at a time (build-gallery-announce.mjs
    // appends locally), this is how a NEW item reaches KV without --replace's all-or-
    // nothing choice: every existing live item, including its publish state, is kept
    // exactly as the Worker wrote it; only ids the live queue does not have yet are added.
    const local = existsSync(join(HERE, 'queue', `${event}.json`)) ? JSON.parse(readFileSync(join(HERE, 'queue', `${event}.json`), 'utf8')) : { items: [] }
    const r = appendPayload(live || { items: [] }, local)
    queue = r.queue
    addedIds = r.added
    if (!addedIds.length) { console.log(`Nothing new to append — every local item in queue/${event}.json is already in KV.`); return }
  } else if (live && !argv.includes('--replace')) {
    queue = live // restamp only: the Worker's items stay exactly as it recorded them
  } else {
    const queuePath = join(HERE, 'queue', `${event}.json`)
    if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }
    queue = JSON.parse(readFileSync(queuePath, 'utf8'))
    const lost = live ? lostState(live, queue) : []
    if (lost.length) refuse(`queue/${event}.json would drop publish state the Worker recorded for ${lost.join(', ')}. With a route on it, a forgotten "posted" publishes again. Copy that state into the local file first.`)
  }

  const verdict = seedPayload(queue, event, routes)
  if (verdict.refused) refuse(`${verdict.refused} The Worker publishes only a queue whose route Nino approved in graph-routes.json. Load the \`meta-publish\` skill.`)

  mkdirSync(join(HERE, 'queue'), { recursive: true })
  const outPath = join(HERE, 'queue', `${event}.kv.json`)
  writeFileSync(outPath, JSON.stringify(verdict.payload, null, 2))
  const source = reviveIds ? `live queue, revived ${reviveIds.join(', ')}`
    : addedIds ? `live queue, appended ${addedIds.join(', ')}`
    : queue === live ? 'live queue, route restamped' : `local queue/${event}.json`
  console.log(`Wrote ${outPath} from the ${source} (${verdict.payload.items.length} items, route approved ${verdict.payload.meta.route.approved}).`)
  if (!argv.includes('--put')) { console.log('Preview only. Re-run with --put to write it to production KV.'); return }
  // KV has no compare-and-set, so the put would revert anything the Worker wrote since the read — and with a
  // route on it, a reverted "posted" publishes again. Stay clear of the hourly tick, and re-read just before writing.
  const minute = new Date().getUTCMinutes()
  if (minute >= 55 || minute < 5) refuse(`it is ${minute} past the hour, inside the Worker's tick window (:55–:05). Re-run after :05.`)
  if (JSON.stringify(readLive(event)) !== JSON.stringify(live)) refuse(`KV key "${event}" changed since it was read (the Worker ran, or someone wrote it). Re-run to build from the current value.`)
  wrangler(['put', event, `--path=${outPath}`], { stdio: 'inherit' })
  console.log(`Seeded KV key "${event}".`)
}

// realpathSync before comparing: node canonicalizes a symlinked module path (e.g. macOS's
// /var -> /private/var under a mkdtemp'd test root) in import.meta.url, but process.argv[1]
// is left exactly as supplied — an un-realpath'd comparison here silently never runs main()
// when this script is spawned from such a path (found running veto-announce.mjs's own tests).
let isEntryPoint = false
try { isEntryPoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1] || '')).href } catch { /* argv[1] unreadable — not the entry point */ }
if (isEntryPoint) {
  try { main() } catch (e) { console.error(`REFUSED — ${e.message}`); process.exit(REFUSED) }
}
