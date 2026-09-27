/**
 * Kill one or more LIVE queue items: sets status/facebook_status to "vetoed" on
 * every destination the item has. hold-shape.mjs's holdBlock() then refuses
 * both, in both publishers, permanently.
 *
 * Extracted from seed-kv.mjs (2026-09-26) so the Worker's own /review/cancel
 * handler can call the EXACT same function seed-kv.mjs --veto uses — one veto
 * format, not two — without pulling seed-kv.mjs's node:fs / node:child_process
 * / route-gate.mjs (which itself imports node:crypto) into the Worker bundle.
 * wrangler.jsonc carries no nodejs_compat flag, so a node: import anywhere in
 * this file's dependency graph would break the deploy while `node --test`
 * stays green — mirrors hold-shape.mjs / route-shape.mjs / notify.mjs, which
 * exist for the same reason. seed-kv.mjs re-exports `veto` from here, so
 * every existing caller and test that imports it from seed-kv.mjs is
 * unaffected.
 */

/**
 * Refuses (does not silently no-op) on an unknown id or one where EITHER
 * destination has already posted — a live post on one channel is not
 * un-published by vetoing the other. Checking both `status` and
 * `facebook_status` (not just `status`, the pre-2026-09-26 shape) matters
 * once a channel can fail independently: an item with an Instagram error and
 * an already-posted Facebook destination must not have its Facebook receipt
 * silently overwritten to "vetoed" just because the OTHER channel is still
 * eligible.
 *
 * CASCADE (2026-09-26, added for the gallery-announce companion Story): vetoing an item also
 * vetoes any item whose `linked_item_id` points at it — a Story that says "check the feed"
 * must never outlive the carousel post it points at. This runs forward only (carousel ->
 * Story); vetoing just the Story on its own (the operator wants the gallery announced without
 * its Story, say) does NOT touch the carousel. Cascaded ids are eligible-checked exactly like
 * the ids the caller named — an already-posted linked item still refuses the whole call, same
 * as an already-posted named id would.
 */
export function veto(queue, ids, reason) {
  const next = structuredClone(queue)
  const cascaded = next.items.filter((it) => it.linked_item_id && ids.includes(it.linked_item_id) && !ids.includes(it.id)).map((it) => it.id)
  const allIds = [...ids, ...cascaded]
  const notEligible = allIds.filter((id) => {
    const it = next.items.find((i) => i.id === id)
    return !it || it.status === 'posted' || it.facebook_status === 'posted'
  })
  if (notEligible.length) return { refused: `not eligible for veto (unknown id, or already posted): ${notEligible.join(', ')}.` }
  for (const it of next.items.filter((i) => allIds.includes(i.id))) {
    it.status = 'vetoed'
    if ('facebook_status' in it) it.facebook_status = 'vetoed'
    it.veto_reason = cascaded.includes(it.id) ? `linked post vetoed${reason ? ` (${reason})` : ''}` : (reason || 'vetoed by operator')
  }
  return { queue: next, cascaded }
}
