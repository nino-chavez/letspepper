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
	venue: {
		name: string
		streetAddress: string
		addressLocality: string
		addressRegion: string
		postalCode: string
		addressCountry: string
	}
	division: string
	entryFee: string
	format: string
	/** Headline prize rendered as the hero stat on the event page (omit when no cash headline). */
	payoutHeadline?: { amount: string; label: string }
	payouts: string[]
	features: string[]
	mediaPerks: string[]
	/**
	 * Set when the event is called off. Every surface reads this one field: the
	 * event page swaps its promo and sign-up CTAs for the notice, the series card
	 * and the next-up tape stop advertising it, the standings stop counting it as
	 * remaining, and the page's JSON-LD publishes EventCancelled so the
	 * cancellation reaches search results instead of the stale listing.
	 */
	cancellation?: {
		/** ISO date the call was made — the notice is dated so players can trust it. */
		announcedOn: string
		/** Why, in the player's terms. One or two sentences. */
		reason: string
		/** What a registered team should expect next. Mirrors the /terms policy. */
		registeredTeams: string
	}
}

/** Cancelled events stay published (a 404 would leave the old promo as the only signal) but never promote. */
export const isCancelled = (t: TournamentDetail): boolean => t.cancellation !== undefined

/**
 * The cancelled event a visitor still needs to be told about — one whose date has
 * not yet passed. After the date, the notice stops being news and the event page
 * carries it alone; the homepage goes back to the off-season message.
 *
 * `todayISO` is passed in rather than read here so callers that render on the
 * client can pass the same value they already computed, and so this stays pure.
 */
export function activeCancellation(todayISO: string): TournamentDetail | null {
	const pending = Object.values(tournaments)
		.filter((t) => isCancelled(t) && t.startsAt.slice(0, 10) >= todayISO)
		.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
	return pending[0] ?? null
}

/** "Sunday, June 7, 2026" -> "June 7". Deterministic string work — no Date parsing, so no SSR/timezone drift. */
export function monthDay(date: string): string {
	const afterWeekday = date.split(',')[1]
	return afterWeekday ? afterWeekday.trim() : date
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

const NATURE_MEADOWS_PARK: TournamentDetail['venue'] = {
	name: 'Nature Meadows Park',
	streetAddress: '1861 Westridge Pl',
	addressLocality: 'Aurora',
	addressRegion: 'IL',
	postalCode: '60504',
	addressCountry: 'US'
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
		venue: NATURE_MEADOWS_PARK,
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
		venue: NATURE_MEADOWS_PARK,
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
		// Promo copy is gone on purpose. The finale was sold on a 28-team field and the
		// payout that scaled with it; neither is happening, so neither stays on the page.
		headline: 'This event has been cancelled. It will not be played on August 1.',
		description:
			'The finale was built around a full field. We did not get there, and a short bracket is not the event we told you we were running.',
		date: 'Saturday, August 1, 2026',
		startsAt: '2026-08-01T09:00:00-05:00',
		time: 'Check-in 8:30 AM · Serve by 9:00 AM',
		location: 'Nature Meadows Park · 1861 Westridge Pl, Aurora, IL 60504',
		venue: NATURE_MEADOWS_PARK,
		division: 'Grass Triples (One Division)',
		entryFee: '',
		format: 'Pool Play + Single Elimination Bracket',
		// Empty on purpose: prizes and feature chips are both sales copy, and the
		// "Cancelled" badge already says the only thing left to say.
		payouts: [],
		features: [],
		mediaPerks: ['Professional photo coverage by Flickday Media', 'Season recap content', 'Full gallery access'],
		cancellation: {
			announcedOn: '2026-07-28',
			reason:
				'Not enough teams registered to run the finale as planned. Rather than shrink the bracket into a different event than the one teams signed up for, we are calling it.',
			registeredTeams:
				'Every registered team receives a full refund or a credit toward a future event, per our terms. We will reach out to each captain directly — you do not need to do anything.'
		}
	}
}
