'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { CommunityEntry } from '@/lib/rally-hq'

const TOP_N = 10

/**
 * The unified community board — the read side of the engagement loop. Champion
 * picks + bingo/award-vote points, one row per cross-surface fan, ranked. This
 * is what the site's prediction/bingo/vote writes have been feeding all along;
 * it just wasn't readable until Rally HQ exposed GET /events/:slug/community.
 */
export function CommunityBoard() {
  const [entries, setEntries] = useState<CommunityEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/community')
      .then((r) => r.json())
      .then((d) => setEntries(Array.isArray(d.leaderboard) ? d.leaderboard : []))
      .catch(() => setEntries([]))
      .finally(() => setLoaded(true))
  }, [])

  // No fan has earned a point yet — don't render an empty shell.
  if (loaded && entries.length === 0) return null

  const shown = showAll ? entries : entries.slice(0, TOP_N)

  return (
    <section className="section-padding pt-0">
      <div className="section-container">
        <motion.div
          className="bg-zinc-900/30 rounded-xl border border-zinc-800 overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-start justify-between gap-4 p-6 border-b border-zinc-800/50">
            <div>
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-1">
                Fan standings
              </p>
              <h2 className="block-heading">Community Board</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Champion picks, bingo points, and award votes all count on this board.
              </p>
            </div>
            <span className="flex-shrink-0 font-accent text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-700/60 rounded-full px-2 py-1">
              Powered by Rally HQ
            </span>
          </div>

          {!loaded ? (
            <p className="p-6 text-zinc-600 text-sm font-accent uppercase tracking-wider">Loading…</p>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {shown.map((e) => {
                const lead = e.rank === 1
                return (
                  <li
                    key={`${e.rank}-${e.name}`}
                    className="grid grid-cols-[2.5rem_1fr_auto] gap-3 items-center px-6 py-3"
                  >
                    <span
                      className={cn('font-display text-lg leading-none tabular-nums', !lead && 'text-zinc-500')}
                      style={lead ? { color: 'var(--gold)' } : undefined}
                    >
                      {e.tied ? `T${e.rank}` : e.rank}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block font-semibold truncate', lead ? '' : 'text-white')} style={lead ? { color: 'var(--gold)' } : undefined}>
                        {e.name}
                      </span>
                      <span className="block font-accent text-[0.6rem] uppercase tracking-wider text-zinc-600">
                        {e.predictionPoints > 0 && `${e.predictionPoints} from picks`}
                        {e.predictionPoints > 0 && e.ledgerPoints > 0 && ' · '}
                        {e.ledgerPoints > 0 && `${e.ledgerPoints} from play`}
                        {e.picks > 0 && ` · ${e.correct}/${e.picks} called`}
                      </span>
                    </span>
                    <span className="font-accent text-sm tabular-nums text-zinc-300">
                      {e.points} <span className="text-zinc-600 text-xs">pts</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {loaded && entries.length > TOP_N && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="w-full px-6 py-3 border-t border-zinc-800/60 font-accent text-[0.65rem] uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showAll ? 'Show less' : `Show all ${entries.length}`}
            </button>
          )}
        </motion.div>
      </div>
    </section>
  )
}
