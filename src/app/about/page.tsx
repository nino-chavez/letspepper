'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'

const galleryImages = [
  {
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-MKbtxb7/0/MGmNvWrKdGFhbQHwBwWM7DkpqR8LRnQhv9kjQ59RR/L/lpo-green-pepper-2025-003-L.jpg',
    alt: 'Grass volleyball action at Bell Pepper Open',
  },
  {
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/KrushSuburbanSlam2025/i-V5b7DfL/0/NHcnwG9P2kjf9Mq3HjnnMPG4cLZwXTFCcJ4Vn23XF/L/krush-suburban-slam-028-L.jpg',
    alt: 'Diving save on grass court',
  },
  {
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/2025-Cookout-Volleyball-Grass-Tournament/i-pBgXBfb/0/LfkpqrRfKQJRcttfjGxCvGcJzTk4nLGvw5VXWWRKs/L/2025-cookout-vb-004-L.jpg',
    alt: 'Cookout volleyball tournament action',
  },
  {
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/Krush-Reverse-CoEd-20250720/i-g7tTzCp/0/LkngPzKtmhwzV3njpFKqSB2qQpKHFNzfWFW8rrS6c/L/krush-reverse-coed-003-L.jpg',
    alt: 'Competitive grass volleyball',
  },
]

const values = [
  {
    title: 'Grassroots First',
    description: 'Built on local grass courts with the players at the center.',
  },
  {
    title: 'Player-Owned',
    description: 'Designed and run by people who play the format.',
  },
  {
    title: 'Media-Backed',
    description: 'Professional Flickday Media coverage organized for teams to find and share.',
  },
  {
    title: 'Real Stakes',
    description: 'Prizes and recognition tied to clear results.',
  },
]

export default function AboutPage() {
  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero Section */}
        <section className="section-padding relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-radial from-heat-jalapeno/10 via-transparent to-transparent opacity-30"
            aria-hidden="true"
          />

          <div className="section-container relative z-10">
            <motion.div
              className="max-w-4xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">Our Story</p>
              <h1 className="text-display mb-8">
                Grassroots. Player-Owned.{' '}
                <span className="text-heat-jalapeno">Built To Compete.</span>
              </h1>

              <p className="text-xl sm:text-2xl text-zinc-300 leading-relaxed max-w-3xl">
                Let&apos;s Pepper is a grass triples series built around strong competition and a better tournament day.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section className="section-padding bg-pepper-charcoal/30">
          <div className="section-container">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Image Grid */}
              <motion.div
                className="grid grid-cols-2 gap-4"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={MOTION.viewport.once}
                transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
              >
                {galleryImages.map((image, index) => (
                  <div
                    key={index}
                    className={cn(
                      'relative rounded-xl overflow-hidden',
                      index === 0 ? 'aspect-[4/5]' : 'aspect-square',
                      index === 0 && 'row-span-2'
                    )}
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      className="object-cover"
                    />
                  </div>
                ))}
              </motion.div>

              {/* Content */}
              <motion.div
                className="space-y-8"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={MOTION.viewport.once}
                transition={{ duration: 0.8, ease: MOTION.ease.outExpo, delay: 0.2 }}
              >
                <div>
                  <h2 className="font-display text-4xl sm:text-5xl uppercase text-white mb-6">
                    A Better Tournament Day
                  </h2>
                  <p className="text-lg text-zinc-400 leading-relaxed mb-4">
                    Strong fields, clear formats, and matchups players remember.
                  </p>
                  <p className="text-lg text-zinc-400 leading-relaxed">
                    We&apos;ve played pickup on uneven fields, built courts from what we had, and kept extra lines in the trunk. Let&apos;s Pepper brings that resourcefulness to a tournament day built around the players.
                  </p>
                </div>

                <blockquote className="border-l-4 border-heat-jalapeno pl-6 py-2">
                  <p className="text-xl text-zinc-300 italic">
                    &ldquo;Good people, clean play, and a tournament you want to enter again.&rdquo;
                  </p>
                </blockquote>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Why Grass Triples Section */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-4xl mx-auto text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">The Format</p>
              <h2 className="text-display mb-8">
                Why <span className="text-heat-bell">Grass Triples</span>?
              </h2>

              <div className="space-y-6 text-left sm:text-center">
                <p className="text-xl text-zinc-300 leading-relaxed">
                  Grass triples strips volleyball down to its essentials: fewer players, faster decisions, more touches, more opportunities to make athletic plays.
                </p>

                <p className="text-2xl sm:text-3xl text-white font-display uppercase leading-tight">
                  No coach. No bench. Just you, your crew, and the wind in your toss.
                </p>

                <p className="text-lg text-zinc-400 leading-relaxed">
                  The format rewards skill, trust, and calculated risk-taking. Every point is earned. Every rally matters. It&apos;s volleyball at its most raw and competitive.
                </p>
              </div>
            </motion.div>

            {/* Hero Image */}
            <motion.div
              className="mt-16 relative aspect-[21/9] rounded-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo, delay: 0.2 }}
            >
              <Image
                src="https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-kTh9bRS/0/LTtD3WCXjvSmKKVqJ3bzwJG7Cvb6MvDLdhwRk4GHn/XL/lpo-green-pepper-2025-231-XL.jpg"
                alt="Bell Pepper Open grass volleyball tournament"
                fill
                className="object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-pepper-black/60 via-transparent to-transparent"
                aria-hidden="true"
              />

              {/* Corner Accents */}
              <div
                className="absolute top-4 right-4 w-20 h-20 border-t-2 border-r-2 border-heat-jalapeno/50 rounded-tr-xl"
                aria-hidden="true"
              />
              <div
                className="absolute bottom-4 left-4 w-20 h-20 border-b-2 border-l-2 border-heat-jalapeno/50 rounded-bl-xl"
                aria-hidden="true"
              />
            </motion.div>
          </div>
        </section>

        {/* Values Section */}
        <section className="section-padding bg-gradient-to-b from-pepper-charcoal/30 to-transparent">
          <div className="section-container">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <p className="text-section-heading mb-4">What We Stand For</p>
              <h2 className="text-display">
                Built By <span className="text-heat-poblano">Players</span>. Run For The Field.
              </h2>
            </motion.div>

            <motion.div
              className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={MOTION.viewport.once}
              transition={{ staggerChildren: 0.1 }}
            >
              {values.map((value, index) => (
                <motion.div
                  key={value.title}
                  className="text-center sm:text-left"
                  variants={MOTION.variants.slideUp}
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800/50 border border-zinc-700/50 mb-4">
                    <span className="text-heat-jalapeno font-display text-xl">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="font-display text-xl uppercase text-white mb-2">
                    {value.title}
                  </h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    {value.description}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* The Universe — mascot family band */}
        <section className="section-padding pt-0" aria-labelledby="universe-heading">
          <div className="section-container">
            <motion.div
              className="text-center mb-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <p className="text-section-heading mb-4">The Core Roster</p>
              <h2 id="universe-heading" className="text-display">
                Four Characters. One <span className="text-heat-bell">Visual System</span>.
              </h2>
            </motion.div>

            <motion.div
              className="relative rounded-2xl border border-zinc-800 bg-pepper-charcoal/40 overflow-hidden px-6 sm:px-12 pt-10 sm:pt-14"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              {/* floor glow — the roster stands on lit ground, not floating clip art */}
              <div
                className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-heat-jalapeno/10 via-heat-jalapeno/[0.04] to-transparent"
                aria-hidden="true"
              />
              <div className="relative aspect-[1992/633] w-full">
                <Image
                  src="/images/mascots/anime/web/family-overview-1600.webp"
                  alt="The Let's Pepper core roster: Jalapeño, Bell Pepper, Poblano, and Ghost Pepper"
                  fill
                  unoptimized
                  className="object-contain object-bottom"
                />
              </div>
            </motion.div>

            {/* character roster — order matches the band art */}
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8 text-center">
              {[
                { name: 'Jalapeño', role: 'Balanced all-rounder', note: 'Focused confidence.', color: 'text-heat-jalapeno' },
                { name: 'Bell Pepper', role: 'Net blocker', note: 'Power and timing.', color: 'text-heat-bell' },
                { name: 'Poblano', role: 'Floor defender', note: 'Quiet precision.', color: 'text-heat-poblano' },
                { name: 'Ghost Pepper', role: 'Pressure server', note: 'Calm under pressure. Event unannounced.', color: 'text-red-500' },
              ].map((c) => (
                <div key={c.name}>
                  <h3 className={cn('font-display text-2xl uppercase', c.color)}>{c.name}</h3>
                  <p className="font-accent text-[0.65rem] uppercase tracking-[0.14em] text-zinc-400 mt-1">
                    {c.role}
                  </p>
                  <p className="text-sm text-zinc-500 mt-1">{c.note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The Series Overview */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <p className="text-section-heading mb-4">The Tournament Series</p>
              <h2 className="text-display">
                Three Events. One <span className="text-heat-jalapeno">Season</span>.
              </h2>
            </motion.div>

            <motion.div
              className="grid md:grid-cols-3 gap-6"
              initial="initial"
              whileInView="animate"
              viewport={MOTION.viewport.once}
              transition={{ staggerChildren: 0.15 }}
            >
              {/* Bell Pepper */}
              <motion.div
                className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-heat-bell/30 transition-colors"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-2 text-heat-bell mb-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-4 rounded-sm bg-heat-bell" />
                    <div className="w-2 h-4 rounded-sm bg-zinc-700" />
                    <div className="w-2 h-4 rounded-sm bg-zinc-700" />
                  </div>
                  <span className="font-accent text-xs uppercase tracking-wider">Mild</span>
                </div>
                <h3 className="font-display text-2xl uppercase text-white mb-2">
                  Bell Pepper Open
                </h3>
                <p className="text-zinc-500 text-sm mb-4">
                  Season opener. Full media coverage and real stakes. Where the Let&apos;s Pepper Series begins.
                </p>
                <Link
                  href="/flavors/bell-pepper-open"
                  className="text-heat-bell font-accent text-sm uppercase tracking-wider hover:underline"
                >
                  Learn More →
                </Link>
              </motion.div>

              {/* Jalapeño */}
              <motion.div
                className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-heat-jalapeno/30 transition-colors"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-2 text-heat-jalapeno mb-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-4 rounded-sm bg-heat-jalapeno" />
                    <div className="w-2 h-4 rounded-sm bg-heat-jalapeno" />
                    <div className="w-2 h-4 rounded-sm bg-heat-jalapeno" />
                  </div>
                  <span className="font-accent text-xs uppercase tracking-wider">Hot</span>
                </div>
                <h3 className="font-display text-2xl uppercase text-white mb-2">
                  Jalapeño Open
                </h3>
                <p className="text-zinc-500 text-sm mb-4">
                  Mid-season pressure. Fast pace, high intensity, no room to coast.
                </p>
                <Link
                  href="/flavors/jalapeno-open"
                  className="text-heat-jalapeno font-accent text-sm uppercase tracking-wider hover:underline"
                >
                  Learn More →
                </Link>
              </motion.div>

              {/* Poblano */}
              <motion.div
                className="p-6 rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-heat-poblano/30 transition-colors"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-2 text-heat-poblano mb-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-4 rounded-sm bg-heat-poblano" />
                    <div className="w-2 h-4 rounded-sm bg-heat-poblano" />
                    <div className="w-2 h-4 rounded-sm bg-zinc-700" />
                  </div>
                  <span className="font-accent text-xs uppercase tracking-wider">Medium</span>
                </div>
                <h3 className="font-display text-2xl uppercase text-white mb-2">
                  Poblano Open
                </h3>
                <p className="text-zinc-500 text-sm mb-4">
                  Season finale. One final field, one final bracket.
                </p>
                <Link
                  href="/flavors/poblano-open"
                  className="text-heat-poblano font-accent text-sm uppercase tracking-wider hover:underline"
                >
                  Learn More →
                </Link>
              </motion.div>
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
              <p className="font-display text-3xl sm:text-4xl uppercase text-white">
                Ready to play?
              </p>
              <p className="text-lg text-zinc-400 max-w-xl mx-auto">
                Grass roots. High level. Real stakes.
              </p>

              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Link href="/#series" className="btn-primary">
                  <span>View Events</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <a
                  href="https://gallery.ninochavez.co/Sports/Volleyball/Grass/LPO"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  aria-label="View Let's Pepper photo gallery (opens in new tab)"
                >
                  <span>View Gallery</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>

              {/* Flickday Attribution */}
              <p className="pt-8 font-accent text-sm text-zinc-600">
                Professional photography by{' '}
                <a
                  href="https://flickdaymedia.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-heat-jalapeno transition-colors"
                  aria-label="Flickday Media photography (opens in new tab)"
                >
                  Flickday Media
                </a>
              </p>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
