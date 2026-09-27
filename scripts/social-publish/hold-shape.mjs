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

/**
 * The companion-Story gate (2026-09-26): whether `item`'s LINKED item (its `linked_item_id` —
 * the Story's pointer back to its carousel) blocks it from publishing right now. A Story that
 * says "check the feed" must never go out before the carousel it points at has actually posted,
 * and must never go out at all once that carousel is permanently dead (vetoed, or a terminal
 * Graph error) — code review 2026-09-26 caught that the only existing link was time (a fixed
 * schedule offset), which does neither.
 *
 * Returns null when nothing blocks it. Otherwise `{ reason, terminal }`:
 *   terminal: true   the link is permanently broken (linked item vetoed or errored) — the
 *                     caller should mark `item` terminal too (see worker/src/index.js's
 *                     `postDuePending`), the same way a route refusal does.
 *   terminal: false  not yet (the linked item hasn't posted) — try again next tick, no state
 *                     change; this is NOT the same as holdBlock()'s `held`, which the item
 *                     doesn't otherwise carry once its own `holdUntil` passes.
 *
 * A dangling `linked_item_id` (the linked item isn't in this queue at all) is not this
 * function's problem to solve — it returns null rather than guessing.
 */
export function linkedItemBlock(item, items = []) {
  if (!item?.linked_item_id) return null
  const linked = items.find((it) => it.id === item.linked_item_id)
  if (!linked) return null
  if (isVetoed(linked)) return { reason: 'its linked post was vetoed', terminal: true }
  if (linked.status === 'error') return { reason: 'its linked post failed to publish', terminal: true }
  if (linked.status !== 'posted') return { reason: 'waiting for its linked post to publish first', terminal: false }
  return null
}
