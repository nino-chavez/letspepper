/**
 * Build an Instagram CAROUSEL of the gallery's most-engaged photos ("top shots
 * to post") and write queue/<event>.json so the existing pipeline publishes it.
 *
 *   node scripts/social-publish/build-top-shots.mjs --metric trending --count 10
 *   IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \
 *     node scripts/social-publish/post-reels.mjs --event top-shots --account ninophoto --count 1
 *
 * Data-driven content: pulls the top photos from the gallery's public
 * /api/top-photos feed (the popularity engine — unlisted albums already
 * excluded), re-hosts them on R2 as jpeg (IG rejects webp), and queues a
 * carousel. Queue-only — a separate post-reels step actually publishes.
 *
 * Mirrors build-album-carousel.mjs (kept separate: different photo source).
 *
 * Flags:
 *   --metric <trending|all_time>  ranking. Default: trending.
 *   --count <N>                   slides (max 10). Default: 10.
 *   --account <slug>              accounts.json slug. Default: ninophoto.
 *   --event <name>                queue/<name>.json + R2 prefix. Default: top-shots.
 *   --collab a,b                  collaborator invites. Default: none.
 *   --caption "..."               override the templated caption.
 *   --site <url>                  gallery base. Default: https://ninochavez.co/photography.
 *   --bucket <name>              R2 bucket. Default: flickday-social.
 *   --public-base <url>          R2 public base. Default: the flickday-social r2.dev URL.
 *   --post                        publish immediately after queuing (needs an approved
 *                                 Graph route: --graph-route "<Nino's words>" or the
 *                                 event listed in graph-routes.json — see route-gate.mjs).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { assertRouteBeforeBuild } from './route-gate.mjs'
import { hasInstagramCompatibleAspectRatio, r2PutPhoto } from './gallery-photo-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const IG_CAROUSEL_MAX = 10

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, [])
)

const metric = args.metric === 'all_time' ? 'all_time' : 'trending'
const count = Math.min(IG_CAROUSEL_MAX, Number(args.count ?? 10))
const account = typeof args.account === 'string' ? args.account : 'ninophoto'
const event = typeof args.event === 'string' ? args.event : 'top-shots'
// --post publishes through the Graph API, so it needs an approved route — checked
// here, before the gallery is read or anything reaches R2. Building and staging
// without --post is ungated; post-reels.mjs gates the publish either way.
if (args.post) assertRouteBeforeBuild({ event, account, reasonFlag: args['graph-route'], script: 'build-top-shots.mjs --post' })
const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = (typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev').replace(/\/$/, '')
const collaborators = (typeof args.collab === 'string' ? args.collab : '')
  .split(',').map((s) => s.trim()).filter(Boolean)

// 1. Pull the top photos from the gallery's public popularity feed. That feed
// intentionally keeps its compact public shape, so hydrate source-specific
// fields from the album rows before selecting a JPEG source.
async function fetchAlbumPhotos(albumKey) {
  const all = []
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${site}/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${page}`)
    if (!res.ok) throw new Error(`${res.status} album ${albumKey}`)
    const { photos } = await res.json()
    if (!photos?.length) break
    all.push(...photos)
  }
  return all
}

async function fetchTopPhotos() {
  const url = `${site}/api/top-photos?metric=${metric}&limit=${count}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const { photos } = await res.json()
  const top = (photos ?? []).filter((p) => p.cf_image_id).slice(0, count)
  const albums = new Map()
  await Promise.all([...new Set(top.map((p) => p.album_key).filter(Boolean))].map(async (albumKey) => {
    const rows = await fetchAlbumPhotos(albumKey)
    albums.set(albumKey, new Map(rows.map((row) => [row.image_key, row])))
  }))
  return top
    .map((photo) => ({ ...photo, ...(albums.get(photo.album_key)?.get(photo.image_key) || {}) }))
    // Both source paths preserve the original ratio. Never queue an image that
    // Meta will reject rather than re-encoding HDR into a cropped SDR JPEG.
    .filter(hasInstagramCompatibleAspectRatio)
}

// 2. Re-host one photo on R2 as jpeg; return the public URL + temp path.
async function r2Put(photo, key) {
  const tmp = join(tmpdir(), `topshot-${key.replace(/\W/g, '_')}.jpg`)
  return r2PutPhoto({ photo, site, bucket, publicBase, event, key, tmp })
}

function defaultCaption(n) {
  const when = metric === 'all_time' ? 'of all time' : 'this week'
  return [
    `Most-loved frames ${when} — ${n} fan favorites from the gallery, ranked by what you all engaged with.`,
    '',
    'Players: find your team at letspepper.com/gallery. Tag yourselves and your crew.',
    '',
    'Motion. Emotion. Frame by Frame.',
    '',
    '#volleyball #volleyballphotography #sportsphotography #motionemotion #fanfavorites',
  ].join('\n')
}

// --- run ---
const picks = await fetchTopPhotos()
if (!picks.length) {
  console.error(`No top photos from ${site}/api/top-photos?metric=${metric} (engine still warming up?).`)
  process.exit(1)
}
console.log(`Top shots (${metric}): selected ${picks.length} of up to ${count}`)

const children = []
const tmpFiles = []
for (let i = 0; i < picks.length; i++) {
  const p = picks[i]
  const n = String(i + 1).padStart(2, '0')
  process.stdout.write(`  slide ${n} (${p.image_key}) → R2 ... `)
  const { url, tmp } = await r2Put(p, `slide-${n}`)
  children.push({ media_type: 'IMAGE', image_url: url })
  tmpFiles.push(tmp)
  console.log('ok')
}

const caption = typeof args.caption === 'string' ? args.caption : defaultCaption(picks.length)
const item = {
  id: `${event}-carousel`,
  account,
  media_type: 'CAROUSEL',
  caption,
  children,
  user_tags: [],
  collaborators,
  scheduledAt: '2000-01-01T00:00:00.000Z', // immediately due
  status: 'pending',
  ig_container_id: null,
  ig_media_id: null,
  posted_at: null,
  error: null,
}
const queuePath = join(HERE, 'queue', `${event}.json`)
mkdirSync(dirname(queuePath), { recursive: true })
writeFileSync(queuePath, JSON.stringify({ event, items: [item] }, null, 2))
console.log(`\nWrote ${queuePath}`)

// Contact sheet for a quick eyeball before posting (best-effort).
try {
  const out = join(HERE, '..', '..', '.temp')
  mkdirSync(out, { recursive: true })
  const sheet = join(out, `${event}-carousel.jpg`)
  execFileSync('montage', [...tmpFiles, '-tile', '5x2', '-geometry', '360x270+5+5',
    '-background', 'black', '-fill', 'yellow', '-label', '%f', sheet], { stdio: 'ignore' })
  console.log(`Contact sheet: ${sheet}`)
} catch { /* montage optional */ }

console.log('\nStaged, not published. One carousel is an ad hoc post: it goes out by hand (native Instagram for a Collab)')
console.log('unless Nino named the Graph API for it. The `meta-publish` skill owns that choice. If he did:')
console.log(`  IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential") \\`)
console.log(`    node ${join(HERE, 'post-reels.mjs')} --event ${event} --account ${account} --count 1 --graph-route "<his words>"`)

// Optional one-shot publish.
if (args.post) {
  console.log('\n--post: publishing now...')
  const token = execFileSync('op', ['read', 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'], { encoding: 'utf8' }).trim()
  const route = typeof args['graph-route'] === 'string' ? ['--graph-route', args['graph-route']] : []
  execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', event, '--account', account, '--count', '1', ...route],
    { stdio: 'inherit', env: { ...process.env, IG_ACCESS_TOKEN: token } })
}
