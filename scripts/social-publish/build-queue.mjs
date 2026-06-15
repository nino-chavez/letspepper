/**
 * Build a publish queue from a folder of reels.
 *
 *   node scripts/social-publish/build-queue.mjs \
 *     --dir "/Users/nino/Workspace/create/export/videos/Bell Pepper 2026" \
 *     --event bell-pepper-2026 \
 *     --start 2026-06-16T17:00 --per-day 2 --hours 12,19
 *
 * Scans <dir> for *.mp4 (natural sort), pairs each with a caption (from
 * captions.json in the event dir, else a template), assigns a staggered
 * scheduledAt, and writes queue/<event>.json. Idempotent: re-running merges
 * onto an existing queue, preserving status/ids/video_url of done items.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, [])
)

const dir = args.dir
const event = args.event
const account = typeof args.account === 'string' ? args.account : 'letspepper'
if (!dir || !event) {
  console.error('Required: --dir <folder> --event <slug>  [--account <slug>]')
  process.exit(1)
}
const perDay = Number(args['per-day'] ?? 2)
const hours = String(args.hours ?? '12,19').split(',').map(Number)
const start = args.start ? new Date(args.start) : new Date()

// natural sort so "...-2" precedes "...-10"
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.mp4')).sort(natural)
if (!files.length) { console.error(`No .mp4 in ${dir}`); process.exit(1) }

// optional per-file captions: { "Bell Pepper 2026-1.mp4": "caption text", ... }
const capPath = join(dir, 'captions.json')
const captions = existsSync(capPath) ? JSON.parse(readFileSync(capPath, 'utf8')) : {}
const DEFAULT_CAPTION =
  'Bell Pepper Open 2026 — grass triples, Aurora IL.\n\nFull gallery → letspepper.com/gallery\n\n📸 @flickday.media\n\n#letspepper #grassvolleyball #volleyball #beachvolleyball #avp #volleyballreels'

// scheduledAt: perDay posts/day at the given hours, starting on `start`'s date.
function scheduleFor(i) {
  const day = Math.floor(i / perDay)
  const slot = i % perDay
  const d = new Date(start)
  d.setDate(d.getDate() + day)
  d.setHours(hours[slot] ?? hours[hours.length - 1], 0, 0, 0)
  return d.toISOString()
}

const outDir = join(HERE, 'queue')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${event}.json`)
const prev = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : { event, items: [] }
const prevById = Object.fromEntries(prev.items.map((it) => [it.id, it]))

const items = files.map((file, i) => {
  const id = basename(file, '.mp4')
  const old = prevById[id]
  // preserve anything already uploaded/posted; only (re)seed new entries
  if (old && old.status !== 'pending') return old
  return {
    id,
    account, // slug into accounts.json — which IG account this posts to
    media_type: 'REELS', // REELS | IMAGE | CAROUSEL
    file: join(dir, file),
    caption: captions[file] ?? old?.caption ?? DEFAULT_CAPTION,
    video_url: old?.video_url ?? null,
    user_tags: old?.user_tags ?? [], // ["flickday.media", ...] tag owned accounts
    collaborators: old?.collaborators ?? [], // ["flickday.media"] Collab co-author invite
    scheduledAt: old?.scheduledAt ?? scheduleFor(i),
    status: 'pending', // pending → uploaded → posted | error
    ig_container_id: null,
    ig_media_id: null,
    posted_at: null,
    error: null,
  }
})

writeFileSync(outPath, JSON.stringify({ event, items }, null, 2))
const pending = items.filter((i) => i.status === 'pending').length
console.log(`Wrote ${outPath}`)
console.log(`  ${items.length} reels · ${pending} pending · ${perDay}/day at ${hours.join(':00, ')}:00`)
console.log(`  first: ${items[0].scheduledAt} · last: ${items[items.length - 1].scheduledAt}`)
console.log(`\nEdit captions in ${capPath} (keyed by filename) then re-run to refresh pending items.`)
