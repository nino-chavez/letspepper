/**
 * Build (or dry-run) one gallery-announce carousel item for a published
 * photography album and append it to the standing queue/gallery-announce.json.
 *
 *   node scripts/social-publish/build-gallery-announce.mjs --album-key Re7kho --series other --dry-run
 *   node scripts/social-publish/build-gallery-announce.mjs --album-key Re7kho --series other
 *
 * AUTHORITY (2026-09-25): Nino approved a standing "gallery announcements"
 * route for every published album — see graph-routes.json's "gallery-announce"
 * entry, whose `reason` quotes his answers. That route covers WHO may publish
 * (letspepper.open / nino.chavez.photo, gated by route-gate.mjs / route-shape.mjs)
 * and THAT it may run unattended; it does not cover WHAT gets posted for any
 * one album — this script decides that, per album, and stages every item
 * `held` so a bad pick or a caption problem can be caught before it goes live
 * (see hold-shape.mjs). --series is required, not defaulted, for the same
 * reason: many albums in this scope are high-school girls' volleyball, and a
 * silent default could route one to the wrong owned account.
 *
 * Account by series, from Nino's answer ("by series and collab with
 * flickday"): Let's Pepper series albums publish from letspepper.open;
 * everything else from nino.chavez.photo. flickday.media is ALWAYS added as
 * a Collab collaborator, on every album, regardless of series. There is no
 * public read path to an album's gallery_scope (album_settings is read
 * anon-only, server-side, with no API route — checked in the photography
 * repo 2026-09-25), so --series is a required flag, not looked up here.
 *
 * Photo selection is delegated to select-gallery-photos.mjs (default) or
 * whatever module `--strategy <path>` points at, on purpose — see that
 * file's header. Alt text is derived per photo from the site's own AI
 * caption (alt-text.mjs). The caption is built by gallery-announce-caption.mjs
 * from facts only.
 *
 * Flags:
 *   --album-key <key>     required. The album's key (e.g. Re7kho).
 *   --series <lpo|other>  required. Routes the publishing account.
 *   --dry-run             produce a manifest under .temp/, touch nothing else:
 *                          no R2 upload, no queue write, no wrangler call.
 *   --count <N>            max carousel slides. Default 10.
 *   --hold-hours <N>       hold window before the item is publishable. Default 12.
 *   --strategy <path>      override select-gallery-photos.mjs with another
 *                          module exporting the same selectGalleryPhotos(photos, opts) shape.
 *   --venue / --teams / --event-date   override the caption's parsed album-name facts.
 *   --name <string>        override the resolved album display name.
 *   --site <url>           gallery base. Default https://ninochavez.co/photography.
 *   --bucket / --public-base   R2 target for a REAL (non-dry-run) build. Same
 *                          defaults as build-album-carousel.mjs (flickday-social).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import selectGalleryPhotosDefault from './select-gallery-photos.mjs'
import { altTextFromCaption } from './alt-text.mjs'
import { buildGalleryAnnounceCaption } from './gallery-announce-caption.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EVENT = 'gallery-announce'
const CF_HASH = 'wg34HB28-JkySWVm5fW4kA' // Cloudflare Images account hash (public) — same as build-album-carousel.mjs
const IG_CAROUSEL_MAX = 10
const DEFAULT_HOLD_HOURS = 12

function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, []))
}

/** Site's own slugify + createAlbumSlug (src/lib/utils.ts), replicated so the
 * gallery link this builds is the exact URL the site itself would generate —
 * verified live against Re7kho 2026-09-25 (200, not a 404). */
export function slugify(text = '') {
  return text.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
export function createAlbumSlug(albumName, albumKey) { return `${slugify(albumName)}-${albumKey}` }

export function cfLarge(id) { return `https://imagedelivery.net/${CF_HASH}/${id}/large` }

/** Account slug for the item, from Nino's "by series and collab with flickday" answer. */
export function accountForSeries(series) { return series === 'lpo' ? 'letspepper' : 'ninophoto' }

/**
 * Append `item` to `queue` without touching any existing item — the growing-
 * queue contract this campaign needs (compatible with seed-kv.mjs's own
 * refusal to drop Worker-recorded publish state once the item reaches KV).
 * Refuses (returns { refused }) rather than silently double-adding the same
 * album.
 */
export function appendGalleryAnnounceItem(queue, item) {
  const items = queue?.items || []
  if (items.some((it) => it.id === item.id)) {
    return { refused: `an item with id "${item.id}" is already in queue/${EVENT}.json — not appending a duplicate.` }
  }
  return { queue: { event: EVENT, ...queue, items: [...items, item] } }
}

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

async function fetchAllPhotos(site, albumKey) {
  const all = []
  for (let page = 1; page <= 100; page++) {
    const { photos, totalCount } = await getJson(`${site}/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${page}`)
    if (!photos?.length) break
    all.push(...photos)
    if (totalCount && all.length >= totalCount) break
  }
  return all
}

async function resolveAlbumName(site, slugOrKey, nameOverride) {
  if (typeof nameOverride === 'string') return nameOverride
  try {
    const html = await (await fetch(`${site}/albums/${slugOrKey}`)).text()
    const m = html.match(/<meta property="og:title" content="([^"]*?)(?: \| Nino Chavez Photography)?"/)
    if (m) return m[1]
  } catch { /* fall through */ }
  return slugOrKey
}

/**
 * Confirm the album is actually public before announcing it. /api/album-photos
 * serves UNLISTED albums too (it reads with service_role by design — see that
 * route's own header comment), so it cannot answer "is this public". The
 * album PAGE is the public surface: a private/unlisted album 404s there.
 */
async function assertAlbumIsPublic(site, slugOrKey) {
  const res = await fetch(`${site}/albums/${slugOrKey}`, { method: 'GET' })
  if (res.status === 404) {
    throw new Error(`album "${slugOrKey}" is not public (album page 404s) — gallery-announce only covers published, public albums. If this is a private client album, it must never be announced.`)
  }
  if (!res.ok) throw new Error(`could not confirm "${slugOrKey}" is public: album page returned ${res.status}`)
}

async function loadStrategy(strategyPath) {
  if (!strategyPath) return selectGalleryPhotosDefault
  const mod = await import(pathToFileUrl(strategyPath))
  return mod.selectGalleryPhotos || mod.default
}
function pathToFileUrl(p) { return p.startsWith('file://') ? p : new URL(p, `file://${process.cwd()}/`).href }

/** Re-hosts one photo on R2 as jpeg (Instagram rejects webp) — same approach as
 * build-album-carousel.mjs. NEVER called in --dry-run. */
async function r2Put({ bucket, publicBase, event, cfId, key }) {
  const tmp = join(tmpdir(), `galann-${key.replace(/\W/g, '_')}.jpg`)
  const res = await fetch(cfLarge(cfId), { headers: { accept: 'image/jpeg' } })
  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !/image\/jpeg/.test(ct)) throw new Error(`bad image for ${cfId} (${res.status} ${ct})`)
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()))
  const objectKey = `${event}/${key}.jpg`
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
    `--file=${tmp}`, '--content-type=image/jpeg', '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] })
  return `${publicBase}/${objectKey}`
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const albumKey = typeof args['album-key'] === 'string' ? args['album-key'] : null
  const series = args.series === 'lpo' ? 'lpo' : args.series === 'other' ? 'other' : null
  if (!albumKey) throw new Error('Required: --album-key <key> --series <lpo|other>')
  if (!series) throw new Error('Required: --series <lpo|other> — there is no public read path to an album\'s gallery_scope, so this is not defaulted. Many albums in this scope are high-school girls\' volleyball; guess wrong and the wrong owned account announces it.')

  const dryRun = !!args['dry-run']
  const count = Math.min(IG_CAROUSEL_MAX, Number(args.count ?? 10))
  const holdHours = Number(args['hold-hours'] ?? DEFAULT_HOLD_HOURS)
  const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
  const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
  const publicBase = (typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev').replace(/\/$/, '')

  await assertAlbumIsPublic(site, albumKey)

  const photos = await fetchAllPhotos(site, albumKey)
  if (!photos.length) throw new Error(`No photos for album "${albumKey}" at ${site}`)

  const albumName = await resolveAlbumName(site, albumKey, args.name)
  const selectPhotos = await loadStrategy(typeof args.strategy === 'string' ? args.strategy : null)
  const selection = selectPhotos(photos, { count })
  if (!selection.picks.length) throw new Error('No images selected (all hard-blocked, or none had a cf_image_id).')

  console.log(`Album ${albumKey}: ${selection.selectedOf} selected` + (selection.usedQuality ? ' (ranked by quality score)' : ' (quality score flat/unusable — ranked by caption heuristic)'))

  const account = accountForSeries(series)
  const slug = createAlbumSlug(albumName, albumKey)
  const galleryUrl = `${site}/albums/${slug}`

  const now = new Date()
  const holdUntil = new Date(now.getTime() + holdHours * 3600_000).toISOString()

  // Children: real R2 hosting for a live build, imagedelivery.net large URLs (unhosted,
  // labeled as such) for --dry-run — never touch R2 in a dry run.
  const children = []
  for (let i = 0; i < selection.picks.length; i++) {
    const p = selection.picks[i]
    const n = String(i + 1).padStart(2, '0')
    const altText = altTextFromCaption(p.caption)
    const imageUrl = dryRun ? cfLarge(p.cf_image_id) : await r2Put({ bucket, publicBase, event: `${EVENT}-${albumKey}`, cfId: p.cf_image_id, key: `slide-${n}` })
    children.push({ media_type: 'IMAGE', image_url: imageUrl, alt_text: altText, _source: dryRun ? 'imagedelivery.net (NOT yet re-hosted on R2 — dry-run only)' : 'r2', _image_key: p.image_key })
  }

  const caption = buildGalleryAnnounceCaption({
    albumName, venue: args.venue, teams: args.teams, eventDateLabel: args['event-date'],
    galleryUrl, selectedOf: selection.selectedOf, series,
  })
  const facebookAltText = children[0]?.alt_text || null

  const item = {
    id: `${albumKey}-${EVENT}`,
    album_key: albumKey,
    account,
    media_type: 'CAROUSEL',
    channels: ['instagram', 'facebook'],
    caption,
    facebook_caption: caption,
    facebook_alt_text: facebookAltText,
    children: children.map(({ _source, _image_key, ...c }) => c), // internal fields stay off the published payload
    user_tags: [],
    collaborators: ['flickday.media'],
    scheduledAt: holdUntil,
    holdUntil,
    status: 'held',
    facebook_status: 'held',
    ig_container_id: null,
    ig_media_id: null,
    facebook_photo_ids: [],
    facebook_post_id: null,
    posted_at: null,
    error: null,
  }

  const manifest = {
    authority: 'Nino, 2026-09-25 (chat): "Standing auto-post" — a standing gallery-announcements route, by series, ' +
      'collab with flickday, all galleries eligible. See graph-routes.json "gallery-announce".',
    account,
    collaborators: item.collaborators,
    content: 'carousel',
    assets: selection.selectedOf,
    selected: children.map((c, i) => ({ order: i + 1, image_key: c._image_key, url: c.image_url, source: c._source, alt_text: c.alt_text })),
    caption,
    alt_text: children.map((c) => c.alt_text),
    surface: 'Graph publisher standing route gallery-announce',
    route_reason: 'standing route, see graph-routes.json "gallery-announce"',
    holdUntil,
    series,
    album_key: albumKey,
    album_name: albumName,
    gallery_url: galleryUrl,
    usedQuality: selection.usedQuality,
  }

  if (dryRun) {
    const outDir = join(HERE, '..', '..', '.temp')
    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, `gallery-announce-${albumKey}.dry-run.json`)
    writeFileSync(outPath, JSON.stringify(manifest, null, 2))
    console.log(`\n[dry-run] Wrote manifest: ${outPath}`)
    console.log('[dry-run] No R2 upload, no queue write, no Graph call, no wrangler call.')
    return { manifest, outPath, item }
  }

  const queuePath = join(HERE, 'queue', `${EVENT}.json`)
  const existing = existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, 'utf8')) : { event: EVENT, items: [] }
  const result = appendGalleryAnnounceItem(existing, item)
  if (result.refused) { console.error(`REFUSED — ${result.refused}`); process.exitCode = 1; return { refused: result.refused } }
  mkdirSync(dirname(queuePath), { recursive: true })
  writeFileSync(queuePath, JSON.stringify(result.queue, null, 2))
  console.log(`Appended ${item.id} to ${queuePath} (${result.queue.items.length} items total). Held until ${holdUntil}.`)
  console.log('Not seeded to the Worker yet — run seed-kv.mjs --event gallery-announce --append --put once graph-routes.json carries the standing route.')
  return { item, queuePath }
}

// realpathSync before comparing: see hold-shape.mjs-adjacent scripts (veto-announce.mjs,
// seed-kv.mjs) for why a bare pathToFileURL(process.argv[1]) comparison silently loses
// under a symlinked cwd (macOS mkdtemp under /var -> /private/var, etc).
let isEntryPoint = false
try { isEntryPoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1] || '')).href } catch { /* not the entry point */ }
if (isEntryPoint) {
  main().catch((e) => { console.error(`ERROR — ${e.message}`); process.exitCode = 1 })
}
