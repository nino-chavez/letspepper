'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION, useReducedMotion } from '@/lib/motion'
import { NextEventMarquee } from './Marquee'

const taglineWords = ['GRASSROOTS.', 'PLAYER-OWNED.', 'BUILT TO', 'COMPETE.']

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion()

  return (
    <>
    <section
      aria-labelledby="hero-heading"
      className="relative min-h-screen flex items-center pt-20 overflow-hidden"
    >
      {/* Background Gradient */}
      <div
        className="absolute inset-0 bg-gradient-radial from-heat-jalapeno/10 via-transparent to-transparent opacity-50"
        aria-hidden="true"
      />

      {/* Animated Glow Orb */}
      <motion.div
        className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, var(--heat-jalapeno), transparent)' }}
        animate={prefersReducedMotion ? {} : {
          scale: [1, 1.2, 1],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{
          duration: 8,
          repeat: prefersReducedMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
      />

      <div className="section-container relative z-10">
        <div className="relative">
          {/* Text Content */}
          <div className="space-y-6 relative z-20 lg:max-w-[50%]">
            {/* Main Tagline */}
            <motion.h1
              id="hero-heading"
              className="text-hero max-w-full"
              initial="initial"
              animate="animate"
              transition={{ staggerChildren: 0.15, delayChildren: 0.2 }}
            >
              {taglineWords.map((word, index) => (
                <motion.span
                  key={word}
                  className="block"
                  variants={MOTION.variants.heroWord}
                  transition={{
                    duration: 0.8,
                    ease: MOTION.ease.outExpo,
                  }}
                  style={{
                    color:
                      index === 3
                        ? 'var(--heat-jalapeno)'
                        : index === 2
                        ? 'var(--heat-poblano)'
                        : 'var(--text-primary)',
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-xl sm:text-2xl text-zinc-400 max-w-md"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.6, ease: MOTION.ease.outExpo }}
            >
              Competitive grass triples, player-first events, and photos worth keeping.
            </motion.p>

            {/* CTAs */}
            <motion.div
              className="flex flex-wrap gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.6, ease: MOTION.ease.outExpo }}
            >
              <a href="#series" className="btn-primary">
                <span>Explore The Series</span>
                <span aria-hidden="true">→</span>
              </a>
              <a href="#gallery" className="btn-secondary">
                View Gallery
              </a>
            </motion.div>

            {/* Heat Level Legend */}
            <motion.div
              className="flex flex-wrap gap-6 pt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.6 }}
            >
              <div className="heat-indicator">
                <span className="heat-dot heat-dot-bell" />
                <span className="text-heat-bell">Mild</span>
              </div>
              <div className="heat-indicator">
                <span className="heat-dot heat-dot-poblano" />
                <span className="text-heat-poblano">Medium</span>
              </div>
              <div className="heat-indicator">
                <span className="heat-dot heat-dot-jalapeno" />
                <span className="text-heat-jalapeno">Hot</span>
              </div>
            </motion.div>
          </div>

          {/* Hero Image */}
          <motion.div
            className="hidden lg:block absolute right-0 bottom-0 w-[48%] max-h-[70vh] aspect-[4/5] rounded-2xl overflow-hidden"
            initial={{ opacity: 0, scale: 0.9, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 1, ease: MOTION.ease.outExpo }}
          >
            {/* Hero Photo - Grass Launch 2025 */}
            <Image
              src="https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-kTh9bRS/0/LTtD3WCXjvSmKKVqJ3bzwJG7Cvb6MvDLdhwRk4GHn/XL/lpo-green-pepper-2025-231-XL.jpg"
              alt="Bell Pepper Open 2025 - grass volleyball tournament action"
              fill
              priority
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />

            {/* Gradient Overlay for text readability */}
            <div
              className="absolute inset-0 bg-gradient-to-t from-pepper-black/60 via-transparent to-transparent"
              aria-hidden="true"
            />

            {/* Decorative Border Glow */}
            <div
              className="absolute inset-0 rounded-2xl border border-heat-jalapeno/30"
              aria-hidden="true"
            />

            {/* Corner Accent */}
            <div
              className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-heat-jalapeno/50 rounded-tr-xl"
              aria-hidden="true"
            />
            <div
              className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-heat-jalapeno/50 rounded-bl-xl"
              aria-hidden="true"
            />
          </motion.div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.6 }}
      >
        <motion.div
          className="w-6 h-10 rounded-full border-2 border-zinc-600 flex justify-center pt-2"
          aria-hidden="true"
        >
          <motion.div
            className="w-1 h-2 bg-zinc-500 rounded-full"
            animate={prefersReducedMotion ? {} : { y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: prefersReducedMotion ? 0 : Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>

    {/*
      Next Event Announcement Marquee.

      Sits between the hero and the next section rather than inside the hero.
      The hero's copy runs edge to edge vertically — the h1 alone is ~72% of its
      height — so a full-bleed rotated banner placed anywhere inside it lands on
      the headline. It previously used `absolute top-[35%]` and painted over
      "PLAYER-OWNED", hiding the tape's own event details in the process. The
      hero is also `overflow-hidden`, so the banner cannot be pushed to the seam
      from within it. Rendering it as a sibling is what puts it in clear space.
    */}
    <motion.div
      className="relative z-30 pointer-events-none my-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1.8, duration: 0.8 }}
    >
      <NextEventMarquee />
    </motion.div>
    </>
  )
}
