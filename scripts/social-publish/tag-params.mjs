export function collaboratorParams(it) {
  const p = {}
  if (Array.isArray(it.collaborators) && it.collaborators.length)
    p.collaborators = JSON.stringify(it.collaborators)
  return p
}

export function userTagsParams(entity, { image = false } = {}) {
  // A feed image (including an image carousel child) requires x/y coordinates.
  // Callers with a precise position pass { username, x, y }; a bare username gets
  // the existing dead-center fallback. Other supported containers use { username }.
  const p = {}
  if (Array.isArray(entity?.user_tags) && entity.user_tags.length)
    p.user_tags = JSON.stringify(entity.user_tags.map((u) => {
      if (typeof u !== 'string') return u
      return image ? { username: u, x: 0.5, y: 0.5 } : { username: u }
    }))
  return p
}

export function tagParams(it, options) {
  return { ...userTagsParams(it, options), ...collaboratorParams(it) }
}
