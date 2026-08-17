/**
 * Fill a Facebook Page photo album from a Nino Chavez Gallery album.
 *
 *   node scripts/social-publish/build-fb-album.mjs \
 *     --album chicago-big-dig-2026-north-avenue-beach-1BlKk4 \
 *     --fb-album "Chicago Big Dig 2026" --dry-run
 *
 * WHY THE ALBUM MUST ALREADY EXIST (verified live 2026-07-29, Graph v25.0):
 * `POST /{page-id}/albums` returns `(#3) Application does not have the capability
 * to make this API call` with BOTH the System User token and the derived Page
 * token. Album *creation* is not available to a Standard Access app. Writing into
 * an album that already exists is NOT gated the same way — `POST /{album-id}/photos`
 * was probed against the Page's own cover album and returned a photo id (deleted
 * after) — so the album shell is created once in the Facebook composer (which is
 * also the only place a Page @mention registers, see below) and this script does
 * the bulk upload.
 *
 * WHY MENTIONS ARE NOT IN HERE: a `message` containing `@[<page-id>]` posted via
 * the API comes back with the token silently stripped and no `message_tags` —
 * mentioning another Page needs Page Public Content Access (App Review). Type
 * the @mention in the composer when you create the album; the API cannot.
 *
 * Media path: the gallery's own API is behind a Cloudflare bot challenge that
 * 403s plain `fetch` (this is also why `build-album-carousel.mjs` currently
 * fails), so the photo manifest is pulled through the browse-tool browser when a
 * direct fetch is rejected. Image bytes come straight from Cloudflare Images —
 * `imagedelivery.net` is not challenged — and go to Facebook as a multipart
 * upload, so no R2 round-trip is needed (unlike Instagram, which needs a public
 * URL and rejects webp).
 *
 * Flags:
 *   --album <slug|key>   required. Gallery album slug or 5-8 char key.
 *   --fb-album <name|id> required. Facebook album, by numeric id or by name
 *                        (matched case-insensitively against the Page's albums).
 *   --account <slug>     accounts.json slug. Default: flickday.
 *   --count <N|all>      how many frames to upload, best-first. Default: all.
 *   --min-score <N>      drop frames below this summed quality score (0-30).
 *   --captions           write the gallery caption on each photo. Default: off.
 *   --site <url>         gallery base. Default: https://ninochavez.co/photography.
 *   --dry-run            resolve, rank and report; upload nothing.
 *   --resume             skip frames already recorded as uploaded in the ledger.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const GRAPH = 'https://graph.facebook.com/v25.0'
const OP_PAGE_TOKEN = 'op://Developer Secrets/Meta Lets Pepper Page Publisher/credential'

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
const fbAlbumArg = typeof args['fb-album'] === 'string' ? args['fb-album'] : null
if (!albumArg || !fbAlbumArg) {
  console.error('Required: --album <slug|key> --fb-album <name|id>')
  process.exit(1)
}
const accountSlug = typeof args.account === 'string' ? args.account : 'flickday'
const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
const wantAll = args.count === undefined || args.count === 'all'
const count = wantAll ? Infinity : Number(args.count)
const minScore = args['min-score'] === undefined ? null : Number(args['min-score'])
const dryRun = Boolean(args['dry-run'])

const last = albumArg.split('-').pop()
const albumKey = /^[a-zA-Z0-9]{5,8}$/.test(last) ? last : albumArg

const accounts = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts
const account = accounts[accountSlug]
if (!account?.page_id) { console.error(`Unknown account or missing page_id: ${accountSlug}`); process.exit(1) }

// --- gallery manifest -------------------------------------------------------

// Direct fetch first; fall back to running the same fetch inside the browse-tool
// browser, which carries the cookie that clears the bot challenge.
async function fetchManifest() {
  const url = (page) => `${site}/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${page}`
  const probe = await fetch(url(1)).catch(() => null)
  if (probe?.ok) {
    const all = []
    for (let page = 1; page <= 100; page++) {
      const res = await fetch(url(page))
      if (!res.ok) break
      const { photos } = await res.json()
      if (!photos?.length) break
      all.push(...photos)
    }
    console.log(`Manifest: direct fetch (${all.length} photos)`)
    return all
  }
  console.log(`Manifest: direct fetch returned ${probe?.status ?? 'network error'} — routing through browse-tool`)
  const js = `
    const all = []
    for (let page = 1; page <= 100; page++) {
      const r = await fetch(${JSON.stringify(`${site}/api/album-photos?albumKey=${albumKey}&page=`)} + page)
      if (!r.ok) break
      const d = await r.json()
      if (!d.photos?.length) break
      all.push(...d.photos)
    }
    return all
  `
  const tmp = join(tmpdir(), `fb-album-manifest-${albumKey}.js`)
  writeFileSync(tmp, js)
  try {
    const out = execFileSync('browse-eval', ['--file', tmp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const photos = JSON.parse(out)
    console.log(`Manifest: via browse-tool (${photos.length} photos)`)
    return photos
  } catch (e) {
    console.error('browse-tool fetch failed. Start it first:\n  browse-start --profile-name photography --headless\n' + String(e?.message || e))
    process.exit(1)
  }
}

// --- selection --------------------------------------------------------------

// Inherited from build-album-carousel.mjs, and about as effective there: the AI
// captions describe play, not sponsor signage, so this almost never fires (0 of
// 267 on the Big Dig album). Kept as a floor, not a gate — use --min-score and a
// human pass for anything that actually matters.
const BLOCK = ['beer', 'alcohol', 'wine', 'bottle', 'smoke', 'drink']

// NOTE: build-album-carousel.mjs reads these off the photo root, where they are
// always undefined — the API nests them under `metadata`, so that script has been
// silently ranking by its caption heuristic. Read them from the right place.
function qualityScore(p) {
  const m = p.metadata ?? p
  const vals = [m.sharpness, m.composition_score, m.emotional_impact].map(Number).filter((n) => !Number.isNaN(n))
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null
}

function select(photos) {
  const usable = photos.filter((p) => p.cf_image_id)
  const blocked = usable.filter((p) => BLOCK.some((w) => (p.caption || '').toLowerCase().includes(w)))
  let pool = usable.filter((p) => !blocked.includes(p))
  if (minScore != null) pool = pool.filter((p) => (qualityScore(p) ?? 0) >= minScore)
  const ranked = pool
    .map((p) => ({ p, s: qualityScore(p) ?? -1 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p)
  return { picks: ranked.slice(0, count === Infinity ? ranked.length : count), blocked }
}

// --- facebook ---------------------------------------------------------------

function systemToken() {
  if (process.env.FB_ACCESS_TOKEN) return process.env.FB_ACCESS_TOKEN
  return execFileSync('op', ['read', OP_PAGE_TOKEN], { encoding: 'utf8' }).trim()
}

// Album uploads must act as the Page, not as the System User, so exchange for the
// Page token (`(#200) Unpublished posts must be posted to a page as the page itself`).
async function pageToken(sysToken) {
  const res = await fetch(`${GRAPH}/${account.page_id}?fields=access_token&access_token=${sysToken}`)
  const body = await res.json()
  if (!body.access_token) throw new Error(`no Page token for ${account.page_id}: ${JSON.stringify(body.error ?? body)}`)
  return body.access_token
}

async function resolveFbAlbum(token) {
  if (/^\d+$/.test(fbAlbumArg)) return { id: fbAlbumArg, name: '(by id)' }
  const res = await fetch(`${GRAPH}/${account.page_id}/albums?fields=id,name,count,can_upload&limit=100&access_token=${token}`)
  const body = await res.json()
  const albums = body.data ?? []
  const hit = albums.find((a) => a.name?.toLowerCase() === fbAlbumArg.toLowerCase()) ??
    albums.find((a) => a.name?.toLowerCase().includes(fbAlbumArg.toLowerCase()))
  if (!hit) {
    console.error(`No album matching "${fbAlbumArg}" on ${account.handle}. Existing albums:`)
    for (const a of albums) console.error(`  ${a.id}  ${a.name} (${a.count ?? 0} photos, can_upload=${a.can_upload})`)
    console.error('\nCreate the album in the Facebook composer first — the API cannot create one.')
    process.exit(1)
  }
  if (hit.can_upload === false) {
    console.error(`Album "${hit.name}" (${hit.id}) is not uploadable (type cover/profile).`)
    process.exit(1)
  }
  return hit
}

async function uploadPhoto(token, albumId, photo) {
  const src = `https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/${photo.cf_image_id}/large`
  const img = await fetch(src, { headers: { accept: 'image/jpeg' } })
  const ct = img.headers.get('content-type') || ''
  if (!img.ok || !/image\/jpeg/.test(ct)) throw new Error(`bad source image (${img.status} ${ct})`)
  const form = new FormData()
  form.append('source', new Blob([await img.arrayBuffer()], { type: 'image/jpeg' }), `${photo.image_key}.jpg`)
  if (args.captions && photo.caption) form.append('message', photo.caption)
  form.append('access_token', token)
  const res = await fetch(`${GRAPH}/${albumId}/photos`, { method: 'POST', body: form })
  const body = await res.json()
  if (body.error) throw new Error(`${body.error.code}: ${body.error.message}`)
  return body.id
}

// --- run --------------------------------------------------------------------

const photos = await fetchManifest()
if (!photos.length) { console.error(`No photos for album "${albumKey}"`); process.exit(1) }

const { picks, blocked } = select(photos)
console.log(`Album ${albumKey}: ${photos.length} photos → ${picks.length} selected` +
  (blocked.length ? `, ${blocked.length} dropped by brand-safety filter` : '') +
  (minScore != null ? `, min-score ${minScore}` : ''))
if (!picks.length) { console.error('Nothing selected.'); process.exit(1) }

const ledgerPath = join(HERE, 'queue', `fb-album-${albumKey}.json`)
mkdirSync(dirname(ledgerPath), { recursive: true })
const ledger = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { album_key: albumKey, account: accountSlug, page_id: account.page_id, fb_album_id: null, uploaded: {}, errors: {} }

const pending = args.resume ? picks.filter((p) => !ledger.uploaded[p.image_key]) : picks

if (dryRun) {
  const scores = picks.map((p) => qualityScore(p) ?? 0)
  console.log(`Score range: ${Math.min(...scores)}–${Math.max(...scores)} (of 30)`)
  console.log(`Captions: ${args.captions ? 'gallery caption per photo' : 'none'}`)
  console.log(`Ledger: ${ledgerPath}`)
  console.log('\nFirst 10 frames:')
  for (const p of picks.slice(0, 10)) console.log(`  ${String(qualityScore(p)).padStart(2)}  ${p.image_key}  ${(p.caption || '').slice(0, 72)}`)
  if (blocked.length) {
    console.log('\nDropped (brand safety):')
    for (const p of blocked) console.log(`  ${p.image_key}  ${(p.caption || '').slice(0, 72)}`)
  }
  console.log(`\nDry run — nothing uploaded. Would upload ${pending.length} to Facebook album "${fbAlbumArg}".`)
  process.exit(0)
}

const sys = systemToken()
const token = await pageToken(sys)
const fbAlbum = await resolveFbAlbum(token)
ledger.fb_album_id = fbAlbum.id
console.log(`Uploading ${pending.length} → "${fbAlbum.name}" (${fbAlbum.id}) on ${account.handle}\n`)

let ok = 0
let failed = 0
for (let i = 0; i < pending.length; i++) {
  const p = pending[i]
  const n = String(i + 1).padStart(3)
  process.stdout.write(`  ${n}/${pending.length} ${p.image_key} ... `)
  try {
    const id = await uploadPhoto(token, fbAlbum.id, p)
    ledger.uploaded[p.image_key] = { id, at: new Date().toISOString() }
    delete ledger.errors[p.image_key]
    ok++
    console.log(`ok ${id}`)
  } catch (e) {
    failed++
    ledger.errors[p.image_key] = String(e?.message || e)
    console.log(`FAILED — ${e?.message || e}`)
  }
  // Save every photo: a rate-limit stop mid-run must stay resumable.
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))
  await new Promise((r) => setTimeout(r, 400))
}

console.log(`\n${ok} uploaded, ${failed} failed. Ledger: ${ledgerPath}`)
if (failed) console.log('Re-run with --resume to retry only the failures.')
console.log(`Album: https://www.facebook.com/${account.page_id}/photos_albums`)
