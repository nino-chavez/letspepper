'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { heatText, heatBg, type Heat } from '@/components/rhq/heat'
import { HeatMeter } from '@/components/rhq/HeatMeter'

interface Tournament {
  id: string
  name: string
  heat: Heat
  slug: string // RHQ event slug for live-state fetch
  mascot: string
  tagline: string
  description: string
  date: string // ISO date for comparison (YYYY-MM-DD)
  displayDate: string // Human-readable date
  features: string[]
}

const tournaments: Tournament[] = [
  {
    id: 'bell-pepper',
    name: 'Bell Pepper Open',
    heat: 'bell',
    slug: 'bell-pepper-open-2026',
    mascot: '/images/mascots/anime/web/bell-pepper-menace-walk-256.webp',
    tagline: 'Season Opener',
    description:
      'First tournament of the season. Shake off the rust — Bell Pepper already owns the net.',
    date: '2026-06-07',
    displayDate: 'June 7, 2026',
    features: ['Season Kickoff', 'Full Media', 'Finalist Prizes'],
  },
  {
    id: 'jalapeno',
    name: 'Jalapeño Open',
    heat: 'jalapeno',
    slug: 'jalapeno-open-2026',
    mascot: '/images/mascots/anime/web/jalapeno-menace-walk-256.webp',
    tagline: 'Bring The Heat',
    description:
      "Mid-season. You're dialed in. Jalapeño demands the complete game.",
    date: '2026-07-18',
    displayDate: 'July 18, 2026',
    features: ['Peak Competition', 'High Intensity', 'Fast Pace'],
  },
  {
    id: 'poblano',
    name: 'Poblano Open',
    heat: 'poblano',
    slug: 'poblano-open-2026',
    // Poblano Verde fronts this event — men's divisions only; see flavors/[slug] mascotCharacter note.
    mascot: '/images/mascots/anime/web/poblano-verde-menace-walk-256.webp',
    tagline: 'Season Finale',
    description:
      "The season closes with one final bracket — and a payout that scales with the field: $2,000 first place at a full 28-team field.",
    date: '2026-08-01',
    displayDate: 'August 1, 2026',
    features: ['$2,000 at a Full 28', 'Season Closer', 'Final Standings'],
  },
]

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
    fetch(`/api/rhq/summary?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.is_live === true) setIsLive(true)
      })
      .catch(() => {/* fall back to date logic */})
  }, [slug])
  return isLive
}

function getNextEventId(tournaments: Tournament[]): string | null {
  const today = new Date().toISOString().split('T')[0]
  const upcoming = tournaments.filter((t) => t.date >= today)
  return upcoming.length > 0 ? upcoming[0].id : null
}

function TournamentCard({ tournament, isNext }: { tournament: Tournament; isNext: boolean }) {
  const { heat } = tournament
  const isLive = useLiveState(tournament.slug)

  return (
    <motion.article
      className={cn(
        'heat-card group p-6 sm:p-8 h-full border-zinc-800',
        heatCardClass[heat],
      )}
      variants={MOTION.variants.slideUp}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
    >
      {/* Live / Next Up Badge — LIVE uses --live coral; Next Up is neutral */}
      {isLive ? (
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

        {/* Features */}
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
      </div>

      {/* CTA */}
      <div className="mt-8">
        <a
          href={`/flavors/${tournament.id}-open`}
          className={cn('btn-heat', heatBg[heat], heatGlowClass[heat])}
        >
          <span>Learn More</span>
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
  const nextEventId = getNextEventId(tournaments)

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
            <TournamentCard key={tournament.id} tournament={tournament} isNext={tournament.id === nextEventId} />
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
