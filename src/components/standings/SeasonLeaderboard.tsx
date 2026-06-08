'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SeasonLeaderEntry } from '@/lib/rally-hq'

const TREND_GLYPH: Record<SeasonLeaderEntry['trend'], { mark: string; cls: string }> = {
  up: { mark: '▲', cls: 'text-zinc-400' },
  down: { mark: '▼', cls: 'text-zinc-600' },
  steady: { mark: '–', cls: 'text-zinc-600' },
  new: { mark: '•', cls: 'text-zinc-500' },
}

const TOP_N = 10

export function SeasonLeaderboard() {
  const [season, setSeason] = useState<SeasonLeaderEntry[]>([])
  const [allTime, setAllTime] = useState<SeasonLeaderEntry[]>([])
  const [scope, setScope] = useState<'season' | 'all'>('season')
  const [loaded, setLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/standings')
      .then((r) => r.json())
      .then((d) => {
        setSeason(Array.isArray(d.leaderboard) ? d.leaderboard : [])
        setAllTime(Array.isArray(d.allTime) ? d.allTime : [])
      })
      .catch(() => { setSeason([]); setAllTime([]) })
      .finally(() => setLoaded(true))
  }, [])

  const entries = scope === 'all' ? allTime : season
  const copy = scope === 'all'
    ? { eyebrow: 'All-Time Series', title: 'Career Points', sub: 'Every finish since 2025 — show up, climb the board.' }
    : { eyebrow: 'Season Leaderboard', title: 'Points Race', sub: 'Every finish this season, scored automatically. Ties share a rank.' }

  // Nothing to show until a result is scored — don't render an empty shell.
  if (loaded && season.length === 0 && allTime.length === 0) return null

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
          <div className="flex flex-wrap items-start justify-between gap-4 p-6 border-b border-zinc-800/50">
            <div>
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-1">
                {copy.eyebrow}
              </p>
              <h2 className="block-heading">{copy.title}</h2>
              <p className="text-sm text-zinc-500 mt-1">{copy.sub}</p>
            </div>
            <div
              className="flex-shrink-0 inline-flex rounded-full border border-zinc-700/60 p-0.5 font-accent text-[10px] uppercase tracking-wider"
              role="tablist"
              aria-label="Leaderboard scope"
            >
              {([['season', 'This Season'], ['all', 'All-Time']] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={scope === k}
                  onClick={() => { setScope(k); setShowAll(false) }}
                  className={cn(
                    'px-3 py-1 rounded-full transition-colors',
                    scope === k ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-400 hover:text-white',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {!loaded ? (
            <p className="p-6 text-zinc-600 text-sm font-accent uppercase tracking-wider">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-accent text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/50">
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3 text-right">Pts</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Events</th>
                    <th className="px-4 py-3 text-right hidden sm:table-cell">Titles</th>
                    <th className="px-4 py-3 text-right hidden md:table-cell">Podiums</th>
                    <th className="px-4 py-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? entries : entries.slice(0, TOP_N)).map((e, i) => {
                    const trend = TREND_GLYPH[e.trend]
                    const isLeader = e.rank === 1
                    return (
                      <tr
                        key={`${e.name}-${i}`}
                        className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'font-display text-lg',
                              e.rank === 2 ? 'text-zinc-300' : e.rank >= 3 ? 'text-zinc-600' : '',
                            )}
                            style={isLeader ? { color: 'var(--gold)' } : undefined}
                          >
                            {e.tied ? `T${e.rank}` : e.rank}
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-zinc-200"
                          style={isLeader ? { color: 'var(--gold)' } : undefined}
                        >
                          {e.name}
                        </td>
                        <td className="px-4 py-3 text-right font-accent text-heat-jalapeno">{e.points}</td>
                        <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">{e.events}</td>
                        <td className="px-4 py-3 text-right text-zinc-400 hidden sm:table-cell">{e.titles}</td>
                        <td className="px-4 py-3 text-right text-zinc-400 hidden md:table-cell">{e.podiums}</td>
                        <td className={cn('px-4 py-3 text-center', trend.cls)} title={e.trend}>
                          {trend.mark}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {entries.length > TOP_N && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full px-4 py-3 border-t border-zinc-800/50 font-accent text-xs uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800/20 transition-colors"
                >
                  {showAll ? 'Show top 10' : `Show all ${entries.length}`}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
