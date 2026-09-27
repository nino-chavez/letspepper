/**
 * Choose and copy the exact JPEG bytes used by social-gallery builders.
 *
 * Ultra HDR gain maps survive only when the original JPEG bytes are retained.
 * This module deliberately performs no image transform: it fetches the selected
 * JPEG, writes those same bytes to the staging file, then Wrangler uploads that
 * file unchanged to the existing public R2 bucket.
 */
import { writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

export const CF_HASH = 'wg34HB28-JkySWVm5fW4kA'

export function cfLarge(id) { return `https://imagedelivery.net/${CF_HASH}/${id}/large` }

/** The photography API exposes this as `id`; direct metadata rows use `photo_id`. */
export function photoIdFor(photo) {
  if (photo?.photo_id) return photo.photo_id
  if (photo?.id) return photo.id
  if (photo?.album_key && photo?.image_key) return `${photo.album_key}-${photo.image_key}`
  return null
}

export function galleryPhotoSource(photo, site) {
  if (photo?.hdr_web_available) {
    const photoId = photoIdFor(photo)
    if (!photoId) throw new Error(`HDR photo ${photo?.image_key || '(unknown)'} has no photo_id`)
    return { kind: 'hdr', url: `${site.replace(/\/$/, '')}/api/hdr/${encodeURIComponent(photoId)}` }
  }
  if (!photo?.cf_image_id) throw new Error(`photo ${photo?.image_key || '(unknown)'} has no cf_image_id`)
  return { kind: 'cf-large', url: cfLarge(photo.cf_image_id) }
}

export async function r2PutPhoto({ photo, site, bucket, publicBase, event, key, tmp, fetchImpl = fetch, writeFileSyncImpl = writeFileSync, execFileSyncImpl = execFileSync }) {
  const source = galleryPhotoSource(photo, site)
  const res = await fetchImpl(source.url, { headers: { accept: 'image/jpeg' } })
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !/image\/jpeg/.test(contentType)) {
    throw new Error(`bad image for ${photo?.image_key || photo?.cf_image_id || 'unknown'} (${res.status} ${contentType})`)
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  writeFileSyncImpl(tmp, bytes)
  const objectKey = `${event}/${key}.jpg`
  execFileSyncImpl('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${objectKey}`,
    `--file=${tmp}`, '--content-type=image/jpeg', '--remote'], { stdio: ['ignore', 'ignore', 'inherit'] })
  // tmp: the staged file, which build-album-carousel.mjs and build-top-shots.mjs also feed to
  // `montage` for the pre-publish contact sheet.
  return { url: `${publicBase}/${objectKey}`, source, tmp }
}
