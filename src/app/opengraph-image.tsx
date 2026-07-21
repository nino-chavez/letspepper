/**
 * Site/home OG card — Next's opengraph-image file convention auto-wires the
 * og:image + twitter:image meta to this route (single source; no duplicate tags).
 * Every page without its own opengraph-image inherits this card.
 */
import { ImageResponse } from 'next/og'
import { BrandCard, OG_SIZE } from '@/lib/og-card'
import { loadMascot } from '@/lib/og-mascots'

export const runtime = 'edge'
export const alt = "Let's Pepper — underground grass volleyball tournament series"
export const size = OG_SIZE
export const contentType = 'image/png'

export default async function Image() {
	return new ImageResponse(BrandCard(await loadMascot('brand')), { ...OG_SIZE })
}
