'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { powerRankings, SEASON_STATS } from '@/lib/rankings-data'
import { PowerRankingCard } from '@/components/rankings/PowerRankingCard'
import { HeadToHead } from '@/components/rankings/HeadToHead'

export default function RankingsPage() {
  // Power Rankings are editorial (the Scoville ranking + blurbs are the brand's
  // voice). Only the factual "events completed" derives from Rally HQ's resolved
  // tournaments so it can't go stale; the rest stays hand-authored.
  const [eventsCompleted, setEventsCompleted] = useState(SEASON_STATS.eventsCompleted)

  useEffect(() => {
    fetch('/api/standings-results')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.results) && d.results.length > 0) setEventsCompleted(d.results.length)
      })
      .catch(() => {})
  }, [])

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-3xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <h2 className="block-heading mb-4">Power Rankings</h2>
              <h1 className="text-display mb-6">
                Scoville <span style={{ color: 'var(--gold)' }}>Rankings</span>
              </h1>
              <p className="text-xl text-zinc-400">
                The definitive power rankings for the Let&apos;s Pepper series. Rated on the Scoville scale — how much heat are you bringing?
              </p>
            </motion.div>
          </div>
        </section>

        {/* Season Stats Row */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="grid sm:grid-cols-3 gap-6 mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl text-heat-jalapeno mb-1">
                  {SEASON_STATS.totalPointsAwarded}
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Total Points Awarded
                </p>
              </div>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl text-white mb-1">
                  {eventsCompleted}
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Events Completed
                </p>
              </div>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl mb-1" style={{ color: 'var(--gold)' }}>
                  {SEASON_STATS.teamsRanked}
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Teams Ranked
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Rankings List */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="space-y-4"
              initial="initial"
              animate="animate"
              transition={{ staggerChildren: 0.1 }}
            >
              {powerRankings.map((ranking) => (
                <PowerRankingCard key={ranking.rank} ranking={ranking} />
              ))}
            </motion.div>
          </div>
        </section>

        {/* Head-to-Head Section */}
        <section className="section-padding bg-pepper-charcoal/30">
          <div className="section-container">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <h2 className="block-heading mb-4">Compare</h2>
              <p className="text-display">
                Head-to-<span className="text-heat-jalapeno">Head</span>
              </p>
              <p className="text-lg text-zinc-400 mt-4 max-w-xl mx-auto">
                Pick two teams and compare their season stats side by side.
              </p>
            </motion.div>

            <div className="max-w-2xl mx-auto">
              <HeadToHead />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
