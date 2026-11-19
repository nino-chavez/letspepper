/**
 * Cloudflare Images URL Builder
 *
 * Shared image delivery infrastructure with nino-chavez-gallery.
 *
 * Variant Reference (configured in CF Dashboard):
 * - thumbnail: 150px  (blur placeholders)
 * - grid:      400px  (gallery cards)
 * - medium:    800px  (album covers, lightbox entry)
 * - large:     1600px (full lightbox, detail pages)
 * - public:    original (downloads, q=90 jpeg)
 */

import type { ImageLoaderProps } from 'next/image'

const CF_ACCOUNT_HASH = 'wg34HB28-JkySWVm5fW4kA'

export type CFVariant = 'thumbnail' | 'grid' | 'medium' | 'large' | 'public'

export function cfImageUrl(id: string, variant: CFVariant): string {
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${id}/${variant}`
}

const CF_VARIANTS: readonly string[] = ['thumbnail', 'grid', 'medium', 'large', 'public']
const CF_IMAGE_ID = /^[A-Za-z0-9_-]+$/

/**
 * True only for a URL `cfImageUrl` could have built: https, this account's hash,
 * one image ID and a named variant, with nothing else in the URL. Server routes
 * that fetch an image check this before fetching.
 */
export function isOwnCfImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.hostname !== 'imagedelivery.net') return false
  if (url.port || url.username || url.password || url.search || url.hash) return false
  const [lead, hash, id, variant, ...rest] = url.pathname.split('/')
  return lead === '' && rest.length === 0 && hash === CF_ACCOUNT_HASH && CF_IMAGE_ID.test(id ?? '') && CF_VARIANTS.includes(variant ?? '')
}

/**
 * next/image `loader` for a Cloudflare Images ID passed as `src`.
 *
 * Serves the smallest named variant that covers the requested width, straight
 * from imagedelivery.net. Two host facts make this the right shape:
 * - Production /_next/image (@cloudflare/next-on-pages) is a passthrough: it
 *   fetches the source and returns it unresized, upstream status included.
 * - Flexible variants are off on this account (`/w=640` returns 403), so
 *   only the named variants above exist.
 */
export function cfImageLoader({ src, width }: ImageLoaderProps): string {
  const variant: CFVariant = width <= 400 ? 'grid' : width <= 800 ? 'medium' : 'large'
  return cfImageUrl(src, variant)
}

export function cfSrcSet(id: string): string {
  return [
    `${cfImageUrl(id, 'grid')} 400w`,
    `${cfImageUrl(id, 'medium')} 800w`,
    `${cfImageUrl(id, 'large')} 1600w`,
  ].join(', ')
}
