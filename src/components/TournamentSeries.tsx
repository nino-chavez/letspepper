'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface Tournament {
  id: string
  name: string
  heat: 'bell' | 'poblano' | 'jalapeno'
  mascot: string
  tagline: string
  description: string
  features: string[]
}

const tournaments: Tournament[] = [
  {
    id: 'bell-pepper',
    name: 'Bell Pepper Open',
    heat: 'bell',
    mascot: '/images/mascots/bell-pepper-action.png',
    tagline: 'Season Opener',
    description:
      'First tournament of the season. Shake off the rust, find your rhythm, and get warmed up.',
    features: ['Season Kickoff', 'Full Media', 'Cash Prizes'],
  },
  {
    id: 'jalapeno',
    name: 'Jalapeño Open',
    heat: 'jalapeno',
    mascot: '/images/mascots/jalapeno-action.png',
    tagline: 'Bring The Heat',
    description:
      "Mid-season. You're dialed in. Now it's time to turn up the intensity.",
    features: ['Peak Competition', 'High Intensity', 'Fast Pace'],
  },
  {
    id: 'poblano',
    name: 'Poblano Open',
    heat: 'poblano',
    mascot: '/images/mascots/poblano-pepper-action.png',
    tagline: 'Season Finale',
    description:
      'Cooling things down. Last tournament of the season. Leave it all on the grass.',
    features: ['Season Closer', 'Final Standings', 'Year-End Celebration'],
  },
]

const heatConfig = {
  bell: {
    cardClass: 'heat-card-bell',
    dotClass: 'heat-dot-bell',
    textClass: 'text-heat-bell',
    level: 'Mild',
    bars: 1,
  },
  poblano: {
    cardClass: 'heat-card-poblano',
    dotClass: 'heat-dot-poblano',
    textClass: 'text-heat-poblano',
    level: 'Medium',
    bars: 2,
  },
  jalapeno: {
    cardClass: 'heat-card-jalapeno',
    dotClass: 'heat-dot-jalapeno',
    textClass: 'text-heat-jalapeno',
    level: 'Hot',
    bars: 3,
  },
}

function HeatMeter({ level }: { level: number }) {
  return (
    <div className="flex gap-1" aria-label={`Heat level ${level} of 3`}>
      {[1, 2, 3].map((bar) => (
        <div
          key={bar}
          className={cn(
            'w-2 h-4 rounded-sm transition-colors',
            bar <= level ? 'bg-current' : 'bg-zinc-700'
          )}
        />
      ))}
    </div>
  )
}

function TournamentCard({ tournament }: { tournament: Tournament }) {
  const config = heatConfig[tournament.heat]

  return (
    <motion.article
      className={cn('heat-card group p-6 sm:p-8 h-full', config.cardClass)}
      variants={MOTION.variants.slideUp}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
    >
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
            className="object-contain drop-shadow-lg"
          />
        </motion.div>

        {/* Heat Indicator */}
        <div className={cn('heat-indicator', config.textClass)}>
          <HeatMeter level={config.bars} />
          <span>{config.level}</span>
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
          className={cn(
            'inline-flex items-center gap-2 font-accent text-sm uppercase tracking-wider',
            'text-zinc-400 hover:text-white transition-colors group/link'
          )}
        >
          <span>Learn More</span>
          <span
            className="group-hover/link:translate-x-1 transition-transform"
            aria-hidden="true"
          >
            →
          </span>
        </a>
      </div>

      {/* Decorative Corner */}
      <div
        className={cn(
          'absolute bottom-0 right-0 w-24 h-24 opacity-5',
          'bg-gradient-radial from-current to-transparent'
        )}
        style={{ color: `var(--heat-${tournament.heat})` }}
        aria-hidden="true"
      />
    </motion.article>
  )
}

export function TournamentSeries() {
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
          <p className="text-section-heading mb-4">Choose Your Format</p>
          <h2 className="text-display">
            The <span className="text-heat-jalapeno">Series</span>
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
            <TournamentCard key={tournament.id} tournament={tournament} />
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
