'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import {
  GrassrootsIcon,
  PlayerOwnedIcon,
  MediaIcon,
  CompetitionIcon,
  CameraIcon,
} from './icons'

const values = [
  {
    Icon: GrassrootsIcon,
    title: 'Grassroots First',
    description: 'Built from cow pastures and dirt patches. No corporate sponsors, no politics.',
  },
  {
    Icon: PlayerOwnedIcon,
    title: 'Player-Owned',
    description: 'By players, for players. We know what competitive volleyball needs.',
  },
  {
    Icon: MediaIcon,
    title: 'Media-Backed',
    description: 'Professional coverage through Flickday Media. Your moments captured.',
  },
  {
    Icon: CompetitionIcon,
    title: 'Pure Competition',
    description: 'No fluff. Just skill, sweat, and the kind of fun that makes you come back.',
  },
]

export function EthosSection() {
  return (
    <section
      id="ethos"
      aria-labelledby="ethos-heading"
      className="section-padding relative"
    >
      {/* Background Accent */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-pepper-charcoal/50 via-pepper-black to-pepper-black"
        aria-hidden="true"
      />

      <div className="section-container relative z-10">
        {/* Section Header */}
        <motion.div
          className="max-w-3xl mx-auto text-center mb-16 lg:mb-24"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
        >
          <p className="text-section-heading mb-4">Our Story</p>
          <h2 id="ethos-heading" className="text-display mb-8">
            Built From The{' '}
            <span className="text-heat-bell">Grass</span> Up
          </h2>

          {/* Main Quote */}
          <blockquote className="relative">
            <span
              className="absolute -top-4 -left-4 text-6xl text-zinc-800 font-serif"
              aria-hidden="true"
            >
              &ldquo;
            </span>
            <p className="text-xl sm:text-2xl text-zinc-300 leading-relaxed">
              We&apos;ve played pickup in cow pastures, built nets on dirt patches, and
              still pack lines in the trunk. This isn&apos;t about sponsorships or
              politics—it&apos;s about skill, trust, and a little bit of madness.
            </p>
            <span
              className="absolute -bottom-4 -right-4 text-6xl text-zinc-800 font-serif"
              aria-hidden="true"
            >
              &rdquo;
            </span>
          </blockquote>
        </motion.div>

        {/* Values Grid */}
        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8"
          initial="initial"
          whileInView="animate"
          viewport={MOTION.viewport.once}
          transition={{ staggerChildren: 0.1 }}
        >
          {values.map((value) => (
            <motion.div
              key={value.title}
              className="group text-center sm:text-left"
              variants={MOTION.variants.slideUp}
            >
              {/* Icon */}
              <div className="inline-block mb-4 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 group-hover:border-zinc-600/50 transition-colors">
                <value.Icon size={32} />
              </div>

              {/* Content */}
              <h3 className="font-display text-xl uppercase text-white mb-2">
                {value.title}
              </h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                {value.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Flickday Media Connection */}
        <motion.div
          className="mt-20 pt-12 border-t border-zinc-800/50 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={MOTION.viewport.once}
          transition={{ delay: 0.4 }}
        >
          <p className="text-zinc-600 mb-4 font-accent text-sm uppercase tracking-wider">
            Media Partner
          </p>
          <a
            href="https://flickdaymedia.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 group"
          >
            <CameraIcon size={28} className="text-zinc-400 group-hover:text-heat-jalapeno transition-colors" />
            <span className="font-display text-2xl uppercase text-zinc-400 group-hover:text-heat-jalapeno transition-colors">
              Flickday Media
            </span>
          </a>
          <p className="mt-2 text-sm text-zinc-600">
            &ldquo;Every day&apos;s a Flickday&rdquo;
          </p>
        </motion.div>
      </div>
    </section>
  )
}
