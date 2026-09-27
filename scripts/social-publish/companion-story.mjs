/**
 * Companion Instagram Story for a gallery-announce carousel — so schools and followers see
 * each new gallery in Stories too, not only in the feed. One Story per carousel, linked to it
 * (`linked_item_id`), same account, same hold window, scheduled a few minutes after the
 * carousel's own scheduledAt so it can point people at the feed post that (by then) exists.
 *
 * Image: a single 1080x1920 render of the carousel's lead (first) slide, with a small legible
 * matchup + date label over a bottom scrim.
 *
 * CROP (revised 2026-09-26, coordinator device review of the DWdCET render): the first version
 * was a bare full-bleed `object-fit: cover` — no letterbox, on the theory that a crop keeps the
 * photo as the whole frame (DESIGN.md: "the chrome must never compete with the photograph").
 * That theory holds for the CROP MATH (a 2:3 portrait source into a 9:16 target crops the
 * SIDES only, never the top — verified: for DWdCET's actual served image, 1600x2399, cover
 * scales to 1280x1920, zero vertical overflow) but not for the RESULT: the reviewer opened the
 * rendered PNG and found the volleyball sliced by the frame's own top edge. Root cause,
 * confirmed by diffing the rendered top strip against the SAME crop of the untouched source
 * JPEG (identical): the ball sits hard against the top edge of the ORIGINAL photograph's own
 * composition. Zero object-fit crop still means zero MARGIN — action framed close to an edge
 * in-camera stays exactly that close in a bare cover render, portrait or not, and a real device
 * still doesn't render this reliably given HDR-camera compression, safe-area insets, and OS
 * differences (the coordinator's own words). No per-photo aspect-ratio branch closes that gap,
 * because it isn't a crop-math problem — a differently-framed photo could put the SAME edge
 * risk on either axis or on any side.
 *
 * FIX: full-bleed background of the SAME lead photo (`object-fit: cover`, heavily blurred +
 * darkened — no legible detail, just atmosphere and color, so the frame is never a flat bar) +
 * a SHARP foreground copy fit with `object-fit: contain` — the entire original photograph,
 * always, regardless of its aspect ratio. Nothing is ever cropped, so nothing framed near an
 * edge in-camera can ever be sliced by this render. The one thing this trades away is true
 * edge-to-edge sharp coverage on an aspect ratio far from 9:16 (a wide landscape source shows
 * more blurred margin top/bottom) — accepted deliberately: a soft blurred margin round a fully
 * intact photo beats a sharp frame that might cut the subject. Same technique Instagram's own
 * composer already applies automatically to a non-9:16 upload, so it reads as normal rather
 * than as a compromise. The overlay uses the PHOTOGRAPHY site's own type system (Montserrat
 * display / Inter body, charcoal + gold — DESIGN.md), not Let's Pepper's Bebas Neue/Anton stack,
 * because this Story announces a photography gallery and posts from either owned account
 * depending on series.
 *
 * SAFE AREA (added 2026-09-26, same review): Instagram's own chrome covers roughly the top
 * ~250px of a Story (profile header) and the bottom ~300px (reply/message bar) — device- and
 * app-version-dependent, so treat these as conservative, not exact. SAFE_TOP/SAFE_BOTTOM below
 * are the named bounds; `measureOverlayBox()` renders the same HTML and returns any element's
 * real rendered bounding box, so a test can assert something never regresses into either zone
 * without eyeballing a screenshot. Two things are checked against it, for different reasons:
 *   `.stack` (the text overlay) must stay inside it so the text is actually readable — the
 *     reviewer measured the shipped overlay at ~1665-1810px, inside the bottom zone, before
 *     this fix.
 *   `.photo` (the sharp foreground) must ALSO stay inside it — a SECOND review pass caught
 *     that the first version of the crop fix above contained the whole photo into the FULL
 *     1080x1920 canvas, which stopped the slicing but not the underlying visibility problem: for
 *     DWdCET (1600x2399), that centers the contained image at y=150-1769 — clear of this
 *     canvas's own edge, but still starting 100px inside the 250px header zone, so the ball that
 *     used to be sliced now sits under the app's own header instead. `.photo` is now itself
 *     constrained to `top: SAFE_TOP, height: SAFE_BOTTOM - SAFE_TOP` before object-fit:contain
 *     runs, so the ENTIRE photo — not just its edges — sits inside the same safe box the text
 *     does, for any source aspect ratio. The backdrop is NOT constrained this way; it's blurred
 *     atmosphere, never content a viewer needs to actually see.
 *
 * Rendered with Playwright + this repo's own story-assets/preflight.mjs machinery (localFonts,
 * assertPageReady, verifyPng) — the established renderer for every other social image here
 * (scripts/story-assets/render-*.mjs, scripts/media-kit/render-*.mjs) — rather than a new
 * dependency (sharp is already installed but has no text-layout primitive of its own; Chromium
 * does the typography and the compositing in one step, exactly as the other renderers do).
 *
 * Tags: Meta's IG User /media reference (fetched 2026-09-26, re-verified 2026-09-26 for this
 * build): `user_tags` IS supported on an image/video Story (added to that endpoint 2025-07-09
 * per Meta's own changelog) — x/y is "required for images, optional for stories" — but a Story
 * does NOT support link/poll/location stickers, a caption, or collaborators. So this module
 * tags (mentions) both schools' CONFIRMED handles (school-tags.mjs's `tags`, never `pending` —
 * same two-gate rule the carousel's own tags follow) plus flickday.media, and sends no caption,
 * no collaborators, and no sticker of any kind. worker/src/index.js's buildContainer() STORIES
 * branch is what actually sends user_tags on the Graph request; this module only builds the
 * item and the image. That branch also retries once without tags if Meta rejects them at
 * publish time — the same rule the carousel's own tagged child already follows, so a mention
 * Meta refuses never costs the whole Story.
 *
 * Publish is gated TWICE, independently: the route gate (this campaign's standing route must
 * explicitly list "STORIES" in its media_types — see route-shape.mjs's coversMediaType(), not
 * yet approved), and the linked-carousel dependency gate (hold-shape.mjs's linkedItemBlock(),
 * wired into the Worker's postDuePending) — a Story is never due before its carousel has
 * actually posted, and is permanently blocked if the carousel goes terminal (vetoed, or a
 * Graph error) first. The `linked_item_id` this module sets on the item is what that second
 * gate reads; nothing about the schedule offset alone stops a Story from outliving a carousel
 * that never posted.
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { localFonts, assertPageReady, verifyPng } from '../story-assets/preflight.mjs'
import { parseAlbumName } from './gallery-announce-caption.mjs'

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
// "scheduled shortly after the carousel posts" (brief) — long enough that the carousel's own
// container has almost certainly finished publishing (its own worst-case build is bounded by
// the Worker's per-tick subrequest budget, not by this number), short enough that the Story
// still reads as "just now" rather than a stale afterthought.
export const STORY_DELAY_MINUTES = 15

// Instagram Story safe area, in this canvas's own device pixels — see this file's header for
// the coordinator device review this came from. Conservative on purpose: the text overlay's
// rendered box must never extend above SAFE_TOP or below SAFE_BOTTOM.
export const SAFE_TOP = 250
export const SAFE_BOTTOM = STORY_HEIGHT - 300 // 1620
// The frame's own bottom padding needed to land the overlay's bottom edge exactly at
// SAFE_BOTTOM — derived, not a second number to keep in sync by hand.
const FRAME_BOTTOM_PADDING = STORY_HEIGHT - SAFE_BOTTOM

const FAMILIES = ['Montserrat', 'Inter']
const CHARCOAL_950 = '#18181b'
const CHARCOAL_50 = '#f8f8f9'
const CHARCOAL_300 = '#c0c2c8'
const GOLD_500 = '#eab308'

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Pure HTML builder — no network, no filesystem — so it's directly testable. `matchup` and
 * `dateLabel` come from the SAME parseAlbumName() the caption already uses (see
 * companionStoryItem below), so the Story never states a date the caption disagrees with.
 */
export function companionStoryHtml({ imageUrl, matchup, dateLabel, width = STORY_WIDTH, height = STORY_HEIGHT }) {
  const fonts = localFonts(...FAMILIES)
  const headline = matchup || 'New gallery'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${fonts}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;background:${CHARCOAL_950};overflow:hidden}
body{position:relative;font-family:'Inter',sans-serif;color:${CHARCOAL_50}}
/* Backdrop: same photo, full-bleed, blurred to pure atmosphere — never legible detail, so it
   never reads as a second competing image. transform:scale hides the blur's own soft edge. Not
   safe-area-constrained: it's atmosphere, never a subject a viewer needs to actually see. */
.backdrop{position:absolute;inset:0;width:${width}px;height:${height}px;object-fit:cover;
  filter:blur(60px) brightness(0.55) saturate(1.15);transform:scale(1.15)}
/* Foreground: the SAME photo, contain-fit, constrained to the SAFE AREA box (not the full
   canvas) — the entire original frame, always, so nothing framed close to an edge in-camera can
   ever be sliced by this render, AND its content never sits where Instagram's own header/reply
   bar can hide it either. A contain-fit into the full canvas (the first version of this fix)
   guarantees the first half of that but not the second: code review 2026-09-26 measured the
   DWdCET render's contained photo starting at y=150 — clear of this file's own top edge, but
   still inside SAFE_TOP's 250px header zone, which is exactly the kind of "technically not
   cropped, still not actually visible" gap a device review exists to catch. */
.photo{position:absolute;left:0;width:${width}px;top:${SAFE_TOP}px;height:${SAFE_BOTTOM - SAFE_TOP}px;object-fit:contain}
.scrim{position:absolute;left:0;right:0;bottom:0;height:38%;
  background:linear-gradient(180deg, rgba(24,24,27,0) 0%, rgba(24,24,27,0.55) 40%, rgba(24,24,27,0.92) 100%)}
.frame{position:absolute;left:0;right:0;bottom:0;padding:0 72px ${FRAME_BOTTOM_PADDING}px}
/* .stack has no padding of its own — its rendered bounding box IS the overlay's real footprint,
   which measureOverlayBox() below reads directly to prove it stays inside the safe area. */
.stack{}
.eyebrow{font-family:'Inter',sans-serif;font-weight:600;font-size:22px;letter-spacing:0.18em;
  text-transform:uppercase;color:${GOLD_500}}
.headline{margin-top:14px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:64px;
  line-height:1.08;color:${CHARCOAL_50};text-shadow:0 4px 20px rgba(0,0,0,0.35)}
.date{margin-top:16px;font-family:'Inter',sans-serif;font-weight:400;font-size:28px;
  color:${CHARCOAL_300}}
</style></head><body>
  <img class="backdrop" src="${esc(imageUrl)}">
  <img class="photo" src="${esc(imageUrl)}">
  <div class="scrim"></div>
  <div class="frame">
    <div class="stack">
      <div class="eyebrow">New gallery</div>
      <div class="headline">${esc(headline)}</div>
      ${dateLabel ? `<div class="date">${esc(dateLabel)}</div>` : ''}
    </div>
  </div>
</body></html>`
}

/** Playwright screenshot of `html` to a 1080x1920 PNG at `outPath` — deviceScaleFactor 1, so
 * the written file is exactly STORY_WIDTH x STORY_HEIGHT (the brief's literal spec), not the
 * 2x-supersampled size this repo's other, more heavily typographic renders use. Throws (never
 * silently ships a broken image) on a missing font or a photo that failed to decode — same
 * preflight contract as every other renderer here. */
export async function renderCompanionStoryImage({ html, outPath, width = STORY_WIDTH, height = STORY_HEIGHT }) {
  mkdirSync(join(outPath, '..'), { recursive: true })
  const tmpHtml = `${outPath}.render.html`
  writeFileSync(tmpHtml, html)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' })
    await assertPageReady(page, FAMILIES)
    await page.screenshot({ path: outPath })
    await page.close()
  } finally {
    await browser.close()
    rmSync(tmpHtml, { force: true })
  }
  verifyPng(outPath, { width, height })
  return outPath
}

/**
 * Renders `html` headlessly (no PNG written) and returns one element's real rendered bounding
 * box, so a test can prove it stays inside the safe area (SAFE_TOP/SAFE_BOTTOM above) without
 * eyeballing a screenshot every time this changes. `selector` defaults to `.stack` (the text
 * overlay); pass `.photo` to check the foreground photo's own box instead — both must stay
 * inside the same bounds, for different reasons (text must be readable; photo content must not
 * sit where it can be sliced OR hidden by Instagram's own header/reply-bar chrome — see this
 * file's header, "code review 2026-09-26"). Never fetches a real image over the network on its
 * own: pass a `data:` URI imageUrl (as the tests do) to keep this offline and fast.
 *
 * Navigates via a temp file + `page.goto(file://...)`, exactly like renderCompanionStoryImage —
 * NOT `page.setContent()`, which loads the page at an `about:blank`-ish origin where Chromium's
 * local-font `@font-face url(file://...)` references (localFonts()'s own mechanism) silently
 * fail to load, in turn making assertPageReady() throw "font not loaded" on every call. Same
 * file:// origin the real render uses is what makes the fonts (and therefore the measured
 * layout) match what actually gets published.
 */
export async function measureOverlayBox(html, { width = STORY_WIDTH, height = STORY_HEIGHT, selector = '.stack' } = {}) {
  const tmpHtml = join(tmpdir(), `companion-story-measure-${randomUUID()}.html`)
  writeFileSync(tmpHtml, html)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle' })
    await assertPageReady(page, FAMILIES)
    return await page.locator(selector).boundingBox()
  } finally {
    await browser.close()
    rmSync(tmpHtml, { force: true })
  }
}

/**
 * The Story queue item, derived entirely from its already-built carousel `item` — never
 * independently selects a photo, an account, or a schedule, so the two can never disagree.
 * `imageUrl` is the rendered Story image's own hosted (or, in a dry run, local temp) URL —
 * this module never uploads it; the caller (build-gallery-announce.mjs) does that the same
 * way it already hosts carousel slides.
 *
 * Fields deliberately OMITTED because Stories don't support them (see this file's header):
 * caption, facebook_caption, collaborators, alt_text. `channels` is Instagram-only — this
 * pipeline has no Facebook Story crosspost.
 */
export function companionStoryItem(carouselItem, { imageUrl, minutesAfter = STORY_DELAY_MINUTES } = {}) {
  if (!carouselItem?.id) throw new Error('companionStoryItem: carouselItem needs an id')
  const scheduledAt = new Date(Date.parse(carouselItem.scheduledAt) + minutesAfter * 60_000).toISOString()
  const confirmedTags = carouselItem.school_tags?.tagged || [] // NEVER `pending` — same rule the carousel's own tags follow
  const userTags = [...confirmedTags.map((t) => ({ username: t.handle })), { username: 'flickday.media' }]
  return {
    id: `${carouselItem.album_key}-gallery-announce-story`,
    album_key: carouselItem.album_key,
    album_name: carouselItem.album_name,
    account: carouselItem.account,
    series: carouselItem.series,
    media_type: 'STORIES',
    channels: ['instagram'],
    linked_item_id: carouselItem.id,
    image_url: imageUrl,
    user_tags: userTags,
    scheduledAt,
    holdUntil: carouselItem.holdUntil,
    status: 'held',
    ig_container_id: null,
    ig_media_id: null,
    posted_at: null,
    error: null,
  }
}

/** The matchup/date text for the overlay — the SAME parse the caption uses
 * (gallery-announce-caption.mjs's parseAlbumName), so the Story can never show a date or
 * matchup the caption disagrees with. `venue`/`teams`/`eventDateLabel` overrides mirror the
 * builder's own --venue/--teams/--event-date flags. */
export function companionStoryText(albumName, { teams, eventDateLabel } = {}) {
  const parsed = parseAlbumName(albumName)
  return { matchup: teams || parsed.teams || parsed.title, dateLabel: eventDateLabel || parsed.eventDateLabel }
}
