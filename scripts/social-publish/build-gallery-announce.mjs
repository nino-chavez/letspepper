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
 *   --refresh-caption      rebuild ONLY the caption of this album's item in the LIVE queue (KV),
 *                          keeping its photos, alt text and schedule. --series is taken from the
 *                          item's recorded series (or, for older items, its account), and refused
 *                          if a passed --series disagrees. Writes the
 *                          captions (Instagram and Facebook) to queue/<id>.captions.json; seed-kv.mjs
 *                          --recaption pushes them,
 *                          refusing unless the live item is still held on both channels.
 *
 * A college album's caption also states the match result, looked up on The Rotation
 * (rotation-result.mjs); any other album, or any failed lookup, states none.
 *   --name <string>        override the resolved album display name.
 *   --site <url>           gallery base. Default https://ninochavez.co/photography.
 *   --bucket / --public-base   R2 target for a REAL (non-dry-run) build. Same
 *                          defaults as build-album-carousel.mjs (flickday-social).
 *   --story-out <path>     dry-run only: write the companion Story PNG here instead of
 *                          .temp/gallery-announce-<key>-story.dry-run.png.
 *
 * Companion Story (2026-09-26): every build also produces a Story item (media_type STORIES),
 * linked to its carousel (`linked_item_id`), same account and hold window, scheduled a few
 * minutes after it. Its image is a fresh 1080x1920 render of the carousel's lead slide with a
 * matchup + date overlay (companion-story.mjs) — appended to the SAME queue right after the
 * carousel, so /review and the HELD alert show it next to its carousel. Vetoing the carousel
 * cascades to the Story (veto-shape.mjs); a carousel that fails or is still transcoding holds
 * the Story back too, and permanently blocks it once the carousel goes terminal
 * (hold-shape.mjs's linkedItemBlock(), wired into the Worker's postDuePending — the schedule
 * offset alone is never the only thing gating this). The route gate separately refuses to
 * publish the Story at all unless graph-routes.json's "gallery-announce" entry explicitly lists
 * "STORIES" in a "media_types" array, which it does not yet — Nino has not approved Stories for
 * this campaign (see SETUP.md).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import selectGalleryPhotosDefault, { selectGalleryPhotosByCaption } from './select-gallery-photos.mjs'
import { altTextFromCaption } from './alt-text.mjs'
import { buildGalleryAnnounceCaption, shortAlbumName } from './gallery-announce-caption.mjs'
import { isCollegeAlbum, lookupCollegeResult } from './rotation-result.mjs'
import { schoolTagsForAlbum } from './school-tags.mjs'
import { readLive } from './seed-kv.mjs'
import { notify, heldNotification, nextAllowedSlot, reviewUrlFor, reviewCancelUrlFor } from './notify.mjs'
import { loadRoutes, standingEntry } from './route-gate.mjs'
import { companionStoryText, companionStoryHtml, companionStoryItem, renderCompanionStoryImage } from './companion-story.mjs'
import { cfLarge as cfLargeSource, galleryPhotoSource, hasInstagramCompatibleAspectRatio, r2PutPhoto } from './gallery-photo-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EVENT = 'gallery-announce'
const IG_CAROUSEL_MAX = 10
// Where a confirmed school tag lands on the carousel's first slide — near the bottom edge,
// spread left/right so two tags never overlap and neither sits over the action in the frame
// (which these galleries generally center). Meta's IG User /media reference requires x/y for
// an image user_tag (fetched 2026-09-26): both float 0.0-1.0, "percentage distance from left
// edge" (x) / "top edge" (y) of the published image.
const SCHOOL_TAG_POSITIONS = [{ x: 0.08, y: 0.92 }, { x: 0.92, y: 0.92 }]
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

export function cfLarge(id) { return cfLargeSource(id) }

/** Account slug for the item, from Nino's "by series and collab with flickday" answer. */
export function accountForSeries(series) { return series === 'lpo' ? 'letspepper' : 'ninophoto' }

/** Inverse of accountForSeries — the series of an item built before items carried their own
 * `series` field (Re7kho, DWdCET). A reassigned item keeps its recorded series instead, because
 * an album's series is a fact about the album, not about the account that posts it. */
export function seriesForAccount(account) { return account === 'letspepper' ? 'lpo' : 'other' }

/**
 * Attaches confirmed school tags to a carousel's FIRST slide only — never spread across
 * slides, never on the parent container (Meta's Carousel Containers request syntax lists
 * `collaborators` but not `user_tags`; each carousel child's own image-container request is
 * where `user_tags` belongs — fetched from Meta's IG User /media reference 2026-09-26). Pure,
 * and a no-op when there are no confirmed tags or no children, so it's safe to call
 * unconditionally. Mutates nothing — returns a new children array.
 */
export function applySchoolTagsToChildren(children, tags = []) {
  if (!children.length || !tags.length) return children
  const user_tags = tags.map((t, i) => ({ username: t.handle, ...(SCHOOL_TAG_POSITIONS[i] || SCHOOL_TAG_POSITIONS.at(-1)) }))
  return children.map((c, i) => (i === 0 ? { ...c, user_tags } : c))
}

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

/** school-tags.mjs's live re-confirmation needs the same Instagram System User token
 * post-reels.mjs uses to publish — read here, not in that module, same pattern as
 * resolveOpenRouterKey() above (the module only ever takes a token as a parameter, never
 * looks one up or logs one). NTFY_DISABLED doubles as this project's "don't touch 1Password
 * or the network" test flag (see resolveNtfyTopic/resolveReviewKey below) — reused here so a
 * test run never shells out to `op` OR calls the real business_discovery endpoint; a test
 * that wants to exercise confirmHandle() passes its own token/fetchImpl straight through to
 * schoolTagsForAlbum instead. Missing/unresolvable is not fatal: every candidate handle then
 * simply fails confirmation and lands in `pending`, never `tags` — fail-closed, not fail-open. */
function resolveMetaToken() {
  if (process.env.IG_ACCESS_TOKEN) return process.env.IG_ACCESS_TOKEN
  if (process.env.NTFY_DISABLED) return undefined
  try {
    return execFileSync('op', ['read', 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch (e) {
    console.error(`resolveMetaToken: could not read a Meta token (${e.message}) — no school-tag handle can be confirmed; every candidate goes to "pending".`)
    return undefined
  }
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

/** Re-hosts exact JPEG bytes on R2. HDR rows use /api/hdr/<photo_id>; no transform occurs. */
async function r2Put({ bucket, publicBase, event, photo, site, key }) {
  const tmp = join(tmpdir(), `galann-${key.replace(/\W/g, '_')}.jpg`)
  return r2PutPhoto({ bucket, publicBase, event, photo, site, key, tmp })
}

/** Same wrangler upload r2Put() uses, but for a file already on disk (the rendered companion
 * Story PNG) instead of a Cloudflare Images fetch — NEVER called in --dry-run. */
function r2PutLocalFile({ bucket, publicBase, event, filePath, key, contentType = 'image/png' }) {
  const objectKey = `${event}/${key}`
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
    `--file=${filePath}`, `--content-type=${contentType}`, '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] })
  return `${publicBase}/${objectKey}`
}

/**
 * --refresh-caption: rebuild the caption of this album's LIVE queue item. KV, not the local
 * queue file, is the record of what the Worker has published, so both the item's facts
 * (photo count, account) and the held check come from KV. The push itself stays with
 * seed-kv.mjs --recaption, the one writer of the live queue.
 */
async function refreshCaption(args, albumKey, seriesArg) {
  const site = (typeof args.site === 'string' ? args.site : 'https://ninochavez.co/photography').replace(/\/$/, '')
  const id = `${albumKey}-${EVENT}`
  const item = (readLive(EVENT)?.items || []).find((it) => it.id === id)
  if (!item) throw new Error(`no live item "${id}" in KV key "${EVENT}" — nothing to refresh.`)
  if (item.status !== 'held' || item.facebook_status !== 'held') {
    throw new Error(`live item "${id}" is ${item.status}/${item.facebook_status}, not held/held — its caption can no longer change.`)
  }
  const series = item.series ?? seriesForAccount(item.account)
  if (seriesArg && seriesArg !== series) {
    throw new Error(`--series ${seriesArg} disagrees with the queued item, which posts from ${item.account} (series ${series}).`)
  }
  const photos = await fetchAllPhotos(site, albumKey)
  if (!photos.length) throw new Error(`No photos for album "${albumKey}" at ${site}`)
  const albumName = await resolveAlbumName(site, albumKey, args.name)
  const { result, reason } = await lookupCollegeResult(albumName)
  console.log(result ? `Result (The Rotation): ${result.line}` : `No result line: ${reason}`)
  // The live item's own school_tags.tagged (set once, at the original build — see main()'s
  // schoolTagsForAlbum() call) is the confirmed-tag record; a caption refresh only rebuilds
  // TEXT (never children[0].user_tags, which is already published or already queued), so it
  // reads the recorded confirmation instead of re-confirming live again. An item built before
  // this field existed has no `school_tags` and gets no mention line on refresh — accurate,
  // since nothing was ever confirmed for it.
  const existingTags = (item.school_tags?.tagged) || []
  const captionArgs = {
    albumName, venue: args.venue, teams: args.teams, eventDateLabel: args['event-date'],
    galleryUrl: `${site}/albums/${createAlbumSlug(albumName, albumKey)}`,
    selectedOf: `${item.children.length} of ${photos.length}`, series, result, schoolTags: existingTags,
  }
  const captions = {
    caption: buildGalleryAnnounceCaption({ ...captionArgs, channel: 'instagram' }),
    facebook_caption: buildGalleryAnnounceCaption({ ...captionArgs, channel: 'facebook' }),
  }
  const captionPath = join(HERE, 'queue', `${id}.captions.json`)
  mkdirSync(dirname(captionPath), { recursive: true })
  writeFileSync(captionPath, `${JSON.stringify(captions, null, 2)}\n`)
  console.log(`Instagram caption of ${id} changes from:\n${item.caption}\n\nto:\n${captions.caption}\n`)
  console.log(`Facebook caption of ${id} changes from:\n${item.facebook_caption ?? item.caption}\n\nto:\n${captions.facebook_caption}\n`)
  console.log(`Wrote ${captionPath}. Next: seed-kv.mjs --event ${EVENT} --recaption ${id} --caption-file ${captionPath} --put`)
  return { before: item.caption, after: captions, captionPath }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const albumKey = typeof args['album-key'] === 'string' ? args['album-key'] : null
  const series = args.series === 'lpo' ? 'lpo' : args.series === 'other' ? 'other' : null
  if (!albumKey) throw new Error('Required: --album-key <key> --series <lpo|other>')
  if (args['refresh-caption']) return refreshCaption(args, albumKey, series)
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
  const { result: matchResult, reason: resultReason } = await lookupCollegeResult(albumName)
  console.log(matchResult ? `Result (The Rotation): ${matchResult.line}` : `No result line: ${resultReason}`)

  // resolveMetaToken() shells out to `op` when IG_ACCESS_TOKEN isn't set — only pay that
  // cost (and only risk that side effect) for an album school-tags.mjs will actually use it
  // for; isCollegeAlbum() itself never touches the network.
  const schoolTags = await schoolTagsForAlbum(albumName, { token: isCollegeAlbum(albumName) ? resolveMetaToken() : undefined })
  if (schoolTags.tags.length) console.log(`School tags: ${schoolTags.tags.map((t) => `@${t.handle} (${t.albumTeamName})`).join(', ')}`)
  if (schoolTags.pending.length) console.log(`School tags to add by hand: ${schoolTags.pending.map((t) => `${t.albumTeamName}${t.handle ? ` (@${t.handle})` : ''} — ${t.reason}`).join('; ')}`)

  const strategyArg = typeof args.strategy === 'string' ? args.strategy : null
  const selectPhotos = await loadStrategy(strategyArg)
  const usingVision = selectPhotos === selectGalleryPhotosDefault
  const selection = await selectPhotos(photos, {
    count,
    ...(usingVision ? { apiKey: resolveOpenRouterKey(), model: typeof args.model === 'string' ? args.model : undefined } : {}),
  })
  if (!selection.picks.length) throw new Error('No images selected (all hard-blocked, or none had a cf_image_id).')
  // Both CF `large` and the HDR original preserve the source aspect ratio. Meta
  // accepts images from 4:5 through 1.91:1, so do not queue a known 2:3 portrait
  // that Meta will reject. No crop/re-encode is allowed here because it strips HDR.
  const picks = selection.picks.filter(hasInstagramCompatibleAspectRatio)
  const rejectedForAspectRatio = selection.picks.length - picks.length
  if (!picks.length) throw new Error('No images selected with an Instagram-compatible aspect ratio (4:5 through 1.91:1).')
  const selectedOf = `${picks.length} of ${photos.length}`

  console.log(`Album ${albumKey}: ${selectedOf} selected` +
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

  // Children: real R2 hosting for a live build. HDR rows fetch the photography
  // site's JPEG and copy its bytes directly to R2; dry runs only name that source.
  const children = []
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i]
    const n = String(i + 1).padStart(2, '0')
    const altText = altTextFromCaption(p.caption)
    const source = galleryPhotoSource(p, site)
    const hosted = dryRun
      ? { url: source.url, source }
      : await r2Put({ bucket, publicBase, event: `${EVENT}-${albumKey}`, photo: p, site, key: `slide-${n}` })
    children.push({ media_type: 'IMAGE', image_url: hosted.url, alt_text: altText, _source: dryRun ? `${source.kind} (NOT yet re-hosted on R2 — dry-run only)` : `r2 (${hosted.source.kind})`, _image_key: p.image_key })
  }
  const taggedChildren = applySchoolTagsToChildren(children, schoolTags.tags)

  const captionArgs = {
    albumName, venue: args.venue, teams: args.teams, eventDateLabel: args['event-date'],
    galleryUrl, selectedOf, series, result: matchResult, schoolTags: schoolTags.tags,
  }
  const caption = buildGalleryAnnounceCaption({ ...captionArgs, channel: 'instagram' })
  const facebookCaption = buildGalleryAnnounceCaption({ ...captionArgs, channel: 'facebook' })
  const facebookAltText = children[0]?.alt_text || null

  const item = {
    id: `${albumKey}-${EVENT}`,
    album_key: albumKey,
    album_name: albumName, // carried so the Worker can name the album in a POSTED/FAILED notification without an extra lookup
    account,
    series, // the album's series, so --refresh-caption rebuilds series content even after --reassign
    media_type: 'CAROUSEL',
    channels: ['instagram', 'facebook'],
    caption,
    facebook_caption: facebookCaption,
    facebook_alt_text: facebookAltText,
    children: taggedChildren.map(({ _source, _image_key, ...c }) => c), // internal fields stay off the published payload
    user_tags: [],
    collaborators: ['flickday.media'],
    // Confirmed handles are already ON children[0].user_tags above (that's where Meta's own
    // /media reference puts a carousel child's tags); this is a review-surface record, not a
    // second copy the Worker publishes from. `pending` is what the /review page and the HELD
    // notification's own alert (see notify.mjs) point Nino at for "add by hand".
    school_tags: { tagged: schoolTags.tags, pending: schoolTags.pending },
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
    assets: selectedOf,
    selected: taggedChildren.map((c, i) => {
      const p = perPhotoByKey.get(c._image_key)
      return {
        order: i + 1, image_key: c._image_key, url: c.image_url, source: c._source, alt_text: c.alt_text,
        ...(c.user_tags ? { user_tags: c.user_tags } : {}),
        ...(p ? { why_kept: p.why_kept, sharpness: p.sharpness, orientation: p.orientation, model_reason: p.reason } : {}),
      }
    }),
    caption,
    alt_text: taggedChildren.map((c) => c.alt_text),
    // Confirmed vs. "add by hand" — see item.school_tags for the same shape carried into KV.
    school_tags: { tagged: schoolTags.tags, pending: schoolTags.pending },
    surface: 'Graph publisher standing route gallery-announce',
    route_reason: 'standing route, see graph-routes.json "gallery-announce"',
    holdUntil,
    series,
    album_key: albumKey,
    album_name: albumName,
    gallery_url: galleryUrl,
    selection_strategy: selection.strategy || 'caption',
    ...(rejectedForAspectRatio ? { rejected_for_instagram_aspect_ratio: rejectedForAspectRatio } : {}),
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

  // Companion Story (2026-09-26) — one per carousel, linked to it, same account and hold
  // window, scheduled STORY_DELAY_MINUTES after the carousel's own scheduledAt. Derived
  // entirely from `item` (already built above) so the two can never disagree on account,
  // series, schedule, or which school tags were actually confirmed. See companion-story.mjs's
  // header for the crop choice, the tag rules, and what Stories do and don't support.
  const storyText = companionStoryText(albumName, { teams: args.teams, eventDateLabel: args['event-date'] })
  const storyHtml = companionStoryHtml({ imageUrl: children[0].image_url, matchup: storyText.matchup, dateLabel: storyText.dateLabel })
  // Dry run: rendered next to the manifest so it can be opened and eyeballed, same --out
  // convention as the manifest itself. Real build: rendered to a scratch temp file, then
  // uploaded to R2 like every carousel slide — the local render is never the published asset.
  const storyOutDir = dryRun ? (typeof args.out === 'string' ? dirname(args.out) : join(HERE, '..', '..', '.temp')) : tmpdir()
  const storyLocalPath = typeof args['story-out'] === 'string' ? args['story-out']
    : join(storyOutDir, dryRun ? `gallery-announce-${albumKey}-story.dry-run.png` : `galann-${albumKey}-story.png`)
  await renderCompanionStoryImage({ html: storyHtml, outPath: storyLocalPath })
  const storyImageUrl = dryRun
    ? pathToFileURL(storyLocalPath).href // local file, unhosted — mirrors the carousel's own dry-run convention
    : r2PutLocalFile({ bucket, publicBase, event: `${EVENT}-${albumKey}`, filePath: storyLocalPath, key: 'story.png' })
  const storyItem = companionStoryItem(item, { imageUrl: storyImageUrl })

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
    console.log(`[dry-run] Wrote companion Story image: ${storyLocalPath}`)
    console.log('[dry-run] No R2 upload, no queue write, no Graph call, no wrangler call.')
    return { manifest, outPath, item, story: { item: storyItem, imagePath: storyLocalPath } }
  }

  const queuePath = join(HERE, 'queue', `${EVENT}.json`)
  const existing = existsSync(queuePath) ? JSON.parse(readFileSync(queuePath, 'utf8')) : { event: EVENT, items: [] }
  let queue = existing
  for (const it of [item, storyItem]) {
    const result = appendGalleryAnnounceItem(queue, it)
    if (result.refused) { console.error(`REFUSED — ${result.refused}`); process.exitCode = 1; return { refused: result.refused } }
    queue = result.queue
  }
  mkdirSync(dirname(queuePath), { recursive: true })
  writeFileSync(queuePath, JSON.stringify(queue, null, 2))
  console.log(`Appended ${item.id} and ${storyItem.id} to ${queuePath} (${queue.items.length} items total). Held until ${holdUntil}.`)
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
    pendingSchoolTeams: schoolTags.pending.map((t) => t.albumTeamName),
    hasStory: true,
  })
  const topic = resolveNtfyTopic()
  await notify({ topic, ...heldBuild })

  return { item, story: { item: storyItem }, queuePath }
}

// realpathSync before comparing: see hold-shape.mjs-adjacent scripts (veto-announce.mjs,
// seed-kv.mjs) for why a bare pathToFileURL(process.argv[1]) comparison silently loses
// under a symlinked cwd (macOS mkdtemp under /var -> /private/var, etc).
let isEntryPoint = false
try { isEntryPoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1] || '')).href } catch { /* not the entry point */ }
if (isEntryPoint) {
  main().catch((e) => { console.error(`ERROR — ${e.message}`); process.exitCode = 1 })
}
