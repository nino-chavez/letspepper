/**
 * Edits to one LIVE queue item that has not published anywhere yet. seed-kv.mjs applies
 * these to the queue it just read from KV (the record of what the Worker has published),
 * never to the local queue file, which the Worker does not write back to and can
 * therefore still say "held" after a post went out.
 *
 * Every edit requires the item to be "held" on BOTH channels: a change after either
 * channel posted, or while one is building, would make the two posts disagree.
 */

function heldItem(next, id) {
  const item = (next.items || []).find((it) => it.id === id)
  if (!item) return { refused: `no item with id "${id}" in the live queue.` }
  if (item.status !== 'held' || item.facebook_status !== 'held') {
    return { refused: `item "${id}" is ${item.status}/${item.facebook_status}, not held/held — it can no longer change.` }
  }
  return { item }
}

/** New caption on both channels (seed-kv.mjs --recaption). */
export function recaption(queue, id, caption) {
  if (typeof caption !== 'string' || !caption.trim()) return { refused: 'the new caption is empty.' }
  const next = structuredClone(queue)
  const { item, refused } = heldItem(next, id)
  if (refused) return { refused }
  const before = item.caption
  item.caption = caption
  item.facebook_caption = caption
  return { queue: next, before, after: caption }
}

/**
 * Move the item to another publishing account and set its Instagram collaborators
 * (seed-kv.mjs --reassign). `accounts` is accounts.json's `accounts` map. The route
 * check for the new account happens in seed-kv.mjs's seedPayload(), like every push.
 * Instagram takes at most 3 collaborators, and an account cannot invite itself.
 */
export function reassign(queue, id, { account, collaborators }, accounts) {
  if (!accounts?.[account]) return { refused: `unknown account "${account}" — not in accounts.json.` }
  const handles = (collaborators || []).map((h) => h.trim().replace(/^@/, '')).filter(Boolean)
  if (handles.length > 3) return { refused: `Instagram allows at most 3 collaborators; got ${handles.length}.` }
  if (handles.includes(accounts[account].handle)) return { refused: `${accounts[account].handle} cannot be a collaborator on its own post.` }
  const next = structuredClone(queue)
  const { item, refused } = heldItem(next, id)
  if (refused) return { refused }
  const before = { account: item.account, collaborators: item.collaborators }
  item.account = account
  item.collaborators = handles
  return { queue: next, before, after: { account, collaborators: handles } }
}
