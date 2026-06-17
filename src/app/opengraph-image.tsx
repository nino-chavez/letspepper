/**
 * Site/home OG card — Next's opengraph-image file convention auto-wires the
 * og:image + twitter:image meta to this route (single source; no duplicate tags).
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_SIZE } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = "Let's Pepper — underground grass volleyball tournament series"
export const size = OG_SIZE
export const contentType = 'image/png'

export default function Image() {
	return new ImageResponse(BrandCard(), { ...OG_SIZE })
}
