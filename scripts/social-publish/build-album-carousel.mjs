/**
 * Build an Instagram CAROUSEL queue item from a Nino Chavez Gallery album, host
 * the selected photos on a public R2 bucket, and write queue/<event>.json so the
 * existing pipeline publishes it:
 *
 *   node scripts/social-publish/build-album-carousel.mjs \
 *     --album saturday-triples-the-raiders-open-rdrsVB \
 *     --count 10 --collab nino.chavez.photo
 *   IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \
 *     node scripts/social-publish/post-reels.mjs --event <event> --account flickday --count 1
 *
 * Self-contained: reads the album from the public gallery API (no DB creds), so
 * it runs anywhere wrangler is authed.
 *
 * Why R2 and not the gallery's imagedelivery.net URLs directly: Cloudflare Images
 * format-negotiates to webp on a webp-Accept fetch, and Instagram's media fetcher
 * rejects webp. R2 serves the stored content-type verbatim. We fetch the `large`
 * variant with `Accept: image/jpeg` (forces jpeg) and re-host it.
 *
 * Flags:
 *   --album <slug|key>   required. Album slug or 5-8 char album key.
 *   --event <name>       queue/<name>.json + R2 prefix. Default: album key.
 *   --account <slug>     accounts.json slug. Default: flickday.
 *   --count <N>          auto-select top N (max 10). Default: 10.
 *   --keys a,b,c         explicit image_keys in order (overrides --count).
 *   --collab a,b         collaborator co-author invites. Default: nino.chavez.photo.
 *   --caption "..."      override the templated caption.
 *   --name "..."         album display name (else parsed from the album page).
 *   --site <url>         gallery base. Default: https://ninochavez.co/photography.
 *   --bucket <name>      R2 bucket. Default: flickday-social.
 *   --public-base <url>  R2 public base. Default: the flickday-social r2.dev URL.
 *   --post               publish immediately via post-reels.mjs (needs IG token).
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

const albumArg = typeof args.album === 'string' ? args.album : null
if (!albumArg) { console.error('Required: --album <slug|key>'); process.exit(1) }
const account = typeof args.account === 'string' ? args.account : 'flickday'
const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = (typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev').replace(/\/$/, '')
const collaborators = (typeof args.collab === 'string' ? args.collab : 'nino.chavez.photo')
  .split(',').map((s) => s.trim()).filter(Boolean)
const explicitKeys = typeof args.keys === 'string' ? args.keys.split(',').map((s) => s.trim()).filter(Boolean) : null
const count = Math.min(IG_CAROUSEL_MAX, Number(args.count ?? 10))

// Album key = trailing 5-8 alnum segment of the slug, else the whole arg.
const last = albumArg.split('-').pop()
const albumKey = /^[a-zA-Z0-9]{5,8}$/.test(last) ? last : albumArg
const event = typeof args.event === 'string' ? args.event : albumKey

function cfLarge(id) { return `https://imagedelivery.net/${CF_HASH}/${id}/large` }

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

// 1. Pull all photos for the album from the public API.
async function fetchAllPhotos() {
  const all = []
  for (let page = 1; page <= 100; page++) {
    const { photos, totalCount } = await getJson(`${site}/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${page}`)
    if (!photos?.length) break
    all.push(...photos)
    if (totalCount && all.length >= totalCount) break
  }
  return all
}

// 2. Album display name: --name, else parse the album page's og:title.
async function resolveAlbumName(slug) {
  if (typeof args.name === 'string') return args.name
  try {
    const html = await (await fetch(`${site}/albums/${slug}`)).text()
    const m = html.match(/<meta property="og:title" content="([^"]*?)(?: \| Nino Chavez Photography)?"/)
    if (m) return m[1]
  } catch { /* fall through */ }
  return slug
}

// 3. Selection. Explicit --keys win; else rank by AI quality score, falling back
//    to a caption action/emotion heuristic when scores are unprocessed (null).
const ACTION = ['spik', 'jump', 'dive', 'serv', 'leap', 'mid-air', 'midair', 'reach', 'swing', 'block', 'bump', 'set ', 'diving', 'soar', 'airborne', 'hit', 'attack', 'lung', 'slid']
const EMOTION = ['celebrat', 'cheer', 'fist', 'scream', 'yell', 'hug', 'high-five', 'point', 'excit', 'triumph', 'emotion', 'joy', 'intense', 'roar', 'clench']
const AVOID = ['walk', 'stand', 'sitting', 'sits', 'tent', 'bench', 'water', 'phone', 'talk', 'blurred background', 'spectator', 'waiting', 'crowd']
const BLOCK = ['beer', 'alcohol', 'wine', 'bottle', 'smoke', 'drink'] // brand-safety hard block

function captionScore(cap = '') {
  const c = cap.toLowerCase()
  if (BLOCK.some((w) => c.includes(w))) return -Infinity
  let s = 0
  for (const w of ACTION) if (c.includes(w)) s += 3
  for (const w of EMOTION) if (c.includes(w)) s += 3
  for (const w of AVOID) if (c.includes(w)) s -= 2
  return s
}
function qualityScore(p) {
  const vals = [p.sharpness, p.composition_score, p.emotional_impact].map(Number).filter((n) => !Number.isNaN(n))
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

function select(photos) {
  const withCf = photos.filter((p) => p.cf_image_id)
  if (explicitKeys) {
    const byKey = new Map(withCf.map((p) => [p.image_key, p]))
    const picked = explicitKeys.map((k) => byKey.get(k)).filter(Boolean)
    if (picked.length !== explicitKeys.length) {
      const missing = explicitKeys.filter((k) => !byKey.has(k))
      console.warn(`warning: ${missing.length} --keys not found in album: ${missing.join(', ')}`)
    }
    return picked.slice(0, IG_CAROUSEL_MAX)
  }
  const haveQuality = withCf.some((p) => qualityScore(p) != null)
  const ranked = [...withCf]
    .map((p) => ({ p, score: haveQuality ? (qualityScore(p) ?? -1) : captionScore(p.caption) }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p)
  return ranked.slice(0, count)
}

// 4. Re-host one photo on R2 as jpeg; return the public URL.
function r2Put(cfId, key) {
  const tmp = join(tmpdir(), `albcar-${key.replace(/\W/g, '_')}.jpg`)
  return fetch(cfLarge(cfId), { headers: { accept: 'image/jpeg' } })
    .then(async (res) => {
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || !/image\/jpeg/.test(ct)) throw new Error(`bad image for ${cfId} (${res.status} ${ct})`)
      writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
      const objectKey = `${event}/${key}.jpg`
      execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
        `--file=${tmp}`, '--content-type=image/jpeg', '--remote'],
        { stdio: ['ignore', 'ignore', 'inherit'] })
      return { url: `${publicBase}/${objectKey}`, tmp }
    })
}

function defaultCaption(name, total, n) {
  return [
    `${name}. ${total} frames in the gallery — ${n} favorites here.`,
    '',
    'Players: find your team at letspepper.com/gallery. Tag yourselves and your crew so nobody misses theirs.',
    '',
    'Motion. Emotion. Frame by Frame.',
    '',
    '#volleyball #grassvolleyball #volleyballphotography #sportsphotography #motionemotion',
  ].join('\n')
}

// --- run ---
const photos = await fetchAllPhotos()
if (!photos.length) { console.error(`No photos for album "${albumKey}" at ${site}`); process.exit(1) }
const total = photos.length
const picks = select(photos)
if (!picks.length) { console.error('No images selected (after filters). Try --keys or a higher --count.'); process.exit(1) }
console.log(`Album ${albumKey}: ${total} photos → selecting ${picks.length}` +
  (explicitKeys ? ' (explicit --keys)' : photos.some((p) => qualityScore(p) != null) ? ' (by quality score)' : ' (by caption heuristic — album unscored)'))

// Slug for the album page link/name resolution (prefer the original arg if it was a full slug).
const slug = albumArg.includes('-') && albumArg !== albumKey ? albumArg : null
const albumName = await resolveAlbumName(slug ?? albumKey)

// 4. Host each pick on R2 (in carousel order), collect children + temp files for the contact sheet.
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

// 5. Write the queue file (post-reels.mjs schema).
const caption = typeof args.caption === 'string' ? args.caption : defaultCaption(albumName, total, picks.length)
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

// 6. Contact sheet for a quick eyeball before posting (best-effort).
try {
  const out = join(HERE, '..', '..', '.temp')
  mkdirSync(out, { recursive: true })
  const sheet = join(out, `${event}-carousel.jpg`)
  execFileSync('montage', [...tmpFiles, '-tile', '5x2', '-geometry', '360x270+5+5',
    '-background', 'black', '-fill', 'yellow', '-label', '%f', sheet], { stdio: 'ignore' })
  console.log(`Contact sheet: ${sheet}`)
} catch { /* montage optional */ }

console.log(`\nCollab: ${collaborators.join(', ') || '(none)'}`)
console.log('\nNext — publish it:')
console.log(`  IG_ACCESS_TOKEN=$(op read "op://Developer Secrets/Meta Almost-Flickday/credential") \\`)
console.log(`    node ${join(HERE, 'post-reels.mjs')} --event ${event} --account ${account} --count 1`)

// 7. Optional one-shot publish.
if (args.post) {
  console.log('\n--post: publishing now...')
  const token = execFileSync('op', ['read', 'op://Developer Secrets/Meta Almost-Flickday/credential'], { encoding: 'utf8' }).trim()
  execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', event, '--account', account, '--count', '1'],
    { stdio: 'inherit', env: { ...process.env, IG_ACCESS_TOKEN: token } })
}
