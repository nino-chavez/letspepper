/**
 * Companion Instagram Story for a gallery-announce carousel — so schools and followers see
 * each new gallery in Stories too, not only in the feed. One Story per carousel, linked to it
 * (`linked_item_id`), same account, same hold window, scheduled a few minutes after the
 * carousel's own scheduledAt so it can point people at the feed post that (by then) exists.
 *
 * Image: a single 1080x1920 render — the carousel's own lead (first) slide, full-bleed
 * (object-fit: cover, object-position 50% 40% — the same crop convention this repo's other
 * photo-led social renders already use for volleyball action, see
 * scripts/story-assets/render-jalapeno-announce.mjs's `nextUp()` and
 * scripts/story-assets/render-team-social.mjs's `werein()`), with a small legible
 * matchup + date label over a bottom scrim. Chosen over a letterboxed full frame because this
 * campaign's whole visual argument (DESIGN.md: "the chrome must never compete with the
 * photograph") is the same one the Let's Pepper renders already act on — a full-bleed crop
 * keeps the photo as the whole frame; letterbox bars are chrome competing with it, and are not
 * how any other social asset in either this repo or the photography site is built. The overlay
 * uses the PHOTOGRAPHY site's own type system (Montserrat display / Inter body, charcoal + gold
 * — DESIGN.md), not Let's Pepper's Bebas Neue/Anton stack, because this Story announces a
 * photography gallery and posts from either owned account depending on series.
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
.photo{position:absolute;inset:0;width:${width}px;height:${height}px;object-fit:cover;object-position:50% 40%}
.scrim{position:absolute;left:0;right:0;bottom:0;height:38%;
  background:linear-gradient(180deg, rgba(24,24,27,0) 0%, rgba(24,24,27,0.55) 40%, rgba(24,24,27,0.92) 100%)}
.frame{position:absolute;left:0;right:0;bottom:0;padding:0 72px 108px}
.eyebrow{font-family:'Inter',sans-serif;font-weight:600;font-size:22px;letter-spacing:0.18em;
  text-transform:uppercase;color:${GOLD_500}}
.headline{margin-top:14px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:64px;
  line-height:1.08;color:${CHARCOAL_50};text-shadow:0 4px 20px rgba(0,0,0,0.35)}
.date{margin-top:16px;font-family:'Inter',sans-serif;font-weight:400;font-size:28px;
  color:${CHARCOAL_300}}
</style></head><body>
  <img class="photo" src="${esc(imageUrl)}">
  <div class="scrim"></div>
  <div class="frame">
    <div class="eyebrow">New gallery</div>
    <div class="headline">${esc(headline)}</div>
    ${dateLabel ? `<div class="date">${esc(dateLabel)}</div>` : ''}
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
