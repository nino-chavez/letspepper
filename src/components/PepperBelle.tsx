'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'

export function PepperBelle() {
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle email submission
    setIsSubmitted(true)
    setEmail('')
  }

  return (
    <section
      id="belle"
      aria-labelledby="belle-heading"
      className="section-padding relative overflow-hidden"
    >
      {/* Background Gradient */}
      <div
        className="absolute inset-0 bg-gradient-radial from-belle-primary/10 via-transparent to-transparent opacity-50"
        aria-hidden="true"
      />

      {/* Animated Glow */}
      <motion.div
        className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-10"
        style={{ background: 'radial-gradient(circle, var(--belle-primary), transparent)' }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.1, 0.2, 0.1],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
      />

      <div className="section-container relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Content */}
          <motion.div
            className="space-y-8"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={MOTION.viewport.once}
            transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-belle-primary/10 border border-belle-primary/30">
              <span className="heat-dot heat-dot-belle" />
              <span className="font-accent text-xs uppercase tracking-wider text-belle-primary">
                Coming Soon
              </span>
            </div>

            {/* Heading */}
            <div>
              <p className="text-section-heading mb-4">Women&apos;s Tournament</p>
              <h2 id="belle-heading" className="text-display">
                Pepper <span className="text-belle-primary">Belle</span> Cup
              </h2>
            </div>

            {/* Description */}
            <p className="text-xl text-zinc-400 max-w-lg">
              The women&apos;s 3v3 tournament series. Same grassroots energy, same
              competitive fire, built for the queens of the court.
            </p>

            {/* Features */}
            <ul className="grid sm:grid-cols-2 gap-4">
              {['3v3 Format', 'Grass Courts', 'Prize Payouts', 'Media Coverage'].map(
                (feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-zinc-300"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-belle-primary" />
                    {feature}
                  </li>
                )
              )}
            </ul>

            {/* Email Signup */}
            <div className="pt-4">
              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 text-belle-primary"
                >
                  <span className="text-xl">✓</span>
                  <span className="font-accent text-sm uppercase tracking-wider">
                    You&apos;re on the list
                  </span>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
                  <label htmlFor="belle-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="belle-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    className={cn(
                      'flex-1 px-4 py-3 rounded-full',
                      'bg-pepper-charcoal border border-zinc-700',
                      'text-white placeholder:text-zinc-500',
                      'focus:border-belle-primary focus:outline-none focus:ring-2 focus:ring-belle-primary/20',
                      'transition-colors'
                    )}
                  />
                  <button type="submit" className="btn-belle whitespace-nowrap">
                    Get Notified
                  </button>
                </form>
              )}
            </div>
          </motion.div>

          {/* Visual */}
          <motion.div
            className="relative"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={MOTION.viewport.once}
            transition={{ duration: 0.8, ease: MOTION.ease.outExpo, delay: 0.2 }}
          >
            {/* Card Stack Effect */}
            <div className="relative aspect-[3/4] max-w-md mx-auto">
              {/* Back Card */}
              <div
                className="absolute inset-4 rounded-3xl bg-belle-primary/5 border border-belle-primary/10 rotate-6"
                aria-hidden="true"
              />

              {/* Middle Card */}
              <div
                className="absolute inset-2 rounded-3xl bg-belle-primary/10 border border-belle-primary/20 rotate-3"
                aria-hidden="true"
              />

              {/* Front Card with Image */}
              <div className="heat-card heat-card-belle relative rounded-3xl overflow-hidden h-full">
                {/* Player Image - Krush Reverse Co-Ed grass volleyball */}
                <Image
                  src="https://photos.smugmug.com/Sports/Volleyball/Grass/Krush-Reverse-Co-Ed-2-20250817/i-tDWZwkq/0/NcLvqJqcQMgLPZnNvQQsBdxRx8tCjWMc9djtmKkz6/L/krush-reverse-coed-2-97-L.jpg"
                  alt="Grass volleyball spike action - competitive women's tournament"
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />

                {/* Gradient Overlay */}
                <div
                  className="absolute inset-0 bg-gradient-to-t from-pepper-black/90 via-pepper-black/20 to-transparent"
                  aria-hidden="true"
                />

                {/* Text Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-8 text-center">
                  <p className="font-display text-4xl sm:text-5xl uppercase text-white mb-2">
                    Pepper Belle
                  </p>
                  <p className="font-accent text-sm text-belle-primary uppercase tracking-wider">
                    Women&apos;s 3v3 Series
                  </p>
                </div>

                {/* Decorative Elements */}
                <div
                  className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-belle-primary/50 rounded-tr-xl"
                  aria-hidden="true"
                />
                <div
                  className="absolute bottom-24 left-6 w-12 h-12 border-b-2 border-l-2 border-belle-primary/50 rounded-bl-xl"
                  aria-hidden="true"
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
