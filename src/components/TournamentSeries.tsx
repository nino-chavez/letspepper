'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { heatText, heatBg, type Heat } from '@/components/rhq/heat'
import { HeatMeter } from '@/components/rhq/HeatMeter'
import { tournaments as canonicalTournaments, isCancelled } from '@/lib/tournaments'

/**
 * Card-only presentation, keyed by the canonical tournament slug. Everything
 * factual — name, date, tagline, features, whether it is still happening — comes
 * from `@/lib/tournaments`. This holds only what the card adds on top.
 *
 * These cards used to carry their own copy of every event's facts. That is how a
 * cancelled finale kept advertising a payout on the homepage while its own event
 * page said otherwise: two records, one update.
 */
const cardArt: Record<string, { mascot: string; blurb: string }> = {
  'bell-pepper-open': {
    mascot: '/images/mascots/anime/web/bell-pepper-menace-walk-256.webp',
    blurb: 'First tournament of the season. Shake off the rust — Bell Pepper already owns the net.',
  },
  'jalapeno-open': {
    mascot: '/images/mascots/anime/web/jalapeno-menace-walk-256.webp',
    blurb: "Mid-season. You're dialed in. Jalapeño demands the complete game.",
  },
  'poblano-open': {
    // Poblano Verde fronts this event — men's divisions only; see flavors/[slug] mascotCharacter note.
    mascot: '/images/mascots/anime/web/poblano-verde-menace-walk-256.webp',
    blurb: 'The season closes with one final bracket.',
  },
}

interface Tournament {
  slug: string // site slug, e.g. 'poblano-open' — also the /flavors/ route
  name: string
  heat: Heat
  rhqSlug: string // RHQ event slug for live-state fetch
  mascot: string
  tagline: string
  description: string
  date: string // ISO date for comparison (YYYY-MM-DD)
  displayDate: string // Human-readable date
  features: string[]
  cancelled: boolean
}

const tournaments: Tournament[] = Object.values(canonicalTournaments)
  .map((t) => ({
    slug: t.slug,
    name: t.name,
    heat: t.heat,
    rhqSlug: t.rhqSlug,
    mascot: cardArt[t.slug]?.mascot ?? '',
    tagline: t.tagline,
    description: cardArt[t.slug]?.blurb ?? t.description,
    date: t.startsAt.slice(0, 10),
    displayDate: t.date.split(',').slice(1).join(',').trim(),
    features: t.features,
    cancelled: isCancelled(t),
  }))
  .sort((a, b) => a.date.localeCompare(b.date))

const heatCardClass: Record<Heat, string> = {
  bell: 'heat-card-bell',
  poblano: 'heat-card-poblano',
  jalapeno: 'heat-card-jalapeno',
}

const heatLevel: Record<Heat, string> = {
  bell: 'Mild',
  poblano: 'Medium',
  jalapeno: 'Hot',
}

const heatGlowClass: Record<Heat, string> = {
  bell: 'glow-bell',
  poblano: 'glow-poblano',
  jalapeno: 'glow-jalapeno',
}

/** Fetch /api/rhq/summary?slug=… and return is_live. Falls back to false on error. */
function useLiveState(slug: string): boolean {
  const [isLive, setIsLive] = useState(false)
  useEffect(() => {
    if (!slug) return
    fetch(`/api/rhq/summary?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.is_live === true) setIsLive(true)
      })
      .catch(() => {/* fall back to date logic */})
  }, [slug])
  return isLive
}

function getNextEventSlug(tournaments: Tournament[]): string | null {
  const today = new Date().toISOString().split('T')[0]
  const upcoming = tournaments.filter((t) => t.date >= today && !t.cancelled)
  return upcoming.length > 0 ? upcoming[0].slug : null
}

function TournamentCard({ tournament, isNext }: { tournament: Tournament; isNext: boolean }) {
  const { heat, cancelled } = tournament
  // Skip the live-state fetch entirely for a cancelled event — Rally HQ still
  // holds the tournament record, and a stale is_live would light up a LIVE NOW
  // badge for a bracket nobody is playing.
  const isLive = useLiveState(cancelled ? '' : tournament.rhqSlug)

  return (
    <motion.article
      className={cn(
        'heat-card group p-6 sm:p-8 h-full border-zinc-800',
        heatCardClass[heat],
        // Cancelled recedes: the card stays (people still look for the event) but
        // it stops competing for attention with the events that are happening.
        cancelled && 'opacity-70 saturate-50',
      )}
      variants={MOTION.variants.slideUp}
      whileHover={cancelled ? undefined : { y: -8, transition: { duration: 0.2 } }}
    >
      {/* Cancelled / Live / Next Up Badge — LIVE uses --live coral; Next Up is neutral */}
      {cancelled ? (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-accent uppercase tracking-widest mb-4 bg-zinc-800 border border-zinc-600 text-zinc-200">
          Cancelled
        </div>
      ) : isLive ? (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-accent uppercase tracking-widest mb-4 bg-zinc-800 border border-zinc-700">
          <span
            className="relative flex h-2 w-2"
            aria-hidden="true"
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: 'var(--live)' }} />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: 'var(--live)' }} />
          </span>
          <span style={{ color: 'var(--live)' }}>Live Now</span>
        </div>
      ) : isNext ? (
        <div className={cn(
          'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-accent uppercase tracking-widest mb-4',
          'bg-zinc-800 border border-zinc-700',
          heatText[heat],
        )}>
          Next Up · {tournament.displayDate}
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <motion.div
          className="relative w-20 h-20 sm:w-24 sm:h-24 -ml-2 -mt-2"
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Image
            src={tournament.mascot}
            alt={`${tournament.name} mascot`}
            fill
            unoptimized
            className="object-contain drop-shadow-lg"
          />
        </motion.div>

        {/* Heat Indicator */}
        <div className={cn('heat-indicator', heatText[heat])}>
          <HeatMeter heat={heat} size="sm" />
          <span>{heatLevel[heat]}</span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        <div>
          <p className="text-section-heading mb-2">{tournament.tagline}</p>
          <h3 className="font-display text-3xl sm:text-4xl uppercase text-white">
            {tournament.name}
          </h3>
        </div>

        <p className="text-zinc-400 leading-relaxed">{tournament.description}</p>

        {/* Features — a cancelled event carries none, so the list drops out entirely
            rather than rendering an empty row that reads as a layout bug. */}
        {tournament.features.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tournament features">
          {tournament.features.map((feature) => (
            <li
              key={feature}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-accent uppercase tracking-wider',
                'bg-zinc-800/50 text-zinc-400',
                'border border-zinc-700/50'
              )}
            >
              {feature}
            </li>
          ))}
        </ul>
        )}
      </div>

      {/* CTA — a cancelled event still gets a link (that page carries the notice),
          but not the heat-coloured promo button that reads as an invitation. */}
      <div className="mt-8">
        <a
          href={`/flavors/${tournament.slug}`}
          className={cn(
            'btn-heat',
            cancelled ? 'bg-zinc-700 hover:bg-zinc-600' : cn(heatBg[heat], heatGlowClass[heat]),
          )}
        >
          <span>{cancelled ? 'Read the notice' : 'Learn More'}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>

      {/* Decorative Corner */}
      <div
        className={cn(
          'absolute bottom-0 right-0 w-24 h-24 opacity-5',
          'bg-gradient-radial from-current to-transparent'
        )}
        style={{ color: `var(--heat-${heat})` }}
        aria-hidden="true"
      />
    </motion.article>
  )
}

export function TournamentSeries() {
  const nextEventSlug = getNextEventSlug(tournaments)

  return (
    <section
      id="series"
      aria-labelledby="series-heading"
      className="section-padding relative"
    >
      {/* Background Accent */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-transparent via-pepper-charcoal/30 to-transparent"
        aria-hidden="true"
      />

      <div className="section-container relative z-10">
        {/* Section Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
        >
          <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-4">
            Choose Your Format
          </p>
          <h2 className="block-heading text-4xl sm:text-5xl">
            The <span className={heatText['jalapeno']}>Series</span>
          </h2>
        </motion.div>

        {/* Tournament Grid */}
        <motion.div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          initial="initial"
          whileInView="animate"
          viewport={MOTION.viewport.once}
          transition={{ staggerChildren: 0.15 }}
        >
          {tournaments.map((tournament) => (
            <TournamentCard key={tournament.slug} tournament={tournament} isNext={tournament.slug === nextEventSlug} />
          ))}
        </motion.div>

        {/* Format Info */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={MOTION.viewport.once}
          transition={{ delay: 0.5 }}
        >
          <p className="font-accent text-sm text-zinc-500 uppercase tracking-wider">
            All events • 3v3 Grass Format • Player-First Competition
          </p>
        </motion.div>
      </div>
    </section>
  )
}
