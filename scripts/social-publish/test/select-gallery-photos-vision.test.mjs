import assert from 'node:assert/strict'
import test from 'node:test'
import sharp from 'sharp'
import {
  classifyOrientation, classifyOrientationFromAspectRatio, computeMajorityOrientation, filterByOrientation,
  laplacianVariance, filterBySharpness, buildShortlist,
  validateModelOrder, buildFallbackOrder, costFromUsage,
  selectGalleryPhotosByVision, analyzePhoto, analyzeAlbum,
} from '../select-gallery-photos.mjs'

// A real, tiny landscape JPEG — needed by the analyzePhoto/analyzeAlbum tests below,
// which exercise the REAL sharp() pipeline (unlike selectGalleryPhotosByVision's own
// tests, which inject analyzeAlbumFn and never touch sharp at all).
async function tinyLandscapeJpeg() {
  return sharp({ create: { width: 40, height: 24, channels: 3, background: { r: 90, g: 90, b: 90 } } }).jpeg().toBuffer()
}

// --- classifyOrientation -----------------------------------------------------

test('classifyOrientation: landscape/portrait/square with no EXIF rotation', () => {
  assert.equal(classifyOrientation(1200, 800, 1), 'landscape')
  assert.equal(classifyOrientation(800, 1200, 1), 'portrait')
  assert.equal(classifyOrientation(900, 900, 1), 'square')
})

test('classifyOrientation: EXIF orientation 5-8 swap stored width/height before classifying', () => {
  // A photo shot in portrait but stored with raw dims 1200x800 and a 90-degree EXIF tag
  // displays as portrait (800x1200) — the swap must happen before landscape/portrait is decided.
  assert.equal(classifyOrientation(1200, 800, 6), 'portrait')
  assert.equal(classifyOrientation(800, 1200, 6), 'landscape')
  assert.equal(classifyOrientation(1200, 800, 1), 'landscape') // same raw dims, no rotation tag
})

// --- classifyOrientationFromAspectRatio (2026-09-26: the album API now returns this field) --

test('classifyOrientationFromAspectRatio: >1 landscape, <1 portrait, ~1 square', () => {
  assert.equal(classifyOrientationFromAspectRatio(1.5), 'landscape')
  assert.equal(classifyOrientationFromAspectRatio(0.667), 'portrait') // the live Re7kho value
  assert.equal(classifyOrientationFromAspectRatio(1.0), 'square')
  assert.equal(classifyOrientationFromAspectRatio(0.99), 'square') // within the epsilon band
})

test('classifyOrientationFromAspectRatio: missing/invalid returns null rather than a guess', () => {
  assert.equal(classifyOrientationFromAspectRatio(null), null)
  assert.equal(classifyOrientationFromAspectRatio(undefined), null)
  assert.equal(classifyOrientationFromAspectRatio(0), null)
  assert.equal(classifyOrientationFromAspectRatio('not a number'), null)
})

// --- analyzePhoto / analyzeAlbum: aspect_ratio-first, download only when needed ----------

test('analyzePhoto: aspect_ratio present never touches fetch', async () => {
  let called = false
  const result = await analyzePhoto(
    { image_key: 'p1', cf_image_id: 'p1', aspect_ratio: 0.667 },
    { fetchImpl: async () => { called = true; throw new Error('must not be called') } },
  )
  assert.equal(called, false)
  assert.equal(result.orientation, 'portrait')
  assert.equal(result.sharpness, null) // sharpness is decided later, only for majority-orientation photos
})

test('analyzePhoto: falls back to a download + EXIF read when aspect_ratio is missing', async () => {
  const buf = await tinyLandscapeJpeg()
  const result = await analyzePhoto({ image_key: 'legacy', cf_image_id: 'legacy' }, { fetchImpl: async () => new Response(buf, { status: 200 }) })
  assert.equal(result.orientation, 'landscape')
  assert.equal(typeof result.sharpness, 'number')
})

test('analyzeAlbum: a minority-orientation photo (known from aspect_ratio alone) is never downloaded', async () => {
  const buf = await tinyLandscapeJpeg()
  const calls = []
  const fetchImpl = async (url) => { calls.push(String(url)); return new Response(buf, { status: 200 }) }
  const photos = [
    { image_key: 'l1', cf_image_id: 'l1', aspect_ratio: 1.5, created_at: '2026-01-01T00:00:00Z' },
    { image_key: 'l2', cf_image_id: 'l2', aspect_ratio: 1.6, created_at: '2026-01-01T00:00:01Z' },
    { image_key: 'p1', cf_image_id: 'p1', aspect_ratio: 0.6, created_at: '2026-01-01T00:00:02Z' },
  ]
  const { analyzed, errors } = await analyzeAlbum(photos, { fetchImpl, concurrency: 4 })
  assert.equal(errors.length, 0)
  assert.ok(!calls.some((u) => u.includes('/p1/')), `the minority portrait photo must never be fetched; calls were ${calls}`)
  assert.ok(calls.some((u) => u.includes('/l1/')) && calls.some((u) => u.includes('/l2/')), 'both majority-orientation photos must be fetched for sharpness')

  const p1 = analyzed.find((a) => a.photo.image_key === 'p1')
  assert.equal(p1.orientation, 'portrait')
  assert.equal(p1.sharpness, null, 'a dropped-by-orientation record carries no sharpness — it was never analyzed')

  const l1 = analyzed.find((a) => a.photo.image_key === 'l1')
  assert.equal(l1.orientation, 'landscape')
  assert.equal(typeof l1.sharpness, 'number')

  const { majority } = computeMajorityOrientation(analyzed)
  assert.equal(majority, 'landscape')
  const { kept, droppedCount } = filterByOrientation(analyzed, majority)
  assert.equal(droppedCount, 1)
  assert.equal(kept.length, 2)
})

// --- orientation majority/filter --------------------------------------------

function rec({ key, orientation, sharpness, playType = null, category = 'action', createdAt = '2026-01-01T00:00:00Z' }) {
  return { photo: { image_key: key, cf_image_id: key, caption: 'A player plays.', created_at: createdAt, metadata: { play_type: playType, photo_category: category } }, sharpness, orientation, width: 800, height: 600, buffer: Buffer.from('x') }
}

test('computeMajorityOrientation + filterByOrientation: minority orientation is dropped, count reported', () => {
  const records = [
    rec({ key: 'a', orientation: 'landscape', sharpness: 5 }),
    rec({ key: 'b', orientation: 'landscape', sharpness: 5 }),
    rec({ key: 'c', orientation: 'landscape', sharpness: 5 }),
    rec({ key: 'd', orientation: 'portrait', sharpness: 5 }),
  ]
  const { majority, counts } = computeMajorityOrientation(records)
  assert.equal(majority, 'landscape')
  assert.deepEqual(counts, { portrait: 1, landscape: 3, square: 0 })
  const { kept, droppedCount } = filterByOrientation(records, majority)
  assert.equal(kept.length, 3)
  assert.equal(droppedCount, 1)
  assert.ok(kept.every((r) => r.orientation === 'landscape'))
})

// --- laplacianVariance --------------------------------------------------------

test('laplacianVariance: a flat (uniform) image has zero variance', () => {
  const w = 10, h = 10
  const gray = new Uint8Array(w * h).fill(128)
  assert.equal(laplacianVariance(gray, w, h), 0)
})

test('laplacianVariance: a checkerboard (maximally textured) image scores far higher than a flat one', () => {
  const w = 10, h = 10
  const checker = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) checker[y * w + x] = (x + y) % 2 === 0 ? 0 : 255
  const flat = new Uint8Array(w * h).fill(128)
  assert.ok(laplacianVariance(checker, w, h) > laplacianVariance(flat, w, h))
  assert.ok(laplacianVariance(checker, w, h) > 0)
})

// --- filterBySharpness --------------------------------------------------------

test('filterBySharpness: drops the bottom third by sharpness, keeps the sharper two-thirds', () => {
  const records = [1, 2, 3, 9, 8, 7].map((s, i) => rec({ key: `p${i}`, orientation: 'landscape', sharpness: s }))
  const { kept, droppedCount } = filterBySharpness(records, { dropFraction: 1 / 3 })
  assert.equal(droppedCount, 2) // floor(6/3) = 2
  assert.equal(kept.length, 4)
  assert.ok(!kept.some((r) => r.sharpness === 1 || r.sharpness === 2))
})

test('filterBySharpness: dropFraction 0 keeps everything', () => {
  const records = [1, 2, 3].map((s, i) => rec({ key: `p${i}`, orientation: 'landscape', sharpness: s }))
  const { kept, droppedCount } = filterBySharpness(records, { dropFraction: 0 })
  assert.equal(droppedCount, 0)
  assert.equal(kept.length, 3)
})

// --- buildShortlist ------------------------------------------------------------

test('buildShortlist: reserves a celebration slot when the album has one', () => {
  const records = [
    rec({ key: 'cel-1', orientation: 'landscape', sharpness: 5, category: 'celebration', createdAt: '2026-01-01T00:30:00Z' }),
    ...Array.from({ length: 8 }, (_, i) => rec({
      key: `action-${i}`, orientation: 'landscape', sharpness: 4 + i, playType: i % 2 === 0 ? 'spike' : 'set',
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
    })),
  ]
  const { shortlist, reservedCelebrations } = buildShortlist(records, { size: 6, celebrationSlots: 1, minGapSeconds: 5 })
  assert.equal(reservedCelebrations, 1)
  assert.ok(shortlist.some((r) => r.photo.image_key === 'cel-1'))
  assert.equal(shortlist.length, 6)
})

test('buildShortlist: spreads across more than one play_type group', () => {
  const records = Array.from({ length: 12 }, (_, i) => rec({
    key: `p${i}`, orientation: 'landscape', sharpness: 4 + (i % 5), playType: i % 2 === 0 ? 'spike' : 'dig',
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }))
  const { shortlist } = buildShortlist(records, { size: 8, celebrationSlots: 0, minGapSeconds: 5 })
  const types = new Set(shortlist.map((r) => r.photo.metadata.play_type))
  assert.ok(types.size > 1, `expected more than one play_type, got ${[...types]}`)
})

test('buildShortlist: collapses a burst near-duplicate, keeping the sharper of the pair', () => {
  const records = [
    rec({ key: 'burst-soft', orientation: 'landscape', sharpness: 3, createdAt: '2026-01-01T00:00:00Z' }),
    rec({ key: 'burst-sharp', orientation: 'landscape', sharpness: 9, createdAt: '2026-01-01T00:00:02Z' }), // 2s later — inside the default 5s gap
    rec({ key: 'later', orientation: 'landscape', sharpness: 5, createdAt: '2026-01-01T00:05:00Z' }),
  ]
  const { shortlist, dedupedTotal } = buildShortlist(records, { size: 10, celebrationSlots: 0, minGapSeconds: 5 })
  assert.equal(dedupedTotal, 2) // the burst pair collapsed into one
  assert.ok(shortlist.some((r) => r.photo.image_key === 'burst-sharp'))
  assert.ok(!shortlist.some((r) => r.photo.image_key === 'burst-soft'))
})

// --- validateModelOrder --------------------------------------------------------

test('validateModelOrder: a well-formed response validates and returns 1-based tiles', () => {
  const order = [{ tile: 3, reason: 'a' }, { tile: 1, reason: 'b' }]
  const v = validateModelOrder(order, { shortlistLength: 5, n: 2 })
  assert.equal(v.valid, true)
  assert.deepEqual(v.tiles, [3, 1])
  assert.deepEqual(v.reasons, ['a', 'b'])
})

test('validateModelOrder: rejects the wrong count', () => {
  const v = validateModelOrder([{ tile: 1, reason: 'a' }], { shortlistLength: 5, n: 2 })
  assert.equal(v.valid, false)
  assert.match(v.error, /expected 2 entries, got 1/)
})

test('validateModelOrder: rejects an out-of-range tile (the off-by-one case included)', () => {
  const tooHigh = validateModelOrder([{ tile: 6, reason: 'a' }], { shortlistLength: 5, n: 1 })
  assert.equal(tooHigh.valid, false)
  const zero = validateModelOrder([{ tile: 0, reason: 'a' }], { shortlistLength: 5, n: 1 })
  assert.equal(zero.valid, false)
})

test('validateModelOrder: rejects duplicate tiles', () => {
  const v = validateModelOrder([{ tile: 1, reason: 'a' }, { tile: 1, reason: 'b' }], { shortlistLength: 5, n: 2 })
  assert.equal(v.valid, false)
  assert.match(v.error, /duplicate/)
})

test('validateModelOrder: rejects a non-array response', () => {
  const v = validateModelOrder(undefined, { shortlistLength: 5, n: 2 })
  assert.equal(v.valid, false)
})

// --- buildFallbackOrder ---------------------------------------------------------

test('buildFallbackOrder: top N by sharpness, each carrying a fallback reason', () => {
  const shortlist = [3, 9, 1, 7].map((s, i) => rec({ key: `p${i}`, orientation: 'landscape', sharpness: s }))
  const { picks, reasons } = buildFallbackOrder(shortlist, 2)
  assert.deepEqual(picks.map((p) => p.sharpness), [9, 7])
  assert.equal(reasons.length, 2)
  assert.match(reasons[0], /fallback/)
})

// --- costFromUsage ---------------------------------------------------------------

test('costFromUsage: prefers the OpenRouter-reported usage.cost', () => {
  const { costUsd, method } = costFromUsage({ cost: 0.0031, prompt_tokens: 1000, completion_tokens: 50 })
  assert.equal(costUsd, 0.0031)
  assert.match(method, /usage\.cost/)
})

test('costFromUsage: computes from tokens when usage.cost is absent', () => {
  const { costUsd, method } = costFromUsage({ prompt_tokens: 1000, completion_tokens: 100 }, { prompt: 0.0000003, completion: 0.0000025 })
  assert.ok(Math.abs(costUsd - (1000 * 0.0000003 + 100 * 0.0000025)) < 1e-9)
  assert.match(method, /computed/)
})

test('costFromUsage: null usage reports null cost, not zero', () => {
  const { costUsd, method } = costFromUsage(null)
  assert.equal(costUsd, null)
  assert.match(method, /no usage/)
})

// --- selectGalleryPhotosByVision (full orchestration, no network/sharp) -----------

/** 8 photos: 6 landscape (majority) + 2 portrait (dropped), a sharpness spread wide enough
 * that the bottom third drops cleanly, one celebration frame, two play_types. */
function syntheticAnalyzed() {
  const photos = [
    { key: 'lo-1', orientation: 'landscape', sharpness: 1, playType: 'spike' },
    { key: 'lo-2', orientation: 'landscape', sharpness: 2, playType: 'dig' },
    { key: 'mid-1', orientation: 'landscape', sharpness: 5, playType: 'spike' },
    { key: 'mid-2', orientation: 'landscape', sharpness: 6, playType: 'dig' },
    { key: 'hi-1', orientation: 'landscape', sharpness: 9, playType: 'spike' },
    { key: 'cel-1', orientation: 'landscape', sharpness: 8, playType: null, category: 'celebration' },
    { key: 'port-1', orientation: 'portrait', sharpness: 9 },
    { key: 'port-2', orientation: 'portrait', sharpness: 9 },
  ]
  return photos.map((p, i) => rec({ key: p.key, orientation: p.orientation, sharpness: p.sharpness, playType: p.playType, category: p.category || 'action', createdAt: new Date(Date.UTC(2026, 0, 1, 0, i * 2)).toISOString() }))
}

function fakeAnalyzeAlbumFn(analyzed) {
  return async () => ({ analyzed, errors: [] })
}

test('selectGalleryPhotosByVision: success path validates the judge response and reports real cost', async () => {
  const analyzed = syntheticAnalyzed()
  const judgeFn = async ({ n }) => ({
    order: Array.from({ length: n }, (_, i) => ({ tile: i + 1, reason: `reason ${i + 1}` })),
    usage: { cost: 0.002, prompt_tokens: 500, completion_tokens: 20 },
  })
  const result = await selectGalleryPhotosByVision(
    analyzed.map((r) => r.photo),
    {
      count: 3, shortlistSize: 6, celebrationSlots: 1,
      analyzeAlbumFn: fakeAnalyzeAlbumFn(analyzed),
      buildContactSheetFn: async (shortlist) => ({ buffer: Buffer.from('sheet'), tileMap: new Map(shortlist.map((r, i) => [i + 1, r])) }),
      judgeFn,
    },
  )
  assert.equal(result.strategy, 'vision')
  assert.equal(result.fallbackUsed, false)
  assert.equal(result.picks.length, 3)
  assert.equal(result.droppedByOrientation, 2) // the two portrait frames
  assert.equal(result.majorityOrientation, 'landscape')
  assert.equal(result.costUsd, 0.002)
  assert.equal(result.perPhoto.length, 3)
  assert.ok(result.perPhoto.every((p) => typeof p.reason === 'string' && p.reason.length > 0))
  assert.equal(result.selectedOf, '3 of 8')
})

test('selectGalleryPhotosByVision: judge failure falls back to shortlist order by sharpness, and says so', async () => {
  const analyzed = syntheticAnalyzed()
  const judgeFn = async () => { throw new Error('OpenRouter 500: upstream error') }
  const result = await selectGalleryPhotosByVision(
    analyzed.map((r) => r.photo),
    {
      count: 3, shortlistSize: 6, celebrationSlots: 1,
      analyzeAlbumFn: fakeAnalyzeAlbumFn(analyzed),
      buildContactSheetFn: async (shortlist) => ({ buffer: Buffer.from('sheet'), tileMap: new Map(shortlist.map((r, i) => [i + 1, r])) }),
      judgeFn,
    },
  )
  assert.equal(result.fallbackUsed, true)
  assert.match(result.fallbackReason, /OpenRouter 500/)
  assert.equal(result.picks.length, 3)
  assert.ok(result.perPhoto.every((p) => /fallback/.test(p.reason)))
})

test('selectGalleryPhotosByVision: an invalid judge response (bad index) also falls back', async () => {
  const analyzed = syntheticAnalyzed()
  const judgeFn = async ({ n }) => ({ order: Array.from({ length: n }, () => ({ tile: 999, reason: 'x' })) })
  const result = await selectGalleryPhotosByVision(
    analyzed.map((r) => r.photo),
    {
      count: 2, shortlistSize: 6, celebrationSlots: 1,
      analyzeAlbumFn: fakeAnalyzeAlbumFn(analyzed),
      buildContactSheetFn: async (shortlist) => ({ buffer: Buffer.from('sheet'), tileMap: new Map(shortlist.map((r, i) => [i + 1, r])) }),
      judgeFn,
    },
  )
  assert.equal(result.fallbackUsed, true)
  assert.match(result.fallbackReason, /out of range|model response invalid/)
})

test('selectGalleryPhotosByVision: nothing survives the filters — reports 0 of N without crashing', async () => {
  const analyzed = [rec({ key: 'only-portrait', orientation: 'portrait', sharpness: 5 })]
  // majority orientation ends up 'portrait' with a single record, so it's kept — force a
  // real empty case instead: an album where the caption hard-block removes the only photo.
  const photos = [{ image_key: 'blocked', cf_image_id: 'blocked', caption: 'a cooler of beer sits courtside', created_at: '2026-01-01', metadata: {} }]
  const result = await selectGalleryPhotosByVision(photos, {
    count: 3,
    analyzeAlbumFn: async () => ({ analyzed: [], errors: [] }),
  })
  assert.equal(result.picks.length, 0)
  assert.equal(result.selectedOf, '0 of 1')
  assert.equal(result.fallbackUsed, true)
  assert.match(result.fallbackReason, /no candidates/)
})
