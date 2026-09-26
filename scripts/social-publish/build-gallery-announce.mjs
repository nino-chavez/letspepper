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
 *   --out <path>           dry-run only: write the manifest here instead of
 *                          .temp/gallery-announce-<key>.dry-run.json.
 *   --count <N>            max carousel slides. Default 10.
 *   --hold-hours <N>       hold window before the item is publishable. Default 2
 *                          (Nino, 2026-09-26: "2 hours" — was 12 until then).
 *   --strategy <name|path> "vision" (default) or "caption" — selects a named export of
 *                          select-gallery-photos.mjs — or a path to another module exporting
 *                          the same selectGalleryPhotos(photos, opts) shape.
 *   --model <id>            vision strategy only: OpenRouter model id. Default google/gemini-2.5-flash.
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
import selectGalleryPhotosDefault, { selectGalleryPhotosByCaption } from './select-gallery-photos.mjs'
import { altTextFromCaption } from './alt-text.mjs'
import { buildGalleryAnnounceCaption, shortAlbumName } from './gallery-announce-caption.mjs'
import { notify, heldNotification, nextAllowedSlot, reviewUrlFor, reviewCancelUrlFor } from './notify.mjs'
import { loadRoutes, standingEntry } from './route-gate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EVENT = 'gallery-announce'
const CF_HASH = 'wg34HB28-JkySWVm5fW4kA' // Cloudflare Images account hash (public) — same as build-album-carousel.mjs
const IG_CAROUSEL_MAX = 10
const DEFAULT_HOLD_HOURS = 2 // Nino, 2026-09-26: "2 hours" (was 12)
const DEFAULT_ALLOWED_HOURS_UTC = [17, 22] // mirrors worker/wrangler.jsonc's ALLOWED_HOURS_UTC var — this
// script cannot read the live Worker config, so it mirrors the tracked default; override with
// process.env.ALLOWED_HOURS_UTC (comma-separated) if the two ever need to differ for a test.

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

/** `--strategy` takes the default `vision` strategy, the name `caption` (the pre-2026-09-25
 * default, kept available by name — see select-gallery-photos.mjs's module header), or a
 * path to another module exporting the same selectGalleryPhotos(photos, opts) shape. */
async function loadStrategy(strategyArg) {
  if (!strategyArg || strategyArg === 'vision') return selectGalleryPhotosDefault
  if (strategyArg === 'caption') return selectGalleryPhotosByCaption
  const mod = await import(pathToFileUrl(strategyArg))
  return mod.selectGalleryPhotos || mod.default
}
function pathToFileUrl(p) { return p.startsWith('file://') ? p : new URL(p, `file://${process.cwd()}/`).href }

/** The vision strategy needs an OpenRouter key; read it from the env first (tests/CI can set
 * it), else from 1Password directly — same pattern post-reels.mjs uses for IG_ACCESS_TOKEN. */
function resolveOpenRouterKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    return execFileSync('op', ['read', 'op://Developer Secrets/OpenRouter photography/credential'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch { return undefined }
}

/** notify.mjs is Worker-safe (no node: imports) and never looks up its own topic — the `op
 * read` belongs here, in the local caller, same pattern as resolveOpenRouterKey() above. The
 * Worker instead gets NTFY_TOPIC as its own secret binding (see SETUP.md). */
function resolveNtfyTopic() {
  if (process.env.NTFY_TOPIC) return process.env.NTFY_TOPIC
  if (process.env.NTFY_DISABLED) return undefined // tests: skip the real `op read`, never send a real notification
  try {
    return execFileSync('op', ['read', 'op://Developer Secrets/ntfy gallery-announce/credential'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch { return undefined }
}

/** notify.mjs is Worker-safe and never looks up its own key — the `op read` belongs here,
 * same pattern as resolveNtfyTopic()/resolveOpenRouterKey() above. The Worker instead gets
 * REVIEW_KEY as its own secret binding (see SETUP.md "Arming gallery-announce"). Fails soft:
 * a HELD notification still sends — without a review link or cancel button, and saying so —
 * when the key can't be resolved, because the album is already appended by the time this
 * runs and a notification failure must never fail the build. The 1Password item is created
 * by whoever arms this campaign, not by this script. */
function resolveReviewKey() {
  if (process.env.REVIEW_KEY) return process.env.REVIEW_KEY
  if (process.env.NTFY_DISABLED) return undefined // tests: skip the real `op read`, never send a real notification
  try {
    return execFileSync('op', ['read', 'op://Developer Secrets/Cloudflare letspepper-reels-worker review-key/credential'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch (e) {
    console.error(`resolveReviewKey: could not read REVIEW_KEY from 1Password (${e.message}) — the HELD notification will send without a review link or cancel button.`)
    return undefined
  }
}

/** This script cannot read the live Worker's ALLOWED_HOURS_UTC var, so it mirrors the
 * tracked default (see DEFAULT_ALLOWED_HOURS_UTC above) unless a test overrides it. */
function allowedHoursUtc() {
  const raw = process.env.ALLOWED_HOURS_UTC
  if (!raw) return DEFAULT_ALLOWED_HOURS_UTC
  const hours = raw.split(',').map(Number).filter((n) => Number.isFinite(n))
  return hours.length ? hours : DEFAULT_ALLOWED_HOURS_UTC
}

/** The console line printed after a real (non-dry-run) append — reworded 2026-09-26: the
 * campaign's standing route already exists in graph-routes.json and the photography repo's
 * publish-album.ts runs seed-kv.mjs immediately after this builder, so the original
 * "Not seeded to the Worker yet... once graph-routes.json carries the standing route" line
 * read as a failure when nothing was wrong. Mentions graph-routes.json only when the route
 * is actually absent — pure so it's directly testable without exercising the whole build. */
export function nextStepMessage(hasRoute) {
  return hasRoute
    ? 'Next: seed-kv.mjs --event gallery-announce --append --put (publish-album.ts runs this automatically).'
    : 'Next: seed-kv.mjs --event gallery-announce --append --put once graph-routes.json carries the standing route for "gallery-announce" — it does not yet.'
}

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
  const strategyArg = typeof args.strategy === 'string' ? args.strategy : null
  const selectPhotos = await loadStrategy(strategyArg)
  const usingVision = selectPhotos === selectGalleryPhotosDefault
  const selection = await selectPhotos(photos, {
    count,
    ...(usingVision ? { apiKey: resolveOpenRouterKey(), model: typeof args.model === 'string' ? args.model : undefined } : {}),
  })
  if (!selection.picks.length) throw new Error('No images selected (all hard-blocked, or none had a cf_image_id).')

  console.log(`Album ${albumKey}: ${selection.selectedOf} selected` +
    (selection.strategy === 'vision'
      ? ` (vision model pick${selection.fallbackUsed ? `, FELL BACK: ${selection.fallbackReason}` : ` — cost $${(selection.costUsd ?? 0).toFixed(4)}`})`
      : selection.usedQuality ? ' (ranked by quality score)' : ' (quality score flat/unusable — ranked by caption heuristic)'))

  const account = accountForSeries(series)
  const slug = createAlbumSlug(albumName, albumKey)
  const galleryUrl = `${site}/albums/${slug}`

  const now = new Date()
  const holdUntil = new Date(now.getTime() + holdHours * 3600_000).toISOString()
  // The item's ACTUAL earliest publish time — eligibleNow() in worker/src/index.js gates a
  // scheduledAt item on this timestamp alone, at any hour, never on ALLOWED_HOURS_UTC. Nino,
  // 2026-09-26: "the post goes out at the first ALLOWED_HOURS_UTC slot at or after holdUntil"
  // — that used to be true only of the HELD alert's claim, not of the code (scheduledAt was
  // set equal to holdUntil, so a hold clearing at 2am would publish at 2am, any hour). Fixed
  // here so the alert's "Posts <slot>" title is no longer a claim the Worker can contradict.
  const nextSlot = nextAllowedSlot(holdUntil, allowedHoursUtc())

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
    album_name: albumName, // carried so the Worker can name the album in a POSTED/FAILED notification without an extra lookup
    account,
    media_type: 'CAROUSEL',
    channels: ['instagram', 'facebook'],
    caption,
    facebook_caption: caption,
    facebook_alt_text: facebookAltText,
    children: children.map(({ _source, _image_key, ...c }) => c), // internal fields stay off the published payload
    user_tags: [],
    collaborators: ['flickday.media'],
    scheduledAt: nextSlot,
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

  // perPhoto (vision strategy only) is already in final picking order — same order as `children`.
  const perPhotoByKey = new Map((selection.perPhoto || []).map((p) => [p.image_key, p]))

  const manifest = {
    authority: 'Nino, 2026-09-25 (chat): "Standing auto-post" — a standing gallery-announcements route, by series, ' +
      'collab with flickday, all galleries eligible. See graph-routes.json "gallery-announce".',
    account,
    collaborators: item.collaborators,
    content: 'carousel',
    assets: selection.selectedOf,
    selected: children.map((c, i) => {
      const p = perPhotoByKey.get(c._image_key)
      return {
        order: i + 1, image_key: c._image_key, url: c.image_url, source: c._source, alt_text: c.alt_text,
        ...(p ? { why_kept: p.why_kept, sharpness: p.sharpness, orientation: p.orientation, model_reason: p.reason } : {}),
      }
    }),
    caption,
    alt_text: children.map((c) => c.alt_text),
    surface: 'Graph publisher standing route gallery-announce',
    route_reason: 'standing route, see graph-routes.json "gallery-announce"',
    holdUntil,
    series,
    album_key: albumKey,
    album_name: albumName,
    gallery_url: galleryUrl,
    selection_strategy: selection.strategy || 'caption',
    ...(selection.strategy === 'vision' ? {
      selection_totals: {
        selected_of: selection.selectedOf,
        majority_orientation: selection.majorityOrientation,
        orientation_counts: selection.orientationCounts,
        dropped_by_orientation: selection.droppedByOrientation,
        dropped_by_sharpness: selection.droppedBySharpness,
        sharpness_threshold: selection.sharpnessThreshold,
        shortlist_size: selection.shortlistSize,
        analysis_errors: selection.analysisErrors,
      },
      model: selection.model,
      cost_usd: selection.costUsd,
      cost_method: selection.costMethod,
      fallback_used: selection.fallbackUsed,
      fallback_reason: selection.fallbackReason,
    } : {}),
    usedQuality: selection.usedQuality,
  }

  if (dryRun) {
    // --out lets a test (or an operator comparing two runs) point the manifest
    // somewhere other than the repo's real .temp/ — otherwise a test run's
    // --count 3 silently overwrites a real --count 10 manifest sitting there,
    // because both write the exact same filename.
    const outDir = typeof args.out === 'string' ? dirname(args.out) : join(HERE, '..', '..', '.temp')
    mkdirSync(outDir, { recursive: true })
    const outPath = typeof args.out === 'string' ? args.out : join(outDir, `gallery-announce-${albumKey}.dry-run.json`)
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
  const hasRoute = !!standingEntry(EVENT, loadRoutes())
  console.log(nextStepMessage(hasRoute))

  // HELD notification — non-dry-run only, since a dry run touches nothing else either.
  // Never blocks or fails the build: notify() itself never throws, and any failure here is
  // logged, not surfaced as an error on this otherwise-successful append.
  const reviewKey = resolveReviewKey()
  const heldBuild = heldNotification({
    shortName: shortAlbumName(albumName, albumKey),
    photoCount: children.length,
    holdUntilIso: holdUntil,
    nextSlotIso: nextSlot, // the SAME value now written onto item.scheduledAt — one computation, not two
    reviewUrl: reviewUrlFor(reviewKey, item.id),
    reviewCancelUrl: reviewCancelUrlFor(reviewKey, item.id),
  })
  const topic = resolveNtfyTopic()
  await notify({ topic, ...heldBuild })

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
