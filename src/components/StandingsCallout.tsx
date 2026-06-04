'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SeasonLeaderEntry } from '@/lib/rally-hq'

/**
 * Homepage callout that drives to /standings. Reads the same live leaderboard the
 * standings page does, so the top-3 teaser never diverges from the real board.
 * When the season has no scored results yet, it collapses to a clean copy + CTA.
 */
export function StandingsCallout() {
  const [leaders, setLeaders] = useState<SeasonLeaderEntry[]>([])

  useEffect(() => {
    fetch('/api/standings')
      .then((r) => r.json())
      .then((d) => setLeaders(Array.isArray(d.leaderboard) ? d.leaderboard.slice(0, 3) : []))
      .catch(() => setLeaders([]))
  }, [])

  const hasLeaders = leaders.length > 0

  return (
    <section
      id="standings-callout"
      aria-labelledby="standings-callout-heading"
      className="section-padding relative overflow-hidden"
    >
      <div className="section-container">
        <motion.div
          className="relative rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden p-8 sm:p-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
        >
          {/* Heat-spectrum accent bar */}
          <div
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-heat-bell via-heat-poblano to-heat-jalapeno"
            aria-hidden="true"
          />

          <div className={cn('grid gap-10', hasLeaders ? 'lg:grid-cols-2 lg:items-center' : 'max-w-2xl')}>
            {/* Copy + CTA */}
            <div>
              <p className="text-section-heading mb-4">The Points Race</p>
              <h2 id="standings-callout-heading" className="text-display mb-4">
                Who&apos;s On <span className="text-heat-poblano">Top</span>
              </h2>
              <p className="text-zinc-400 leading-relaxed mb-8 max-w-md">
                Every finish across the series is scored automatically. Track the season-long
                leaderboard, tournament results, and where your team stacks up.
              </p>
              <Link href="/standings" className="btn-primary" aria-label="View full Let's Pepper standings">
                <span>View Standings</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>

            {/* Live top-3 teaser — only when the board has results */}
            {hasLeaders && (
              <div className="space-y-2">
                {leaders.map((e) => {
                  const isLeader = e.rank === 1
                  return (
                    <div
                      key={e.name}
                      className="flex items-center gap-4 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-4 py-3"
                    >
                      <span
                        className="font-display text-2xl w-8 text-center text-zinc-500"
                        style={isLeader ? { color: 'var(--gold)' } : undefined}
                      >
                        {e.tied ? `T${e.rank}` : e.rank}
                      </span>
                      <span
                        className="flex-1 text-zinc-200"
                        style={isLeader ? { color: 'var(--gold)' } : undefined}
                      >
                        {e.name}
                      </span>
                      <span className="font-accent text-heat-jalapeno">{e.points} pts</span>
                    </div>
                  )
                })}
                <p className="font-accent text-[10px] uppercase tracking-wider text-zinc-600 pt-2 text-right">
                  Powered by Rally HQ
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
