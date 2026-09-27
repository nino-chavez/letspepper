/**
 * The shape of a standing Graph route, and whether one covers a run.
 *
 * One owner for that check, shared by the two publishers: route-gate.mjs (local,
 * reads graph-routes.json) and worker/src/index.js (scheduled, reads the copy
 * seed-kv.mjs writes into the KV queue as `meta.route`). No node: imports, so the
 * Worker bundle can take it without nodejs_compat.
 */
export const ADHOC = 'adhoc' // post-now's ledger: every item in it is a one-off by definition

export const filled = (v) => typeof v === 'string' && v.trim().length > 0

export const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))

/** A complete standing entry: a reason, a real approval date, and the accounts it covers. */
export function standingEntry(event, routes) {
  if (event === ADHOC) return null
  const entry = Object.hasOwn(routes?.events || {}, event) ? routes.events[event] : null
  const ok = !!entry && typeof entry === 'object' && filled(entry.reason) && isDate(entry.approved) &&
    Array.isArray(entry.accounts) && entry.accounts.length > 0 && entry.accounts.every(filled) &&
    (entry.expires === undefined || isDate(entry.expires)) &&
    (entry.media_types === undefined || (Array.isArray(entry.media_types) && entry.media_types.every(filled)))
  return ok ? entry : null
}

/** Still in date: `expires` is the last approved day, UTC. */
export function inDate(entry, now = new Date()) {
  return !!entry && !(entry.expires && now.getTime() > Date.parse(entry.expires) + 86_400_000)
}

export const STORIES = 'STORIES'

/**
 * Whether a standing entry's approval extends to a given media type. Every type OTHER than
 * STORIES stays covered by an entry that carries no `media_types` field at all — unchanged
 * behavior for every route approved before this field existed (graph-routes.json's
 * "gallery-announce" entry, in particular, was approved for carousels, never asked about
 * Stories). Only STORIES needs an explicit, listed opt-in: `"media_types": ["CAROUSEL",
 * "STORIES"]` on the entry. This is what the companion-Story feature's route gate enforces —
 * see companion-story.mjs's header and route-gate.mjs's `checkRoute()`.
 */
export function coversMediaType(entry, mediaType) {
  if (mediaType !== STORIES) return true
  return !!entry && Array.isArray(entry.media_types) && entry.media_types.includes(STORIES)
}

/**
 * In date, naming every account the run publishes to, and (when `mediaTypes` is given)
 * covering every media type in the batch. No known account fails closed: an empty list would
 * otherwise pass every(). `mediaTypes` defaults to `[]`, so every existing call site (which
 * passes only 3 args) is unaffected — `[].every(...)` is vacuously true.
 */
export function entryCovers(entry, accounts = [], now = new Date(), mediaTypes = []) {
  return inDate(entry, now) && accounts.length > 0 && accounts.every((a) => entry.accounts.includes(a)) &&
    mediaTypes.every((mt) => coversMediaType(entry, mt))
}
