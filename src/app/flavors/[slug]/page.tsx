'use client'

import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'

interface TournamentDetail {
  slug: string
  name: string
  heat: 'bell' | 'poblano' | 'jalapeno'
  mascot: string
  tagline: string
  headline: string
  description: string
  date: string
  time: string
  location: string
  division: string
  entryFee: string
  format: string
  payouts: string[]
  features: string[]
  mediaPerks: string[]
}

const tournaments: Record<string, TournamentDetail> = {
  'bell-pepper-open': {
    slug: 'bell-pepper-open',
    name: 'The Bell Pepper Open',
    heat: 'bell',
    mascot: '/images/mascots/bell-pepper-action.png',
    tagline: 'Season Opener',
    headline: 'The season opener. First tournament of the Let\'s Pepper Series — shake off the rust, find your rhythm, and get warmed up.',
    description: 'Player-first, payout-backed, and media-covered. This is where the Let\'s Pepper Series begins. Building momentum for the season ahead.',
    date: 'Saturday, July 19, 2025',
    time: '9:00 AM – 7:30 PM',
    location: 'Aurora, IL',
    division: 'Grass Triples (Open Level)',
    entryFee: '$120 per team',
    format: 'Pool Play + Single Elimination Bracket',
    payouts: [
      '1st Place: $$$',
      '2nd Place: $$',
      'All finalists receive media coverage and photos',
    ],
    features: ['Season Kickoff', 'Full Media Coverage', 'Cash Prizes'],
    mediaPerks: [
      'Professional photo and video by Flickday Media',
      'Post-tournament highlight reels',
      'Taggable galleries available at nino.photos',
    ],
  },
  'jalapeno-open': {
    slug: 'jalapeno-open',
    name: 'The Jalapeño Open',
    heat: 'jalapeno',
    mascot: '/images/mascots/jalapeno-action.png',
    tagline: 'Bring The Heat',
    headline: 'Now it\'s time to bring the heat. The Jalapeño Open hits fast, sharp, and fully spiced.',
    description: 'Mid-season. You\'re dialed in — turn up the intensity. Built for players who value clean hands, crisp touches, and spicy pulls. Tighter rallies and peak competitive intensity.',
    date: 'Saturday, May 2, 2026',
    time: '10:00 AM – 6:00 PM',
    location: 'TBD',
    division: 'Grass Triples (Open Level)',
    entryFee: 'TBD',
    format: 'Pool Play + Single Elimination Bracket',
    payouts: [
      'Cash prizes',
      'Content coverage',
      'Merch for finalists',
    ],
    features: ['Peak Competition', 'High Intensity', 'Fast Pace'],
    mediaPerks: [
      'Professional photo coverage by Flickday Media',
      'Highlight reels and action shots',
      'Full gallery access',
    ],
  },
  'poblano-open': {
    slug: 'poblano-open',
    name: 'The Poblano Pepper Open',
    heat: 'poblano',
    mascot: '/images/mascots/poblano-pepper-action.png',
    tagline: 'Season Finale',
    headline: 'Cooling things down. The Poblano Pepper Open — final stop of the Let\'s Pepper Series.',
    description: 'Built for grinders, diggers, and defenders who know that touch beats torque. Long rallies, dirty knees, and payouts that stay spicy. Leave it all on the grass.',
    date: 'Saturday, May 2, 2026',
    time: '11:00 AM – 6:00 PM',
    location: 'TBD',
    division: 'Grass Triples (Open Level)',
    entryFee: 'TBD',
    format: 'Pool Play + Single Elimination Bracket',
    payouts: [
      'Cash prizes',
      'Content coverage',
      'Year-end merch',
    ],
    features: ['Season Closer', 'Final Standings', 'Year-End Celebration'],
    mediaPerks: [
      'Professional photo coverage by Flickday Media',
      'Season recap content',
      'Full gallery access',
    ],
  },
}

const heatConfig = {
  bell: {
    color: 'var(--heat-bell)',
    textClass: 'text-heat-bell',
    borderClass: 'border-heat-bell',
    bgClass: 'bg-heat-bell',
    level: 'Mild',
    bars: 1,
  },
  poblano: {
    color: 'var(--heat-poblano)',
    textClass: 'text-heat-poblano',
    borderClass: 'border-heat-poblano',
    bgClass: 'bg-heat-poblano',
    level: 'Medium',
    bars: 2,
  },
  jalapeno: {
    color: 'var(--heat-jalapeno)',
    textClass: 'text-heat-jalapeno',
    borderClass: 'border-heat-jalapeno',
    bgClass: 'bg-heat-jalapeno',
    level: 'Hot',
    bars: 3,
  },
}

function HeatMeter({ level, colorClass }: { level: number; colorClass: string }) {
  return (
    <div className="flex gap-1" aria-label={`Heat level ${level} of 3`}>
      {[1, 2, 3].map((bar) => (
        <div
          key={bar}
          className={cn(
            'w-3 h-6 rounded-sm transition-colors',
            bar <= level ? colorClass : 'bg-zinc-700'
          )}
        />
      ))}
    </div>
  )
}

export default function FlavorPage({ params }: { params: { slug: string } }) {
  const tournament = tournaments[params.slug]

  if (!tournament) {
    notFound()
  }

  const config = heatConfig[tournament.heat]

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero Section */}
        <section className="section-padding relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-radial from-current/10 via-transparent to-transparent opacity-30"
            style={{ color: config.color }}
            aria-hidden="true"
          />

          <div className="section-container relative z-10">
            {/* Back Link */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Link
                href="/#series"
                className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors font-accent text-sm uppercase tracking-wider mb-8"
              >
                <span aria-hidden="true">←</span>
                <span>Back to Series</span>
              </Link>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Content */}
              <motion.div
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
              >
                {/* Heat Badge */}
                <div className={cn('inline-flex items-center gap-3', config.textClass)}>
                  <HeatMeter level={config.bars} colorClass={config.bgClass} />
                  <span className="font-accent text-sm uppercase tracking-wider">
                    {config.level}
                  </span>
                </div>

                {/* Tagline */}
                <p className="text-section-heading">{tournament.tagline}</p>

                {/* Title */}
                <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl uppercase text-white">
                  {tournament.name}
                </h1>

                {/* Headline */}
                <p className={cn('text-xl sm:text-2xl leading-relaxed', config.textClass)}>
                  {tournament.headline}
                </p>

                {/* Description */}
                <p className="text-lg text-zinc-400 leading-relaxed">
                  {tournament.description}
                </p>

                {/* Features */}
                <div className="flex flex-wrap gap-2 pt-2">
                  {tournament.features.map((feature) => (
                    <span
                      key={feature}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-accent uppercase tracking-wider',
                        'border',
                        config.borderClass,
                        config.textClass
                      )}
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* Mascot */}
              <motion.div
                className="relative aspect-square max-w-md mx-auto lg:mx-0"
                initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                transition={{ duration: 0.8, ease: MOTION.ease.outExpo, delay: 0.2 }}
              >
                <Image
                  src={tournament.mascot}
                  alt={`${tournament.name} mascot`}
                  fill
                  className="object-contain drop-shadow-2xl"
                  priority
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Event Details Section */}
        <section className="section-padding bg-pepper-charcoal/30">
          <div className="section-container">
            <motion.div
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={MOTION.viewport.once}
              transition={{ staggerChildren: 0.1 }}
            >
              {/* Date & Time */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Date & Time
                </h2>
                <p className="text-xl text-white">{tournament.date}</p>
                <p className="text-zinc-400">{tournament.time}</p>
              </motion.div>

              {/* Location */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Location
                </h2>
                <p className="text-xl text-white">{tournament.location}</p>
              </motion.div>

              {/* Division */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Division
                </h2>
                <p className="text-xl text-white">{tournament.division}</p>
              </motion.div>

              {/* Entry Fee */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Entry Fee
                </h2>
                <p className="text-xl text-white">{tournament.entryFee}</p>
              </motion.div>

              {/* Format */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Format
                </h2>
                <p className="text-xl text-white">{tournament.format}</p>
              </motion.div>

              {/* Payouts */}
              <motion.div
                className="space-y-3"
                variants={MOTION.variants.slideUp}
              >
                <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">
                  Payouts
                </h2>
                <ul className="space-y-1">
                  {tournament.payouts.map((payout, i) => (
                    <li key={i} className="text-zinc-400">{payout}</li>
                  ))}
                </ul>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Media Perks Section */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-section-heading mb-4">Media Coverage</h2>
              <p className="text-display mb-8">
                Built For <span className={config.textClass}>Players</span>. Backed By Media.
              </p>

              <ul className="space-y-4">
                {tournament.mediaPerks.map((perk, i) => (
                  <li key={i} className="flex items-start gap-3 text-lg text-zinc-400">
                    <span className={cn('mt-1.5', config.textClass)} aria-hidden="true">●</span>
                    {perk}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section-padding bg-gradient-to-t from-pepper-charcoal/50 to-transparent">
          <div className="section-container text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              className="space-y-6"
            >
              <p className="text-xl text-zinc-400">
                Let&apos;s Pepper is a player-first volleyball series. Built for competition, content, and community.
              </p>
              <p className="font-accent text-lg text-zinc-500 uppercase tracking-wider">
                Grass roots. High level. Real payout.
              </p>

              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Link href="/#series" className="btn-primary">
                  <span>View All Events</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="https://gallery.ninochavez.co/Sports/Volleyball/Grass/LPO"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  <span>View Gallery</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
