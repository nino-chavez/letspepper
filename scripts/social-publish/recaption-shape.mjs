/**
 * Replace the caption of one LIVE queue item that has not published anywhere yet.
 * Applied by seed-kv.mjs --recaption to the queue it just read from KV (the record of
 * what the Worker has published), never to the local queue file, which the Worker does
 * not write back to and can therefore still say "held" after a post went out.
 *
 * The item must be "held" on BOTH channels: a caption changed after either channel
 * posted, or while one is building, would make the two posts disagree.
 */
export function recaption(queue, id, caption) {
  if (typeof caption !== 'string' || !caption.trim()) return { refused: 'the new caption is empty.' }
  const next = structuredClone(queue)
  const item = (next.items || []).find((it) => it.id === id)
  if (!item) return { refused: `no item with id "${id}" in the live queue.` }
  if (item.status !== 'held' || item.facebook_status !== 'held') {
    return { refused: `item "${id}" is ${item.status}/${item.facebook_status}, not held/held — its caption can no longer change.` }
  }
  const before = item.caption
  item.caption = caption
  item.facebook_caption = caption
  return { queue: next, before, after: caption }
}
