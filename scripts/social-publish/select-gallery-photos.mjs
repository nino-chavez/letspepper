/**
 * Photo selection for a gallery-announce carousel — a separate, swappable
 * module from build-gallery-announce.mjs on purpose. The builder imports the
 * default export and takes a `--strategy <path|name>` override (`caption` or
 * `vision` select a named export of THIS file; a path imports another module
 * exporting the same `selectGalleryPhotos(photos, opts)` shape).
 *
 * DEFAULT STRATEGY (2026-09-25 rewrite — `selectGalleryPhotosByVision`):
 * the AI quality sub-scores (sharpness, composition_score, emotional_impact)
 * are known to run nearly flat on recent albums — on Re7kho (120 photos),
 * composition_score has only 3 distinct values and sharpness is 7 or 8 on
 * 112/120 — and measured against pixel-level focus, model "sharpness"
 * correlates at Spearman 0.10. Not usable as a ranking signal. This strategy
 * replaces it with three deterministic/model stages:
 *   1. Hard filters from image bytes: majority orientation only (Instagram
 *      crops every carousel slide to slide 1's aspect ratio, so a mixed-
 *      orientation set gets cropped badly), deterministic sharpness (variance
 *      of a 3×3 Laplacian on a downscaled grayscale — see laplacianVariance),
 *      bottom third dropped. Alcohol/smoking hard block kept from the old
 *      strategy.
 *   2. A ~24-photo shortlist spread across play_type and across time in the
 *      match (see buildShortlist), with a few celebration slots reserved and
 *      near-duplicate burst frames collapsed.
 *   3. A vision model (OpenRouter, default google/gemini-2.5-flash) looks at
 *      a numbered contact sheet of the shortlist and returns the final N in
 *      posting order with a one-line reason each. Falls back to shortlist
 *      order (by sharpness) on any failure, and says so in the result.
 *
 * `created_at` (used for "time in the match") is NOT ingest order — an
 * earlier version of this comment claimed that and was wrong. The photography
 * site's transformPhotoRow (src/lib/supabase/server.ts) sets
 * `created_at: row.photo_date || row.enriched_at || row.upload_date`, so
 * `created_at` IS `photo_date` (true EXIF capture time) whenever the DB has
 * one. Verified against the live Re7kho pull (test/fixtures/re7kho-photos.json,
 * 120 rows, 2026-09-25): every created_at falls inside the actual match window
 * (18:03–18:53) and none of them equal that row's enriched_at, so no row fell
 * through to a fallback. The substitution is exact for this album; it is not
 * guaranteed for one with missing EXIF dates, because created_at silently
 * degrades to enriched_at/upload_date with no visible marker of which case
 * applied. See the module-level `PHOTO_API_GAP` note below for the exact
 * change that would remove the ambiguity.
 *
 * Orientation is NOT read from the API (aspect_ratio is selected in
 * PHOTO_COLUMNS but dropped by transformPhotoRow — same gap) — it comes from
 * downloading each photo's CF `medium` variant (confirmed live 2026-09-25:
 * `medium` letterboxes to a max 800px edge and preserves aspect ratio, it is
 * not a cover-crop) and reading width/height + the EXIF orientation tag via
 * `sharp().metadata()`.
 *
 * Legacy strategy: `selectGalleryPhotosByCaption` (was the default export
 * under the name `selectGalleryPhotos` before this rewrite) — ranks by the
 * album's own AI quality score when it shows real spread, else a caption
 * action/emotion heuristic. Kept, unmodified in logic, importable by path or
 * via `--strategy caption`.
 */

// PHOTO_API_GAP (report only — do NOT edit that repo from here, per the task
// that produced this file): src/lib/supabase/server.ts's transformPhotoRow
// (around line 76) selects `aspect_ratio` and `photo_date` via PHOTO_COLUMNS
// (src/lib/supabase/columns.ts) but drops both when it builds the returned
// Photo object — aspect_ratio isn't on the Photo type or its metadata at all,
// and photo_date only survives folded into `created_at`'s fallback chain
// (`row.photo_date || row.enriched_at || row.upload_date`), indistinguishable
// from a same-value fallback. The fix: add `aspect_ratio: row.aspect_ratio`
// to the returned object (making orientation free, no per-photo download) and
// add `photo_date: row.photo_date` as its own field (removing the ambiguity
// above). Until that ships, this file downloads image bytes for orientation
// and treats `created_at` as a capture-time proxy.

// Same brand-safety hard block as build-album-carousel.mjs / build-fb-album.mjs.
const BLOCK = ['beer', 'alcohol', 'wine', 'bottle', 'smoke', 'drink']

// Caption action/emotion heuristic, used by the legacy strategy only — same
// lists as build-album-carousel.mjs's captionScore, kept in sync by hand.
const ACTION = ['spik', 'jump', 'dive', 'serv', 'leap', 'mid-air', 'midair', 'reach', 'swing', 'block', 'bump', 'set ', 'diving', 'soar', 'airborne', 'hit', 'attack', 'lung', 'slid']
const EMOTION = ['celebrat', 'cheer', 'fist', 'scream', 'yell', 'hug', 'high-five', 'point', 'excit', 'triumph', 'emotion', 'joy', 'intense', 'roar', 'clench']
const AVOID = ['walk', 'stand', 'sitting', 'sits', 'tent', 'bench', 'water', 'phone', 'talk', 'blurred background', 'spectator', 'waiting', 'crowd']

const CF_HASH = 'wg34HB28-JkySWVm5fW4kA' // Cloudflare Images account hash (public) — same as build-gallery-announce.mjs

export function isHardBlocked(caption = '') {
  const c = (caption || '').toLowerCase()
  return BLOCK.some((w) => c.includes(w))
}

export function captionScore(caption = '') {
  const c = (caption || '').toLowerCase()
  if (isHardBlocked(c)) return -Infinity
  let s = 0
  for (const w of ACTION) if (c.includes(w)) s += 3
  for (const w of EMOTION) if (c.includes(w)) s += 3
  for (const w of AVOID) if (c.includes(w)) s -= 2
  return s
}

/** Reads the same nested shape /api/album-photos actually returns (metadata.*, not photo-root). */
function meta(p) { return p?.metadata || {} }

function qualityScore(p) {
  const m = meta(p)
  const vals = [m.sharpness, m.composition_score, m.emotional_impact].map(Number).filter((n) => !Number.isNaN(n))
  return vals.length === 3 ? vals.reduce((a, b) => a + b, 0) : null
}

/**
 * Whether the album's own quality scores have enough spread to rank by.
 * Measured against Re7kho (2026-09-25): composition_score carries only 3
 * distinct values across 120 photos, and model "sharpness" correlates with
 * pixel-measured focus at Spearman 0.10 — not usable regardless of spread.
 * Kept only for the legacy caption strategy; the default strategy below does
 * not consult the model's own scores at all.
 */
export function qualitySpread(photos, { minDistinct = 4 } = {}) {
  const scored = photos.filter((p) => qualityScore(p) != null)
  const distinctComposition = new Set(scored.map((p) => meta(p).composition_score)).size
  return { scored: scored.length, distinctComposition, useable: scored.length > 0 && distinctComposition >= minDistinct }
}

const isAction = (p) => meta(p).play_type != null || meta(p).photo_category === 'action'
const isCelebration = (p) => meta(p).photo_category === 'celebration'

/** Early/mid/late position in the album, by created_at order. */
export function withTimeBucket(photos) {
  const chrono = [...photos].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  const third = Math.ceil(chrono.length / 3) || 1
  return chrono.map((p, i) => ({ p, bucket: i < third ? 'early' : i < 2 * third ? 'mid' : 'late' }))
}

/**
 * LEGACY STRATEGY (was the default export as `selectGalleryPhotos` before
 * the 2026-09-25 vision rewrite). Unchanged logic. Select up to `count`
 * photos, reporting `{ picks, total, selectedOf, usedQuality }`. `total` is
 * every photo in the album (pre-filter); `selectedOf` is the "<n> of <total>"
 * string the builder logs and puts in the manifest/caption.
 */
export function selectGalleryPhotosByCaption(photos, { count = 10, minDistinct = 4 } = {}) {
  const total = photos.length
  const withImage = (photos || []).filter((p) => p.cf_image_id)
  const clean = withImage.filter((p) => !isHardBlocked(p.caption))
  const spread = qualitySpread(clean, { minDistinct })
  const scoreOf = spread.useable ? qualityScore : (p) => captionScore(p.caption)

  const bucketed = withTimeBucket(clean)
  const withScore = bucketed.map((b) => ({ ...b, score: scoreOf(b.p) ?? -Infinity, action: isAction(b.p), celebration: isCelebration(b.p) }))
    .filter((w) => w.score > -Infinity) // score of -Infinity means hard-blocked-equivalent under the caption fallback

  const used = new Set()
  const picks = []

  // One celebration slot, the highest-scoring one, if the album has any and there's room for it.
  if (count > 1) {
    const bestCelebration = withScore.filter((w) => w.celebration).sort((a, b) => b.score - a.score)[0]
    if (bestCelebration) { picks.push(bestCelebration.p); used.add(bestCelebration.p.image_key) }
  }

  // Remaining slots: round-robin across time buckets, and within a bucket, round-robin
  // across distinct play_type groups (action-flagged first) before repeating a group —
  // this is what spreads picks across BOTH play_type and time rather than just one axis.
  const buckets = ['early', 'mid', 'late']
  const groupKey = (w) => meta(w.p).play_type || (w.action ? 'action' : 'other')
  const pools = {}
  for (const b of buckets) {
    const inBucket = withScore.filter((w) => w.bucket === b)
    const groups = new Map()
    for (const w of inBucket) {
      const k = groupKey(w)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(w)
    }
    for (const list of groups.values()) list.sort((a, b2) => b2.score - a.score)
    // Order groups action-first, then by group size descending (bigger groups have more to give).
    const order = [...groups.keys()].sort((a, b2) => {
      const aAction = groups.get(a)[0]?.action ? 1 : 0
      const bAction = groups.get(b2)[0]?.action ? 1 : 0
      return bAction - aAction || groups.get(b2).length - groups.get(a).length
    })
    pools[b] = { groups, order, cursor: 0 }
  }

  let bi = 0
  let stalls = 0
  while (picks.length < count && stalls < buckets.length) {
    const bucket = buckets[bi % buckets.length]; bi++
    const pool = pools[bucket]
    let took = false
    for (let tries = 0; tries < pool.order.length && !took; tries++) {
      const groupName = pool.order[pool.cursor % pool.order.length]
      pool.cursor++
      const group = pool.groups.get(groupName) || []
      const next = group.find((w) => !used.has(w.p.image_key))
      if (next) { picks.push(next.p); used.add(next.p.image_key); took = true }
    }
    stalls = took ? 0 : stalls + 1
  }

  const final = picks.slice(0, count)
  return {
    picks: final,
    total,
    usedQuality: spread.useable,
    qualitySpread: spread,
    selectedOf: `${final.length} of ${total}`,
    strategy: 'caption',
  }
}

// ============================================================================
// DEFAULT STRATEGY — orientation + deterministic sharpness + vision-model pick
// ============================================================================

export function cfMediumUrl(id) { return `https://imagedelivery.net/${CF_HASH}/${id}/medium` }

/**
 * Small no-dependency concurrency limiter — this file has no other need for
 * a queue library, and the album sizes here (~100-300 photos) don't justify one.
 */
function pLimit(concurrency) {
  let active = 0
  const queue = []
  const runNext = () => {
    if (active >= concurrency || queue.length === 0) return
    active++
    const { fn, resolve, reject } = queue.shift()
    fn().then(resolve, reject).finally(() => { active--; runNext() })
  }
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); runNext() })
}

export async function fetchImageBuffer(url, fetchImpl = fetch) {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Variance of a 3×3 discrete Laplacian over a flat grayscale buffer
 * (row-major, one byte per pixel, `width*height` long) — a deterministic
 * focus/sharpness proxy: a sharp frame has strong edges everywhere, which
 * means a high-variance Laplacian response; a soft/blurred frame's Laplacian
 * response stays close to its own mean everywhere.
 *
 * Computed in plain JS on floats, NOT via sharp's own `.convolve()` — that
 * clamps its output to uint8, so every negative Laplacian response (about
 * half of them, by construction) gets clipped to 0 and the variance is wrong.
 */
export function laplacianVariance(gray, width, height) {
  if (width < 3 || height < 3) return 0
  const n = (width - 2) * (height - 2)
  const lap = new Float64Array(n)
  let idx = 0
  let sum = 0
  for (let y = 1; y < height - 1; y++) {
    const row = y * width
    for (let x = 1; x < width - 1; x++) {
      const c = gray[row + x]
      const v = gray[row - width + x] + gray[row + width + x] + gray[row + x - 1] + gray[row + x + 1] - 4 * c
      lap[idx++] = v
      sum += v
    }
  }
  const mean = sum / n
  let sumSq = 0
  for (let i = 0; i < n; i++) { const d = lap[i] - mean; sumSq += d * d }
  return sumSq / n
}

/** Downloads sharp() lazily so the pure functions above/below never need the native binary. */
async function loadSharp() { return (await import('sharp')).default }

/** Fixed analysis size for every frame so sharpness values are comparable across the album. */
const ANALYSIS_EDGE = 512

export async function computeSharpnessAndDims(buffer) {
  const sharp = await loadSharp()
  const img = sharp(buffer)
  const meta = await img.metadata()
  const { data, info } = await img.clone()
    .resize({ width: ANALYSIS_EDGE, height: ANALYSIS_EDGE, fit: 'inside', withoutEnlargement: true })
    .greyscale().raw().toBuffer({ resolveWithObject: true })
  const sharpness = laplacianVariance(data, info.width, info.height)
  return { width: meta.width, height: meta.height, exifOrientation: meta.orientation || 1, sharpness }
}

/**
 * EXIF orientation tags 5–8 are the 90°/270° rotations, where the stored raw
 * width/height are swapped relative to how the image actually displays.
 */
export function classifyOrientation(width, height, exifOrientation = 1) {
  const swapped = exifOrientation >= 5 && exifOrientation <= 8
  const w = swapped ? height : width
  const h = swapped ? width : height
  if (w === h) return 'square'
  return w > h ? 'landscape' : 'portrait'
}

export async function analyzePhoto(photo, { fetchImage = fetchImageBuffer, analyzeBuffer = computeSharpnessAndDims, fetchImpl = fetch } = {}) {
  const buffer = await fetchImage(cfMediumUrl(photo.cf_image_id), fetchImpl)
  const { width, height, exifOrientation, sharpness } = await analyzeBuffer(buffer)
  const orientation = classifyOrientation(width, height, exifOrientation)
  return { photo, width, height, orientation, sharpness, buffer }
}

export async function analyzeAlbum(photos, { concurrency = 8, ...rest } = {}) {
  const limit = pLimit(concurrency)
  const analyzed = []
  const errors = []
  await Promise.all(photos.map((p) => limit(async () => {
    try { analyzed.push(await analyzePhoto(p, rest)) } catch (e) { errors.push({ photo: p, error: e.message }) }
  })))
  return { analyzed, errors }
}

/** Majority orientation across analyzed records — the album gets cropped to slide 1's aspect
 * ratio on Instagram, so the minority orientation(s) are the ones that get dropped. */
export function computeMajorityOrientation(records) {
  const counts = { portrait: 0, landscape: 0, square: 0 }
  for (const r of records) counts[r.orientation] = (counts[r.orientation] || 0) + 1
  const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'landscape'
  return { majority, counts, total: records.length }
}

export function filterByOrientation(records, majority) {
  const kept = records.filter((r) => r.orientation === majority)
  return { kept, droppedCount: records.length - kept.length, majority }
}

/** Drops the bottom `dropFraction` of records by sharpness (default: bottom third). */
export function filterBySharpness(records, { dropFraction = 1 / 3 } = {}) {
  const sorted = [...records].sort((a, b) => a.sharpness - b.sharpness)
  const dropCount = Math.floor(sorted.length * dropFraction)
  const droppedKeys = new Set(sorted.slice(0, dropCount).map((r) => r.photo.image_key))
  const kept = records.filter((r) => !droppedKeys.has(r.photo.image_key))
  const threshold = dropCount < sorted.length ? sorted[dropCount].sharpness : null
  return { kept, droppedCount: dropCount, threshold }
}

/** Collapses burst near-duplicates: within `minGapSeconds` of the previous KEPT frame,
 * keep only the sharper of the pair (by created_at order, not by group). */
function dedupeBursts(records, minGapSeconds) {
  const sorted = [...records].sort((a, b) => new Date(a.photo.created_at || 0) - new Date(b.photo.created_at || 0))
  const out = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const gapSec = last ? Math.abs(new Date(r.photo.created_at || 0) - new Date(last.photo.created_at || 0)) / 1000 : Infinity
    if (last && gapSec < minGapSeconds) {
      if (r.sharpness > last.sharpness) out[out.length - 1] = r
      continue
    }
    out.push(r)
  }
  return out
}

function timeBucketsOf(records) {
  const chrono = [...records].sort((a, b) => new Date(a.photo.created_at || 0) - new Date(b.photo.created_at || 0))
  const third = Math.ceil(chrono.length / 3) || 1
  return chrono.map((r, i) => ({ ...r, bucket: i < third ? 'early' : i < 2 * third ? 'mid' : 'late' }))
}

/** Round-robins across time buckets and, within a bucket, across play_type groups
 * (ranked by sharpness within a group) — same shape as the legacy strategy's spread
 * algorithm, driven by sharpness instead of a quality/caption score. */
function roundRobinFill(records, count) {
  if (count <= 0) return []
  const buckets = ['early', 'mid', 'late']
  const withBucket = timeBucketsOf(records)
  const pools = {}
  for (const b of buckets) {
    const inBucket = withBucket.filter((r) => r.bucket === b)
    const groups = new Map()
    for (const r of inBucket) {
      const k = r.photo.metadata?.play_type || 'other'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(r)
    }
    for (const list of groups.values()) list.sort((a, b2) => b2.sharpness - a.sharpness)
    const order = [...groups.keys()].sort((a, b2) => groups.get(b2).length - groups.get(a).length)
    pools[b] = { groups, order, cursor: 0 }
  }
  const picks = []
  const used = new Set()
  let bi = 0
  let stalls = 0
  while (picks.length < count && stalls < buckets.length) {
    const bucket = buckets[bi % buckets.length]; bi++
    const pool = pools[bucket]
    let took = false
    for (let tries = 0; tries < pool.order.length && !took; tries++) {
      const groupName = pool.order[pool.cursor % pool.order.length]; pool.cursor++
      const group = pool.groups.get(groupName) || []
      const next = group.find((r) => !used.has(r.photo.image_key))
      if (next) { picks.push(next); used.add(next.photo.image_key); took = true }
    }
    stalls = took ? 0 : stalls + 1
  }
  return picks
}

/**
 * ~`size` shortlist for the vision model to choose from: a few celebration
 * slots reserved up front (so the model has one to close on when asked to),
 * burst near-duplicates collapsed, the rest spread across play_type and time
 * by sharpness via round-robin.
 */
export function buildShortlist(records, { size = 24, celebrationSlots = 3, minGapSeconds = 5 } = {}) {
  const deduped = dedupeBursts(records, minGapSeconds)
  const celebrations = deduped
    .filter((r) => r.photo.metadata?.photo_category === 'celebration')
    .sort((a, b) => b.sharpness - a.sharpness)
  const reserved = celebrations.slice(0, Math.max(0, Math.min(celebrationSlots, size)))
  const reservedKeys = new Set(reserved.map((r) => r.photo.image_key))
  const remaining = deduped.filter((r) => !reservedKeys.has(r.photo.image_key))
  const fill = roundRobinFill(remaining, Math.max(0, size - reserved.length))
  return { shortlist: [...reserved, ...fill].slice(0, size), dedupedTotal: deduped.length, reservedCelebrations: reserved.length }
}

/**
 * Builds one numbered-tile contact sheet (JPEG buffer) from shortlist
 * records — tiles are letterboxed (`fit: 'contain'`), never cropped, so a
 * pole or occluding edge stays visible to the model rather than being
 * cropped away by a square thumbnail.
 */
export async function buildContactSheet(records, { cols = 6, tileWidth = 220, tileHeight = 220 } = {}) {
  const sharp = await loadSharp()
  const rows = Math.ceil(records.length / cols) || 1
  const composites = []
  for (let i = 0; i < records.length; i++) {
    const tileNum = i + 1
    const col = i % cols
    const row = Math.floor(i / cols)
    const tileBuf = await sharp(records[i].buffer)
      .resize(tileWidth, tileHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0 } })
      .toBuffer()
    const label = Buffer.from(
      `<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${tileNum >= 10 ? 46 : 34}" height="30" fill="black" fill-opacity="0.75"/>` +
      `<text x="6" y="22" font-size="22" font-family="sans-serif" fill="#FFD400" font-weight="bold">${tileNum}</text>` +
      `</svg>`,
    )
    const labeled = await sharp(tileBuf).composite([{ input: label, top: 0, left: 0 }]).toBuffer()
    composites.push({ input: labeled, left: col * tileWidth, top: row * tileHeight })
  }
  const buffer = await sharp({ create: { width: cols * tileWidth, height: rows * tileHeight, channels: 3, background: { r: 20, g: 20, b: 20 } } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toBuffer()
  const tileMap = new Map(records.map((r, i) => [i + 1, r]))
  return { buffer, tileMap }
}

/** Validates the model's `{order:[{tile,reason},...]}` response: exactly `n` entries,
 * each a 1-based tile number in range, no duplicates. Pure — no network. */
export function validateModelOrder(order, { shortlistLength, n }) {
  if (!Array.isArray(order)) return { valid: false, error: 'response "order" is not an array' }
  if (order.length !== n) return { valid: false, error: `expected ${n} entries, got ${order.length}` }
  const tiles = []
  for (const entry of order) {
    const tile = Number(entry?.tile)
    if (!Number.isInteger(tile) || tile < 1 || tile > shortlistLength) {
      return { valid: false, error: `tile ${JSON.stringify(entry?.tile)} out of range 1-${shortlistLength}` }
    }
    tiles.push(tile)
  }
  if (new Set(tiles).size !== tiles.length) return { valid: false, error: 'duplicate tile numbers in response' }
  return { valid: true, tiles, reasons: order.map((e) => String(e?.reason || '').slice(0, 300)) }
}

/** Fallback when the vision model call fails or returns something unusable:
 * the top `n` shortlist entries by sharpness, in that order. */
export function buildFallbackOrder(shortlist, n) {
  const picks = [...shortlist].sort((a, b) => b.sharpness - a.sharpness).slice(0, n)
  return { picks, reasons: picks.map(() => 'fallback: shortlist order by sharpness (vision model unavailable or invalid response)') }
}

function buildJudgePrompt(n, hasCelebration) {
  return [
    'You are choosing photos for an Instagram carousel from a volleyball photo gallery.',
    'The attached image is a contact sheet of numbered candidate tiles.',
    `Choose exactly ${n} tiles and put them in posting order (slide 1 first).`,
    'Rules:',
    '- Slide 1 must be the single strongest frame: clear peak action or emotion, subject large in the frame, face or ball visible.',
    '- Avoid near-duplicate frames (same moment or angle as another tile you already picked).',
    "- Avoid frames where a pole, net post, or a person's head/body blocks a large part of the subject.",
    '- Represent both teams if both are visible across the tiles.',
    hasCelebration ? '- End on a celebration or other strong emotional moment.' : '- End on the strongest remaining moment.',
    `Respond with ONLY minified JSON, no prose: {"order":[{"tile":<number>,"reason":"<one short sentence>"}]} with exactly ${n} entries. "tile" must be one of the numbers printed on the tiles. No duplicates.`,
  ].join('\n')
}

/** OpenRouter chat completion against the contact sheet. Throws on any HTTP/parse failure —
 * the caller (selectGalleryPhotosByVision) is the one that decides to fall back. */
export async function judgeWithVisionModel({ contactSheetBuffer, n, apiKey, model = 'google/gemini-2.5-flash', fetchImpl = fetch, hasCelebration = false }) {
  if (!apiKey) throw new Error('no OpenRouter API key provided')
  const dataUrl = `data:image/jpeg;base64,${contactSheetBuffer.toString('base64')}`
  const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      reasoning: { max_tokens: 0 }, // cost control: disable Gemini's extended-thinking budget
      usage: { include: true }, // ask OpenRouter to report actual $ cost on usage.cost
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: buildJudgePrompt(n, hasCelebration) },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  let parsed
  try { parsed = JSON.parse(content) } catch { throw new Error(`OpenRouter response was not valid JSON: ${String(content).slice(0, 200)}`) }
  return { order: parsed?.order, usage: json.usage, raw: json }
}

/** OpenRouter's `usage.cost` (when `usage:{include:true}` is honored) is the real billed $
 * amount; otherwise compute from token counts × the /models pricing fetched for this model. */
export function costFromUsage(usage, pricing = { prompt: 0.0000003, completion: 0.0000025 }) {
  if (!usage) return { costUsd: null, method: 'no usage reported' }
  if (typeof usage.cost === 'number') return { costUsd: usage.cost, method: 'usage.cost (OpenRouter-reported)' }
  const costUsd = (usage.prompt_tokens || 0) * pricing.prompt + (usage.completion_tokens || 0) * pricing.completion
  return { costUsd, method: 'computed from token counts × /models pricing (usage.cost not reported)' }
}

/**
 * Default strategy. Select up to `count` (max 10 — Instagram's carousel
 * limit) photos, reporting the same `{ picks, total, selectedOf, usedQuality }`
 * shape the builder expects, plus the richer per-photo/manifest fields this
 * strategy adds (see the module header). `usedQuality` is always `false` here
 * — this strategy never reads the model's own quality sub-scores.
 *
 * `analyzeAlbumFn` / `buildContactSheetFn` / `judgeFn` are injection points
 * for tests — they let the orchestration (filters → shortlist → validate →
 * fallback) be exercised with zero network calls and no native `sharp` calls.
 */
export async function selectGalleryPhotosByVision(photos, {
  count = 10,
  shortlistSize = 24,
  celebrationSlots = 3,
  minGapSeconds = 5,
  concurrency = 8,
  dropFraction = 1 / 3,
  model = 'google/gemini-2.5-flash',
  apiKey = process.env.OPENROUTER_API_KEY,
  fetchImpl = fetch,
  analyzeAlbumFn = analyzeAlbum,
  buildContactSheetFn = buildContactSheet,
  judgeFn = judgeWithVisionModel,
} = {}) {
  const total = photos.length
  const withImage = (photos || []).filter((p) => p.cf_image_id)
  const clean = withImage.filter((p) => !isHardBlocked(p.caption))

  const { analyzed, errors } = await analyzeAlbumFn(clean, { concurrency, fetchImpl })

  const { majority, counts } = computeMajorityOrientation(analyzed)
  const { kept: orientationKept, droppedCount: droppedByOrientation } = filterByOrientation(analyzed, majority)
  const { kept: sharpKept, droppedCount: droppedBySharpness, threshold } = filterBySharpness(orientationKept, { dropFraction })

  const { shortlist, reservedCelebrations } = buildShortlist(sharpKept, { size: shortlistSize, celebrationSlots, minGapSeconds })
  const hasCelebration = reservedCelebrations > 0
  const n = Math.min(count, shortlist.length)

  let finalRecords = []
  let reasons = []
  let fallbackUsed = false
  let fallbackReason = null
  let usage = null
  let costUsd = null
  let costMethod = null

  if (n === 0) {
    fallbackUsed = true
    fallbackReason = 'no candidates survived the orientation/sharpness/hard-block filters'
  } else {
    try {
      const { buffer, tileMap } = await buildContactSheetFn(shortlist)
      const { order, usage: u } = await judgeFn({ contactSheetBuffer: buffer, n, apiKey, model, fetchImpl, hasCelebration })
      const validation = validateModelOrder(order, { shortlistLength: shortlist.length, n })
      if (!validation.valid) throw new Error(`model response invalid: ${validation.error}`)
      finalRecords = validation.tiles.map((t) => tileMap.get(t))
      reasons = validation.reasons
      usage = u
      const c = costFromUsage(usage)
      costUsd = c.costUsd
      costMethod = c.method
    } catch (e) {
      fallbackUsed = true
      fallbackReason = e.message
      const fb = buildFallbackOrder(shortlist, n)
      finalRecords = fb.picks
      reasons = fb.reasons
    }
  }

  const picks = finalRecords.map((r) => r.photo)
  const perPhoto = finalRecords.map((r, i) => ({
    image_key: r.photo.image_key,
    order: i + 1,
    why_kept: `majority orientation (${majority}); sharpness ${r.sharpness.toFixed(1)} survived the bottom-${Math.round(dropFraction * 100)}% cutoff`,
    sharpness: Number(r.sharpness.toFixed(2)),
    orientation: r.orientation,
    reason: reasons[i] || null,
  }))

  return {
    picks,
    total,
    selectedOf: `${picks.length} of ${total}`,
    usedQuality: false,
    strategy: 'vision',
    model,
    majorityOrientation: majority,
    orientationCounts: counts,
    droppedByOrientation,
    droppedBySharpness,
    sharpnessThreshold: threshold,
    shortlistSize: shortlist.length,
    perPhoto,
    fallbackUsed,
    fallbackReason,
    costUsd,
    costMethod,
    analysisErrors: errors.map((e) => ({ image_key: e.photo.image_key, error: e.error })),
  }
}

export const selectGalleryPhotos = selectGalleryPhotosByVision
export default selectGalleryPhotos
