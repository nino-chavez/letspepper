import type { ImageLoaderProps } from 'next/image'

/**
 * Hero photo for the home and About pages: Bell Pepper Open 2025, frame 231.
 *
 * This frame was never imported into Cloudflare Images, and SmugMug no longer
 * serves it, so it ships as committed WebP derivatives in public/images/photos/,
 * made with sharp (quality 75) from the archive original
 * `Photography/00-full-album-archive/.../Bell-Pepper-Open-20250719/lpo-green-pepper-2025-231.jpg`.
 */
const WIDTHS = [1200, 1800] as const

const path = (width: number) => `/images/photos/bell-pepper-open-2025-231-${width}.webp`

export const HERO_PHOTO_SRC = path(WIDTHS[WIDTHS.length - 1])

/** next/image `loader`: the smallest committed derivative that covers the requested width. */
export function heroPhotoLoader({ width }: ImageLoaderProps): string {
  return path(WIDTHS.find((w) => w >= width) ?? WIDTHS[WIDTHS.length - 1])
}
