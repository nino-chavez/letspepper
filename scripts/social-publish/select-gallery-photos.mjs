/**
 * Photo selection for a gallery-announce carousel — a separate, swappable
 * module from build-gallery-announce.mjs on purpose. The AI quality sub-scores
 * (sharpness, composition_score, emotional_impact) are known to run nearly flat
 * on recent albums: on Re7kho (120 photos), composition_score has only 3
 * distinct values across the whole album and sharpness is 7 or 8 on 112/120. A
 * model evaluation that may replace the scorer is running now, so this ranks by
 * quality ONLY when the album's own scores show enough spread to be worth
 * ranking by; otherwise it falls back to a caption action/emotion heuristic
 * (borrowed from build-album-carousel.mjs). The builder imports
 * `selectGalleryPhotos` by default and takes a `--strategy <path>` override
 * that must export the same signature — swapping in a better scorer later
 * never touches build-gallery-announce.mjs.
 *
 * Selection spreads picks across play_type (spike/set/pass/dig/serve/block) and
 * time-in-the-match. The public API doesn't expose match-clock time
 * (`photo_date`/`time_in_game` aren't in the public /api/album-photos payload —
 * checked live 2026-09-25), so `created_at` (ingest order, which tracks capture
 * order for a same-day upload) stands in for chronological position; this is a
 * substitution, not the real thing, and is called out in the builder's report.
 * Prefers action frames (a play_type, or photo_category "action") plus exactly
 * one celebration frame, and keeps build-album-carousel.mjs's alcohol/smoking
 * hard block. Always reports "<n> of <total>".
 */

// Same brand-safety hard block as build-album-carousel.mjs / build-fb-album.mjs.
const BLOCK = ['beer', 'alcohol', 'wine', 'bottle', 'smoke', 'drink']

// Caption action/emotion heuristic, used only when quality scores are unusable —
// same lists as build-album-carousel.mjs's captionScore, kept in sync by hand.
const ACTION = ['spik', 'jump', 'dive', 'serv', 'leap', 'mid-air', 'midair', 'reach', 'swing', 'block', 'bump', 'set ', 'diving', 'soar', 'airborne', 'hit', 'attack', 'lung', 'slid']
const EMOTION = ['celebrat', 'cheer', 'fist', 'scream', 'yell', 'hug', 'high-five', 'point', 'excit', 'triumph', 'emotion', 'joy', 'intense', 'roar', 'clench']
const AVOID = ['walk', 'stand', 'sitting', 'sits', 'tent', 'bench', 'water', 'phone', 'talk', 'blurred background', 'spectator', 'waiting', 'crowd']

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

/** Reads the same nested shape /api/album-photos actually returns (metadata.*, not photo-root — build-album-carousel.mjs's qualityScore() misses this). */
function meta(p) { return p?.metadata || {} }

function qualityScore(p) {
  const m = meta(p)
  const vals = [m.sharpness, m.composition_score, m.emotional_impact].map(Number).filter((n) => !Number.isNaN(n))
  return vals.length === 3 ? vals.reduce((a, b) => a + b, 0) : null
}

/**
 * Whether the album's own quality scores have enough spread to rank by.
 * Measured against Re7kho (2026-09-25): composition_score carries only 3
 * distinct values across 120 photos. minDistinct's default (4) is set just
 * above that measured flat case, not derived from a larger study — the model
 * evaluation mentioned above may warrant recalibrating it.
 */
export function qualitySpread(photos, { minDistinct = 4 } = {}) {
  const scored = photos.filter((p) => qualityScore(p) != null)
  const distinctComposition = new Set(scored.map((p) => meta(p).composition_score)).size
  return { scored: scored.length, distinctComposition, useable: scored.length > 0 && distinctComposition >= minDistinct }
}

const isAction = (p) => meta(p).play_type != null || meta(p).photo_category === 'action'
const isCelebration = (p) => meta(p).photo_category === 'celebration'

/** Early/mid/late position in the album, by created_at order (see module header for the substitution this makes). */
function withTimeBucket(photos) {
  const chrono = [...photos].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  const third = Math.ceil(chrono.length / 3) || 1
  return chrono.map((p, i) => ({ p, bucket: i < third ? 'early' : i < 2 * third ? 'mid' : 'late' }))
}

/**
 * Select up to `count` photos, reporting `{ picks, total, selectedOf, usedQuality }`.
 * `total` is every photo in the album (pre-filter); `selectedOf` is the
 * "<n> of <total>" string the builder logs and puts in the manifest/caption.
 */
export function selectGalleryPhotos(photos, { count = 10, minDistinct = 4 } = {}) {
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
  }
}

export default selectGalleryPhotos
