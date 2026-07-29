import type { Metadata } from 'next'
import { tournaments } from '@/lib/tournaments'

const SITE_URL = 'https://letspepper.com'
const FACEBOOK_URL = 'https://www.facebook.com/people/Lets-Pepper-Open/61572115795472/'
const INSTAGRAM_URL = 'https://www.instagram.com/letspepper.open/'

type Props = {
  children: React.ReactNode
  params: { slug: string }
}

function eventDescription(slug: string): string {
  const tournament = tournaments[slug]
  if (!tournament) return "Let's Pepper grass volleyball tournament details."

  // A cancelled event's search snippet and link preview must lead with the
  // cancellation — check-in times for an event that is not happening are worse
  // than no description at all.
  if (tournament.cancellation) {
    return `Cancelled. The ${tournament.name} scheduled for ${tournament.date} will not be played. ${tournament.cancellation.reason}`
  }

  return `${tournament.date} at ${tournament.venue.name} in ${tournament.venue.addressLocality}, ${tournament.venue.addressRegion}. ${tournament.division}. ${tournament.time}.`
}

export function generateMetadata({ params }: Props): Metadata {
  const tournament = tournaments[params.slug]

  if (!tournament) {
    return {
      title: 'Tournament Not Found',
      robots: { index: false, follow: false },
    }
  }

  const canonicalPath = `/flavors/${tournament.slug}`
  const description = eventDescription(tournament.slug)
  // Someone pasting this link into a group chat has to see the cancellation in
  // the preview card itself, not only after they tap through.
  const shareTitle = tournament.cancellation
    ? `${tournament.name} — Cancelled`
    : `${tournament.name} | Let's Pepper`

  return {
    // The root layout appends "| Let's Pepper" via its title template — do not
    // repeat it here or the tab reads "… | Let's Pepper | Let's Pepper".
    title: tournament.cancellation
      ? `${tournament.name} — Cancelled`
      : `${tournament.name} | Grass Volleyball in Aurora`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: shareTitle,
      description,
      url: canonicalPath,
      type: 'website',
      siteName: "Let's Pepper",
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
    },
  }
}

export default function TournamentLayout({ children, params }: Props) {
  const tournament = tournaments[params.slug]

  if (!tournament) return children

  const eventUrl = `${SITE_URL}/flavors/${tournament.slug}`
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: tournament.name,
    description: `${tournament.headline} ${tournament.description}`,
    startDate: tournament.startsAt,
    // The event is advertised as a one-day tournament. Keep this date-only until
    // an operator confirms a finish time rather than publishing a guessed time.
    endDate: tournament.startsAt.slice(0, 10),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    // Cancelled wins over the date check: a cancelled event that has since passed
    // is still cancelled, never completed. Publishing EventCancelled (rather than
    // pulling the page) is what carries the call-off into search results and any
    // aggregator that already indexed the listing.
    eventStatus: tournament.cancellation
      ? 'https://schema.org/EventCancelled'
      : Date.parse(tournament.startsAt) < Date.now()
        ? 'https://schema.org/EventCompleted'
        : 'https://schema.org/EventScheduled',
    sport: 'Volleyball',
    url: eventUrl,
    image: `${eventUrl}/opengraph-image`,
    location: {
      '@type': 'Place',
      name: tournament.venue.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: tournament.venue.streetAddress,
        addressLocality: tournament.venue.addressLocality,
        addressRegion: tournament.venue.addressRegion,
        postalCode: tournament.venue.postalCode,
        addressCountry: tournament.venue.addressCountry,
      },
    },
    organizer: {
      '@type': 'SportsOrganization',
      name: "Let's Pepper",
      url: SITE_URL,
      sameAs: [FACEBOOK_URL, INSTAGRAM_URL],
    },
  }

  return (
    <>
      <script
        id={`event-jsonld-${tournament.slug}`}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      {children}
    </>
  )
}
