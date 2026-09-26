/**
 * The shape of a hold, and whether it blocks a publish.
 *
 * gallery-announce items are created `held` with a `holdUntil` timestamp so a
 * bad automatic pick or a caption problem can be caught before it goes out
 * unattended. One owner for the check, shared by every publisher:
 * post-reels.mjs (local) and worker/src/index.js (scheduled). No node:
 * imports, so the Worker bundle can take it without nodejs_compat — mirrors
 * route-shape.mjs.
 *
 * Two independent gates, both item-level, both apply to EVERY destination
 * (Instagram and Facebook) and are never bypassed by --force:
 *   vetoed   item.status === 'vetoed' (veto-announce.mjs, or a hand edit).
 *            Terminal: a vetoed item never becomes publishable again.
 *   held     item.holdUntil is set and still in the future. Not terminal:
 *            once holdUntil passes, the item is eligible again, subject to
 *            everything else (route gate, scheduledAt).
 */

/** True once an item has been vetoed. Checked before either destination. */
export function isVetoed(item) {
  return item?.status === 'vetoed'
}

/** True while an item's hold window has not yet elapsed. */
export function isHeld(item, now = new Date()) {
  if (!item?.holdUntil) return false
  const t = Date.parse(item.holdUntil)
  return Number.isFinite(t) && now.getTime() < t
}

/**
 * Why an item may not publish right now, or null when neither gate blocks it.
 * A publisher checks this once, before touching any destination, and refuses
 * both Instagram and Facebook the same way route-gate refuses both.
 */
export function holdBlock(item, now = new Date()) {
  if (isVetoed(item)) return `vetoed${item.veto_reason ? `: ${item.veto_reason}` : ''}`
  if (isHeld(item, now)) return `held until ${item.holdUntil}`
  return null
}
