/**
 * Tournament data — server-importable source of truth.
 *
 * Extracted from app/flavors/[slug]/page.tsx (which was a `'use client'` component,
 * so its inline copy couldn't be read by server code) so both the page AND the
 * OG share-card route (app/flavors/[slug]/opengraph-image.tsx) read one record.
 */

export interface TournamentDetail {
	slug: string
	/** RHQ tournament slug — the source of truth for the live event-page embed. */
	rhqSlug: string
	name: string
	heat: 'bell' | 'poblano' | 'jalapeno'
	heroImage?: string
	tagline: string
	headline: string
	description: string
	date: string
	/** ISO start (serve time) — drives the pre-event countdown + champion-pick lock. */
	startsAt: string
	time: string
	location: string
	division: string
	entryFee: string
	format: string
	/** Headline prize rendered as the hero stat on the event page (omit when no cash headline). */
	payoutHeadline?: { amount: string; label: string }
	payouts: string[]
	features: string[]
	mediaPerks: string[]
}

/** Heat → hex (the CSS vars in globals.css, resolved — Satori can't read CSS custom properties). */
export const HEAT_HEX: Record<TournamentDetail['heat'], string> = {
	bell: '#4ade80',
	poblano: '#facc15',
	jalapeno: '#f97316'
}

/** Heat → Scoville label shown on the card. */
export const HEAT_LEVEL: Record<TournamentDetail['heat'], string> = {
	bell: 'Mild',
	poblano: 'Medium',
	jalapeno: 'Hot'
}

export const tournaments: Record<string, TournamentDetail> = {
	'bell-pepper-open': {
		slug: 'bell-pepper-open',
		rhqSlug: 'bell-pepper-open-2026',
		name: 'Bell Pepper Open',
		heat: 'bell',
		tagline: 'Season Opener',
		headline:
			"The season opener. First tournament of the Let's Pepper Series — shake off the rust, find your rhythm, and get warmed up.",
		description:
			"Player-first, prize-backed, and media-covered. The Bell Pepper Open starts the series with grass triples, a full bracket, and coverage for every team.",
		date: 'Sunday, June 7, 2026',
		startsAt: '2026-06-07T09:00:00-05:00',
		time: 'Check-in 8:30 AM · Serve by 9:00 AM',
		location: 'Nature Meadows Park · 1861 Westridge Pl, Aurora, IL 60504',
		division: 'Grass Triples (One Division)',
		entryFee: '',
		format: 'Pool Play + Single Elimination Bracket',
		payouts: ['Prizes for top finishers', 'Awards scale with the field', 'Full media coverage for every team'],
		features: ['Season Kickoff', 'Full Media Coverage', 'Finalist Prizes'],
		mediaPerks: [
			'Professional photo and video by Flickday Media',
			'Post-tournament highlight reels',
			'Taggable galleries available at nino.photos'
		]
	},
	'jalapeno-open': {
		slug: 'jalapeno-open',
		rhqSlug: 'jalapeno-open-2026',
		name: 'Jalapeño Open',
		heat: 'jalapeno',
		tagline: 'Bring The Heat',
		headline: 'Mid-season pressure. Fast rallies, sharp decisions, and no room to coast.',
		description:
			"By mid-season, everyone is dialed in. Expect clean hands, crisp touches, tighter rallies, and a field ready to compete.",
		date: 'Saturday, July 18, 2026',
		startsAt: '2026-07-18T09:00:00-05:00',
		time: 'Check-in 8:30 AM · Serve by 9:00 AM',
		location: 'Nature Meadows Park · 1861 Westridge Pl, Aurora, IL 60504',
		division: 'Grass Triples (One Division)',
		entryFee: '',
		format: 'Pool Play + Double Elimination Bracket',
		payouts: ['Prizes for top finishers', 'Full content coverage', 'Merch for finalists'],
		features: ['Peak Competition', 'High Intensity', 'Fast Pace'],
		mediaPerks: [
			'Professional photo coverage by Flickday Media',
			'Highlight reels and action shots',
			'Full gallery access'
		]
	},
	'poblano-open': {
		slug: 'poblano-open',
		rhqSlug: 'poblano-open-2026',
		name: 'Poblano Pepper Open',
		heat: 'poblano',
		tagline: 'Season Finale',
		headline:
			'The season closes at the Poblano Open. The payout scales with the field — $2,000 first place at a full 28-team bracket, the largest in series history.',
		description:
			'The finale rewards defense, touch, and patience under pressure. We are building the biggest field the series has seen — 28 teams — and every one of them gets full media coverage.',
		date: 'Saturday, August 1, 2026',
		startsAt: '2026-08-01T09:00:00-05:00',
		time: 'Check-in 8:30 AM · Serve by 9:00 AM',
		location: 'Nature Meadows Park · 1861 Westridge Pl, Aurora, IL 60504',
		division: 'Grass Triples (One Division)',
		entryFee: '',
		format: 'Pool Play + Single Elimination Bracket',
		payoutHeadline: { amount: '$2,000', label: 'First place at a full 28-team field · Payout scales with the field' },
		payouts: ['$2,000 first place at a full 28-team field — payout scales with field size', 'Season recap content', 'Year-end merch'],
		features: ['$2,000 at a Full 28', 'Season Closer', 'Final Standings'],
		mediaPerks: ['Professional photo coverage by Flickday Media', 'Season recap content', 'Full gallery access']
	}
}
