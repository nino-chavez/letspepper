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

/**
 * New captions (seed-kv.mjs --recaption): `caption` for Instagram and `facebook_caption`
 * for Facebook, which differ because Facebook makes URLs clickable and Instagram does not.
 */
export function recaption(queue, id, { caption, facebook_caption: facebookCaption }) {
  for (const [name, value] of [['caption', caption], ['facebook_caption', facebookCaption]]) {
    if (typeof value !== 'string' || !value.trim()) return { refused: `the new ${name} is empty.` }
  }
  const next = structuredClone(queue)
  const { item, refused } = heldItem(next, id)
  if (refused) return { refused }
  const before = { caption: item.caption, facebook_caption: item.facebook_caption }
  item.caption = caption
  item.facebook_caption = facebookCaption
  return { queue: next, before, after: { caption, facebook_caption: facebookCaption } }
}

/**
 * Move the item to another publishing account and set its Instagram collaborators
 * (seed-kv.mjs --reassign). Omitted collaborators keep the item's current ones.
 * `accounts` is accounts.json's `accounts` map. The route
 * check for the new account happens in seed-kv.mjs's seedPayload(), like every push.
 * Instagram takes at most 3 collaborators, and an account cannot invite itself.
 */
export function reassign(queue, id, { account, collaborators }, accounts) {
  if (!accounts?.[account]) return { refused: `unknown account "${account}" — not in accounts.json.` }
  const next = structuredClone(queue)
  const { item, refused } = heldItem(next, id)
  if (refused) return { refused }
  // `collaborators` undefined keeps the item's current ones; an empty array clears them.
  const handles = (collaborators ?? item.collaborators ?? []).map((h) => h.trim().replace(/^@/, '')).filter(Boolean)
  if (handles.length > 3) return { refused: `Instagram allows at most 3 collaborators; got ${handles.length}.` }
  if (handles.includes(accounts[account].handle)) return { refused: `${accounts[account].handle} cannot be a collaborator on its own post.` }
  const before = { account: item.account, collaborators: item.collaborators }
  item.account = account
  item.collaborators = handles
  return { queue: next, before, after: { account, collaborators: handles } }
}

const STORY_DELAY_MS = 15 * 60 * 1000

/**
 * Publish a held carousel on the Worker's next run instead of at its slot (seed-kv.mjs
 * --post-now; Nino, 2026-11-16: "post it now"). Sets the item's `scheduledAt` to `now` and
 * ends its hold, and moves any Story linked to it to `now` + 15 minutes, the same offset the
 * builder uses. The Story still waits for the carousel to post (linkedItemBlock).
 *
 * Refused unless the item is held on both channels and its Collab choice is recorded: moving
 * the time is not a Collab decision, and the hold is the only veto window Nino has.
 */
export function postNow(queue, id, now = new Date()) {
  const next = structuredClone(queue)
  const { item, refused } = heldItem(next, id)
  if (refused) return { refused }
  if (item.collab?.status === 'ask') return { refused: `item "${id}" is still waiting for Nino's Collab choice; record it with --collab first.` }
  const at = now.toISOString()
  const before = { scheduledAt: item.scheduledAt, holdUntil: item.holdUntil }
  item.scheduledAt = at
  if (!item.holdUntil || Date.parse(item.holdUntil) > now.getTime()) item.holdUntil = at
  const storyAt = new Date(now.getTime() + STORY_DELAY_MS).toISOString()
  const stories = []
  for (const s of next.items || []) {
    if (s.linked_item_id !== id || !['held', 'pending'].includes(s.status)) continue
    s.scheduledAt = storyAt
    if (!s.holdUntil || Date.parse(s.holdUntil) > now.getTime()) s.holdUntil = at
    stories.push(s.id)
  }
  return { queue: next, before, after: { scheduledAt: at, holdUntil: item.holdUntil }, stories }
}
