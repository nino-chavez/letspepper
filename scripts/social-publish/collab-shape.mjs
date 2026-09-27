/**
 * The explicit Collab choice required before a gallery carousel may publish.
 *
 * A gallery announcement is route-approved and may have elapsed its ordinary
 * timed hold, but an item with `collab: { status: 'ask' }` still cannot publish.
 * Nino chooses either no Collab or one to three Instagram handles. This module
 * owns that decision and its validation for the local publisher, scheduled
 * Worker, /review form, and seed-kv CLI. It has no node: imports so it bundles
 * into the Worker.
 */

const INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/

export function normalizeInstagramHandle(value) {
  const handle = String(value ?? '').trim().replace(/^@/, '')
  return INSTAGRAM_USERNAME.test(handle) ? handle : null
}

export function normalizeCollaborators(values) {
  const raw = Array.isArray(values) ? values : String(values ?? '').split(',')
  const handles = raw.map(normalizeInstagramHandle)
  if (!handles.length || handles.some((handle) => !handle)) {
    return { refused: 'enter one or more valid Instagram usernames (letters, numbers, periods, and underscores only; optional @).' }
  }
  if (handles.length > 3) return { refused: `Instagram allows at most 3 collaborators; got ${handles.length}.` }
  if (new Set(handles.map((handle) => handle.toLowerCase())).size !== handles.length) {
    return { refused: 'each Instagram collaborator must be listed only once.' }
  }
  return { handles }
}

/** Why this item is still blocked, or null once a Collab choice exists. */
export function collabBlock(item) {
  return item?.collab?.status === 'ask' ? 'waiting for Nino\'s Collab choice' : null
}

/**
 * Record the Collab answer on one carousel still waiting to publish. `choice`
 * is `none`, `nino`, or `handles`; the decided handles live both in the durable
 * decision record and in `collaborators`, the exact Graph payload field.
 */
export function decideCollab(queue, id, { choice, handles } = {}, { accountHandles } = {}) {
  if (!accountHandles) throw new Error('decideCollab needs accountHandles ({ slug: handle }) to refuse a self-Collab.')
  const next = structuredClone(queue)
  const item = (next.items || []).find((candidate) => candidate.id === id)
  if (!item) return { refused: `no item with id "${id}" in the live queue.` }
  if (item.media_type === 'STORIES') return { refused: 'Stories cannot carry a Collab; choose for the linked carousel instead.' }
  if (!['held', 'pending'].includes(item.status) || !['held', 'pending'].includes(item.facebook_status || 'pending')) {
    return { refused: `item "${id}" is ${item.status}/${item.facebook_status || 'pending'}, not held or pending — its Collab choice can no longer change.` }
  }

  let collaborators
  let collab
  if (choice === 'none') {
    collaborators = []
    collab = { status: 'none' }
  } else if (choice === 'nino') {
    collaborators = ['nino.chavez.photo']
    collab = { status: 'decided', handles: collaborators }
  } else if (choice === 'handles') {
    const normalized = normalizeCollaborators(handles)
    if (normalized.refused) return normalized
    collaborators = normalized.handles
    collab = { status: 'decided', handles: collaborators }
  } else {
    return { refused: 'choose "none", "nino", or "handles" for the Collab decision.' }
  }

  // An account cannot invite itself: Meta rejects the parent container, which makes the
  // Instagram leg terminal and takes the linked Story down with it (Codex review of #67).
  const publisher = accountHandles[item.account]
  if (publisher && collaborators.some((handle) => handle.toLowerCase() === publisher.toLowerCase())) {
    return { refused: `@${publisher} publishes this post, so it cannot also be its Collab. Choose another account or No Collab.` }
  }

  item.collab = collab
  item.collaborators = collaborators
  return { queue: next, item, before: queue.items.find((candidate) => candidate.id === id)?.collab ?? null }
}
