import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { selectGalleryPhotosByCaption as selectGalleryPhotos, qualitySpread, captionScore, isHardBlocked } from '../select-gallery-photos.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// A real, unmodified pull of album Re7kho (HS Girls VB - JCA at ACC - 09-22-2026,
// 120 photos) via the public /api/album-photos endpoint, taken 2026-09-25 — the
// exact album this task's dry run targets. Its quality scores are the measured
// "known to be nearly flat" case: composition_score has only 3 distinct values.
const RE7KHO = JSON.parse(readFileSync(join(HERE, 'fixtures', 're7kho-photos.json'), 'utf8'))

test('Re7kho: composition_score spread is measured as unusable (3 distinct values)', () => {
  const spread = qualitySpread(RE7KHO)
  assert.equal(spread.distinctComposition, 3)
  assert.equal(spread.useable, false)
})

test('Re7kho: selection falls back to the caption heuristic and reports 10 of 120', () => {
  const { picks, total, usedQuality, selectedOf } = selectGalleryPhotos(RE7KHO, { count: 10 })
  assert.equal(total, 120)
  assert.equal(picks.length, 10)
  assert.equal(selectedOf, '10 of 120')
  assert.equal(usedQuality, false)
})

test('Re7kho: the selection includes exactly one celebration frame (the album has 13)', () => {
  const { picks } = selectGalleryPhotos(RE7KHO, { count: 10 })
  const celebrations = picks.filter((p) => p.metadata.photo_category === 'celebration')
  assert.equal(celebrations.length, 1)
})

test('Re7kho: the selection spreads across more than one play_type and more than one time bucket', () => {
  const { picks } = selectGalleryPhotos(RE7KHO, { count: 10 })
  const playTypes = new Set(picks.map((p) => p.metadata.play_type).filter(Boolean))
  assert.ok(playTypes.size > 1, `expected more than one play_type, got ${[...playTypes]}`)
  const chrono = [...RE7KHO].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const third = Math.ceil(chrono.length / 3)
  const bucketOf = (key) => {
    const i = chrono.findIndex((p) => p.image_key === key)
    return i < third ? 'early' : i < 2 * third ? 'mid' : 'late'
  }
  const buckets = new Set(picks.map((p) => bucketOf(p.image_key)))
  assert.ok(buckets.size > 1, `expected more than one time bucket, got ${[...buckets]}`)
})

test('Re7kho: no duplicate picks', () => {
  const { picks } = selectGalleryPhotos(RE7KHO, { count: 10 })
  assert.equal(new Set(picks.map((p) => p.image_key)).size, picks.length)
})

test('a photo without cf_image_id is never selectable', () => {
  const photos = RE7KHO.slice(0, 5).map((p, i) => (i === 0 ? { ...p, cf_image_id: null } : p))
  const { picks } = selectGalleryPhotos(photos, { count: 5 })
  assert.ok(!picks.some((p) => !p.cf_image_id))
})

test('the alcohol/smoking hard block still excludes a photo, even a high-quality one', () => {
  const base = RE7KHO[0]
  const blocked = { ...base, image_key: 'blocked-1', cf_image_id: 'blocked-1', caption: 'A sponsor cooler of beer sits courtside.',
    metadata: { ...base.metadata, sharpness: 9, composition_score: 9, emotional_impact: 9 } }
  assert.equal(isHardBlocked(blocked.caption), true)
  const { picks } = selectGalleryPhotos([blocked, ...RE7KHO], { count: 10 })
  assert.ok(!picks.some((p) => p.image_key === 'blocked-1'))
})

test('when the album DOES have real quality spread, ranking uses it instead of the caption heuristic', () => {
  const photos = Array.from({ length: 20 }, (_, i) => ({
    image_key: `synth-${i}`, cf_image_id: `synth-${i}`,
    caption: 'Players stand near the bench.', // a low, negative caption score for every photo (AVOID hits)
    created_at: new Date(2026, 0, 1, 0, i).toISOString(),
    metadata: { play_type: i % 2 === 0 ? 'spike' : 'set', photo_category: 'action',
      sharpness: 4 + (i % 6), composition_score: 4 + (i % 6), emotional_impact: 4 + (i % 6) },
  }))
  const spread = qualitySpread(photos)
  assert.equal(spread.useable, true, `expected usable spread, got distinctComposition=${spread.distinctComposition}`)
  const { picks, usedQuality } = selectGalleryPhotos(photos, { count: 3 })
  assert.equal(usedQuality, true)
  // the three highest combined-quality photos are i=5,11,17 (score 4+5=9 sub-value -> 27) and its
  // period-6 repeats; just assert every pick beats the caption-only mean the fallback would have used.
  for (const p of picks) assert.ok(p.metadata.sharpness >= 6, `expected a high-quality pick, got sharpness ${p.metadata.sharpness}`)
})

test('captionScore: action and emotion words score positive, avoid words score negative, blocked words are -Infinity', () => {
  assert.ok(captionScore('A player spikes the ball') > 0)
  assert.ok(captionScore('Teammates celebrate with a fist pump') > 0)
  assert.ok(captionScore('Players stand near the bench waiting') < 0)
  assert.equal(captionScore('A cooler of beer sits on the sideline'), -Infinity)
})

test('asking for more than the album has just returns the whole (clean) album, reported honestly', () => {
  const photos = RE7KHO.slice(0, 3)
  const { picks, total, selectedOf } = selectGalleryPhotos(photos, { count: 10 })
  assert.equal(total, 3)
  assert.equal(picks.length, 3)
  assert.equal(selectedOf, '3 of 3')
})
