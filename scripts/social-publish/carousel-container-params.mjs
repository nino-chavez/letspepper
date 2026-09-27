import { collaboratorParams, userTagsParams } from './tag-params.mjs'

export function carouselChildParams(it, child) {
  const base = child.media_type === 'VIDEO'
    ? { media_type: 'VIDEO', video_url: child.video_url }
    : { image_url: child.image_url, ...(child.alt_text ? { alt_text: child.alt_text } : {}) }
  // A child can target tags to one slide, like the scheduled Worker. Legacy
  // post-reels queue items put the same tags on the carousel itself, so use
  // those for every image child until those items are migrated. VIDEO children
  // never receive image-only user_tags.
  const childTags = child.user_tags ?? it.user_tags
  return child.media_type === 'VIDEO'
    ? { ...base, is_carousel_item: 'true' }
    : { ...base, ...userTagsParams({ ...child, user_tags: childTags }, { image: true }), is_carousel_item: 'true' }
}

export function carouselParentParams(it, childIds) {
  return {
    media_type: 'CAROUSEL', children: childIds.join(','), caption: it.caption, ...collaboratorParams(it),
  }
}
