/**
 * Point a queue's video_urls at Cloudflare Stream download URLs.
 *
 *   node scripts/social-publish/relink-stream.mjs --event bell-pepper-2026 \
 *     --map /tmp/stream-map.json
 *
 * Reads the stream-map produced by photography/scripts/ingest-video-local.ts
 * (filename → {cf_stream_id, download_url, thumbnail}) and sets each queue
 * item's video_url to the Stream download URL (Meta fetches it). Stream is the
 * durable home + gallery source, so this replaces the transient R2 hosting.
 * Only touches items whose file basename is in the map. Run, then push the
 * relinked queue to KV with seed-kv.mjs --replace --put. A plain seed restamps the
 * live queue and keeps its old URLs; --replace is refused on a running campaign
 * until the local file carries the posted state the Worker recorded.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { queueDir } from './queue-dir.mjs'
import { updateQueueFile } from './queue-store.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((a, t, i, arr) => {
  if (t.startsWith('--')) { const n = arr[i + 1]; a.push([t.slice(2), n === undefined || n.startsWith('--') ? true : n]) }
  return a
}, []))
const event = args.event
const mapPath = args.map || '/tmp/stream-map.json'
if (!event) { console.error('Required: --event <slug> [--map <stream-map.json>]'); process.exit(1) }
if (!existsSync(mapPath)) { console.error(`No map: ${mapPath}`); process.exit(1) }

const queuePath = join(queueDir(), `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }

const map = JSON.parse(readFileSync(mapPath, 'utf8'))
let linked = 0, missing = []
const q = updateQueueFile(queuePath, undefined, (fresh) => {
  for (const it of fresh.items) {
    const fname = basename(it.file || '')
    const entry = map[fname]
    if (!entry?.download_url) { missing.push(it.id); continue }
    it.video_url = entry.download_url
    it.cf_stream_id = entry.cf_stream_id
    it.thumbnail = entry.thumbnail
    linked++
  }
})
console.log(`Relinked ${linked}/${q.items.length} items to Stream download URLs.`)
if (missing.length) console.log(`No map entry for ${missing.length}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`)
console.log(`Next: node scripts/social-publish/seed-kv.mjs --event ${event} --replace --put (a plain seed keeps the live queue's old URLs)`)
