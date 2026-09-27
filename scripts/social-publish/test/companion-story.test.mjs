import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  companionStoryItem, companionStoryText, companionStoryHtml, renderCompanionStoryImage,
  STORY_WIDTH, STORY_HEIGHT, STORY_DELAY_MINUTES,
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
