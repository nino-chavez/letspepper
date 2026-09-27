import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  companionStoryItem, companionStoryText, companionStoryHtml, renderCompanionStoryImage, measureOverlayBox,
  STORY_WIDTH, STORY_HEIGHT, STORY_DELAY_MINUTES, SAFE_TOP, SAFE_BOTTOM,
} from '../companion-story.mjs'
import { verifyPng } from '../../story-assets/preflight.mjs'

const CAROUSEL = {
  id: 'DWdCET-gallery-announce',
  album_key: 'DWdCET',
  album_name: 'College Women\'s VB - Millikin at North Central - 09-23-2026',
  account: 'ninophoto',
  series: 'other',
  media_type: 'CAROUSEL',
  channels: ['instagram', 'facebook'],
  scheduledAt: '2026-09-27T17:00:00.000Z',
  holdUntil: '2026-09-26T22:00:00.000Z',
  school_tags: {
    tagged: [{ albumTeamName: 'North Central', key: 'north-central', handle: 'nccwomensvb', scope: 'program' }],
    pending: [{ albumTeamName: 'Millikin', key: 'millikin', handle: null, reason: 'no graph-verified Instagram handle' }],
  },
}

// --- linkage --------------------------------------------------------------

test('companionStoryItem: linked to its carousel, same account/series, media_type STORIES, Instagram-only channel', () => {
  const it = companionStoryItem(CAROUSEL, { imageUrl: 'https://pub.example/story.png' })
  assert.equal(it.id, 'DWdCET-gallery-announce-story')
  assert.equal(it.linked_item_id, CAROUSEL.id)
  assert.equal(it.album_key, CAROUSEL.album_key)
  assert.equal(it.account, CAROUSEL.account)
  assert.equal(it.series, CAROUSEL.series)
  assert.equal(it.media_type, 'STORIES')
  assert.deepEqual(it.channels, ['instagram'])
  assert.equal(it.image_url, 'https://pub.example/story.png')
})

test('companionStoryItem: same hold window as the carousel, scheduled STORY_DELAY_MINUTES after it', () => {
  const it = companionStoryItem(CAROUSEL, { imageUrl: 'x' })
  assert.equal(it.holdUntil, CAROUSEL.holdUntil)
  assert.equal(it.status, 'held')
  const expected = new Date(Date.parse(CAROUSEL.scheduledAt) + STORY_DELAY_MINUTES * 60_000).toISOString()
  assert.equal(it.scheduledAt, expected)
  assert.ok(Date.parse(it.scheduledAt) > Date.parse(CAROUSEL.scheduledAt), 'scheduled strictly after the carousel')
})

test('companionStoryItem: a custom minutesAfter is honored', () => {
  const it = companionStoryItem(CAROUSEL, { imageUrl: 'x', minutesAfter: 5 })
  assert.equal(it.scheduledAt, new Date(Date.parse(CAROUSEL.scheduledAt) + 5 * 60_000).toISOString())
})

test('companionStoryItem: never carries a caption, collaborators, or alt_text — Stories do not support them', () => {
  const it = companionStoryItem(CAROUSEL, { imageUrl: 'x' })
  assert.equal('caption' in it, false)
  assert.equal('facebook_caption' in it, false)
  assert.equal('collaborators' in it, false)
  assert.equal('alt_text' in it, false)
})

test('companionStoryItem: refuses a carousel item with no id', () => {
  assert.throws(() => companionStoryItem({}, { imageUrl: 'x' }), /needs an id/)
})

// --- tags -------------------------------------------------------------------

test('companionStoryItem: user_tags mentions CONFIRMED school handles plus flickday.media, never a pending (unconfirmed) one', () => {
  const it = companionStoryItem(CAROUSEL, { imageUrl: 'x' })
  assert.deepEqual(it.user_tags, [{ username: 'nccwomensvb' }, { username: 'flickday.media' }])
  assert.ok(!it.user_tags.some((t) => t.username === 'millikin'), 'the unconfirmed Millikin handle must never be tagged')
})

test('companionStoryItem: no school tags at all (non-college album) still tags flickday.media', () => {
  const noSchool = { ...CAROUSEL, school_tags: undefined }
  const it = companionStoryItem(noSchool, { imageUrl: 'x' })
  assert.deepEqual(it.user_tags, [{ username: 'flickday.media' }])
})

// --- overlay text -------------------------------------------------------------

test('companionStoryText: derives matchup + date from the SAME parseAlbumName the caption uses', () => {
  const { matchup, dateLabel } = companionStoryText(CAROUSEL.album_name)
  assert.equal(matchup, 'Millikin at North Central')
  assert.equal(dateLabel, 'Sept. 23, 2026')
})

test('companionStoryText: --teams/--event-date overrides win, same as the caption builder\'s own overrides', () => {
  const { matchup, dateLabel } = companionStoryText(CAROUSEL.album_name, { teams: 'Override Team', eventDateLabel: 'Some Day' })
  assert.equal(matchup, 'Override Team')
  assert.equal(dateLabel, 'Some Day')
})

test('companionStoryHtml: pure — embeds the image url, matchup and date, and never a caption/CTA', () => {
  const html = companionStoryHtml({ imageUrl: 'https://pub.example/lead.jpg', matchup: 'Millikin at North Central', dateLabel: 'Sept. 23, 2026' })
  assert.match(html, /https:\/\/pub\.example\/lead\.jpg/)
  assert.match(html, /Millikin at North Central/)
  assert.match(html, /Sept\. 23, 2026/)
  assert.doesNotMatch(html, /letspepper\.com|link in bio/i, 'the Story overlay carries no caption/CTA text')
})

test('companionStoryHtml: escapes html-significant characters in the matchup/date', () => {
  const html = companionStoryHtml({ imageUrl: 'x', matchup: '<script>alert(1)</script>', dateLabel: 'a & b' })
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&amp; b/)
})

// --- crop (coordinator device review 2026-09-26: a bare cover crop sliced the ball off the
// top edge of the DWdCET render — see companion-story.mjs's own header for the full story) ---

test('companionStoryHtml: the photo is never cropped (object-fit: contain) — a blurred cover backdrop provides the full-bleed feel instead', () => {
  const html = companionStoryHtml({ imageUrl: 'x', matchup: 'x' })
  assert.match(html, /\.photo\{[^}]*object-fit:contain/, 'the sharp foreground copy must never crop the source photo')
  assert.match(html, /\.backdrop\{[^}]*object-fit:cover/, 'the backdrop is the one layer allowed to crop/fill')
  assert.match(html, /\.backdrop\{[^}]*filter:blur/, 'the backdrop must be blurred so it never shows legible cropped detail')
  assert.doesNotMatch(html, /\.photo\{[^}]*object-position/, 'contain-fit has no crop to bias, so no object-position on the foreground')
})

// --- safe area (same review: the text block sat at ~1665-1810px, inside the reply-bar zone) ---

const SOLID_SVG_1080x1920 = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#334455"/></svg>',
)

test('the overlay box stays fully inside the safe area for a short matchup/date', async () => {
  const html = companionStoryHtml({ imageUrl: SOLID_SVG_1080x1920, matchup: 'JCA at ACC', dateLabel: 'Sept. 22, 2026' })
  const box = await measureOverlayBox(html)
  assert.ok(box, 'the .stack element must render with a real bounding box')
  assert.ok(box.y >= SAFE_TOP, `overlay top ${box.y} must be at or below (numerically >=) SAFE_TOP ${SAFE_TOP}`)
  assert.ok(box.y + box.height <= SAFE_BOTTOM, `overlay bottom ${box.y + box.height} must be at or above SAFE_BOTTOM ${SAFE_BOTTOM}`)
})

test('the overlay box stays inside the safe area for a long matchup that wraps to two lines', async () => {
  const html = companionStoryHtml({
    imageUrl: SOLID_SVG_1080x1920,
    matchup: 'College Womens VB - Millikin at North Central Fighting Illini',
    dateLabel: 'September 23rd, 2026',
  })
  const box = await measureOverlayBox(html)
  assert.ok(box.y >= SAFE_TOP, `overlay top ${box.y}`)
  assert.ok(box.y + box.height <= SAFE_BOTTOM, `overlay bottom ${box.y + box.height} must stay <= SAFE_BOTTOM ${SAFE_BOTTOM} even wrapped`)
})

test('the overlay box stays inside the safe area with no date line at all', async () => {
  const html = companionStoryHtml({ imageUrl: SOLID_SVG_1080x1920, matchup: 'Bell Pepper Open' })
  const box = await measureOverlayBox(html)
  assert.ok(box.y >= SAFE_TOP)
  assert.ok(box.y + box.height <= SAFE_BOTTOM)
})

// --- the photo itself must also stay inside the safe area (code review 2026-09-26, second
// pass): containing the WHOLE photo into the full 1080x1920 canvas stopped the slicing but not
// the underlying visibility problem — for DWdCET's own 1600x2399 the contained image centers at
// y=150-1769, clear of the canvas edge but still 100px inside the 250px header zone. `.photo`
// is now itself constrained to [SAFE_TOP, SAFE_BOTTOM] before object-fit:contain runs. ---------

function svgDataUri(w, h) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#334455"/></svg>`)
}

test('the photo box stays fully inside the safe area for a 2:3 portrait source (DWdCET\'s own served dimensions)', async () => {
  const html = companionStoryHtml({ imageUrl: svgDataUri(1600, 2399), matchup: 'x' })
  const box = await measureOverlayBox(html, { selector: '.photo' })
  assert.ok(box.y >= SAFE_TOP, `photo top ${box.y} must not sit above SAFE_TOP ${SAFE_TOP}`)
  assert.ok(box.y + box.height <= SAFE_BOTTOM, `photo bottom ${box.y + box.height} must not extend below SAFE_BOTTOM ${SAFE_BOTTOM}`)
})

test('the photo box stays fully inside the safe area for a near-9:16 source (near-zero contain margin)', async () => {
  const html = companionStoryHtml({ imageUrl: svgDataUri(1080, 1920), matchup: 'x' })
  const box = await measureOverlayBox(html, { selector: '.photo' })
  assert.ok(box.y >= SAFE_TOP)
  assert.ok(box.y + box.height <= SAFE_BOTTOM)
})

test('the photo box stays fully inside the safe area for a landscape source (Re7kho\'s acc-v-jca-02, aspect_ratio 1.5)', async () => {
  const html = companionStoryHtml({ imageUrl: svgDataUri(1600, 1067), matchup: 'x' })
  const box = await measureOverlayBox(html, { selector: '.photo' })
  assert.ok(box.y >= SAFE_TOP)
  assert.ok(box.y + box.height <= SAFE_BOTTOM)
})

// --- image dimensions (real render) ------------------------------------------

test('renderCompanionStoryImage: writes an exact 1080x1920 PNG', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-story-render-'))
  const outPath = join(dir, 'story.png')
  try {
    const html = companionStoryHtml({ imageUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#334455"/></svg>'), matchup: 'Test Team at Other Team', dateLabel: 'Sept. 26, 2026' })
    await renderCompanionStoryImage({ html, outPath })
    // verifyPng throws on a mismatch — a clean return IS the assertion.
    verifyPng(outPath, { width: STORY_WIDTH, height: STORY_HEIGHT })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
