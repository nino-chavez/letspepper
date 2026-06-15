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
 * Only touches items whose file basename is in the map. Run, then re-seed KV.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((a, t, i, arr) => {
  if (t.startsWith('--')) { const n = arr[i + 1]; a.push([t.slice(2), n === undefined || n.startsWith('--') ? true : n]) }
  return a
}, []))
const event = args.event
const mapPath = args.map || '/tmp/stream-map.json'
if (!event) { console.error('Required: --event <slug> [--map <stream-map.json>]'); process.exit(1) }
if (!existsSync(mapPath)) { console.error(`No map: ${mapPath}`); process.exit(1) }

const queuePath = join(HERE, 'queue', `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }

const map = JSON.parse(readFileSync(mapPath, 'utf8'))
const q = JSON.parse(readFileSync(queuePath, 'utf8'))
let linked = 0, missing = []
for (const it of q.items) {
  const fname = basename(it.file || '')
  const entry = map[fname]
  if (!entry?.download_url) { missing.push(it.id); continue }
  it.video_url = entry.download_url
  it.cf_stream_id = entry.cf_stream_id
  it.thumbnail = entry.thumbnail
  linked++
}
writeFileSync(queuePath, JSON.stringify(q, null, 2))
console.log(`Relinked ${linked}/${q.items.length} items to Stream download URLs.`)
if (missing.length) console.log(`No map entry for ${missing.length}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`)
console.log(`Next: re-seed KV — wrangler kv key put --namespace-id=… ${event} --path=${queuePath} --remote`)
