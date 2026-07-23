/**
 * Build an Instagram CAROUSEL of the gallery's most-engaged photos ("top shots
 * to post") and write queue/<event>.json so the existing pipeline publishes it.
 *
 *   node scripts/social-publish/build-top-shots.mjs --metric trending --count 10
 *   IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \
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
 *   --post                        publish immediately after queuing.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const CF_HASH = 'wg34HB28-JkySWVm5fW4kA' // Cloudflare Images account hash (public)
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
const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = (typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev').replace(/\/$/, '')
const collaborators = (typeof args.collab === 'string' ? args.collab : '')
  .split(',').map((s) => s.trim()).filter(Boolean)

function cfLarge(id) { return `https://imagedelivery.net/${CF_HASH}/${id}/large` }

// 1. Pull the top photos from the gallery's public popularity feed.
async function fetchTopPhotos() {
  const url = `${site}/api/top-photos?metric=${metric}&limit=${count}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const { photos } = await res.json()
  return (photos ?? []).filter((p) => p.cf_image_id).slice(0, count)
}

// 2. Re-host one photo on R2 as jpeg; return the public URL + temp path.
async function r2Put(cfId, key) {
  const tmp = join(tmpdir(), `topshot-${key.replace(/\W/g, '_')}.jpg`)
  const res = await fetch(cfLarge(cfId), { headers: { accept: 'image/jpeg' } })
  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !/image\/jpeg/.test(ct)) throw new Error(`bad image for ${cfId} (${res.status} ${ct})`)
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
  const objectKey = `${event}/${key}.jpg`
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
    `--file=${tmp}`, '--content-type=image/jpeg', '--remote'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  return { url: `${publicBase}/${objectKey}`, tmp }
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
  const { url, tmp } = await r2Put(p.cf_image_id, `slide-${n}`)
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

console.log('\nNext — publish it:')
console.log(`  IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \\`)
console.log(`    node ${join(HERE, 'post-reels.mjs')} --event ${event} --account ${account} --count 1`)

// Optional one-shot publish.
if (args.post) {
  console.log('\n--post: publishing now...')
  const token = execFileSync('op', ['read', 'op://Developer Secrets/Meta Almost-Flickday/credential'], { encoding: 'utf8' }).trim()
  execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', event, '--account', account, '--count', '1'],
    { stdio: 'inherit', env: { ...process.env, IG_ACCESS_TOKEN: token } })
}
