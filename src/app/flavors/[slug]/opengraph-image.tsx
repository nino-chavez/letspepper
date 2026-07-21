/**
 * Per-tournament OG card — heat color as the accent, theme character as the
 * figure (same role poses as the flavor-page heroes). Next's opengraph-image
 * convention auto-wires og:image for /flavors/[slug] even though page.tsx is a
 * client component (no generateMetadata needed). Unknown slug → brand card, so
 * the route never 404s a crawler.
 */
import { ImageResponse } from 'next/og'
import { BrandCard, TournamentCard, OG_SIZE } from '@/lib/og-card'
import { loadMascot } from '@/lib/og-mascots'
import { tournaments } from '@/lib/tournaments'

export const runtime = 'edge'
export const size = OG_SIZE
export const contentType = 'image/png'

export function generateStaticParams() {
	return Object.keys(tournaments).map((slug) => ({ slug }))
}

export const alt = "Let's Pepper tournament"

export default async function Image({ params }: { params: { slug: string } }) {
	const tournament = tournaments[params.slug]
	return new ImageResponse(
		tournament
			? TournamentCard(tournament, await loadMascot(tournament.heat))
			: BrandCard(await loadMascot('brand')),
		{ ...OG_SIZE }
	)
}
