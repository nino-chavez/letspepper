'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SeasonLeaderEntry } from '@/lib/rally-hq'

type Row = SeasonLeaderEntry & { og?: boolean }
type SortKey = 'points' | 'events' | 'titles' | 'podiums'

const TOP_N = 10

// Sortable stat columns — each is a "board" (Pts = points race, Events = iron,
// Titles = dynasty, Podiums = consistency).
const COLS: { k: SortKey; label: string; cls: string }[] = [
  { k: 'points', label: 'Pts', cls: '' },
  { k: 'events', label: 'Events', cls: 'hidden sm:table-cell' },
  { k: 'titles', label: 'Titles', cls: 'hidden sm:table-cell' },
  { k: 'podiums', label: 'Podiums', cls: 'hidden md:table-cell' },
]

const SORT_META: Record<SortKey, { title: string; sub: (allTime: boolean) => string }> = {
  points: { title: 'Points Race', sub: (a) => a ? 'Every finish since 2025 — show up, climb the board.' : 'Every finish this season, scored automatically. Ties share a rank.' },
  events: { title: 'Iron Board', sub: () => 'Most events played — the crew that never misses.' },
  titles: { title: 'Most Titles', sub: () => 'Tournament wins across the series.' },
  podiums: { title: 'Podium Count', sub: () => 'Top-3 finishes — the consistency board.' },
}

/** Re-sort + re-rank client-side for the chosen column (ties share a rank). */
function sortAndRank(rows: Row[], key: SortKey): Row[] {
  const sorted = [...rows].sort((a, b) =>
    (b[key] as number) - (a[key] as number) || b.points - a.points || a.bestFinish - b.bestFinish)
  const counts: Record<number, number> = {}
  let rank = 0, prev: string | null = null
  const ranked = sorted.map((e, i) => {
    const tieKey = `${e[key]}:${key === 'points' ? e.bestFinish : e.points}`
    if (tieKey !== prev) { rank = i + 1; prev = tieKey }
    counts[rank] = (counts[rank] ?? 0) + 1
    return { ...e, rank }
  })
  return ranked.map((e) => ({ ...e, tied: counts[e.rank] > 1 }))
}

export function SeasonLeaderboard() {
  const [season, setSeason] = useState<Row[]>([])
  const [allTime, setAllTime] = useState<Row[]>([])
  const [scope, setScope] = useState<'season' | 'all'>('season')
  const [sortKey, setSortKey] = useState<SortKey>('points')
  const [meta, setMeta] = useState<{ seasons: number; events: number }>({ seasons: 0, events: 0 })
  const [loaded, setLoaded] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/standings')
      .then((r) => r.json())
      .then((d) => {
        setSeason(Array.isArray(d.leaderboard) ? d.leaderboard : [])
        setAllTime(Array.isArray(d.allTime) ? d.allTime : [])
        setMeta({ seasons: Number(d.seasons) || 0, events: Number(d.events) || 0 })
      })
      .catch(() => { setSeason([]); setAllTime([]) })
      .finally(() => setLoaded(true))
  }, [])

  const isAll = scope === 'all'
  const ranked = sortAndRank(isAll ? allTime : season, sortKey)
  const allTimeLeaders = sortAndRank(allTime, 'points').filter((e) => e.rank === 1).map((e) => e.name).join(' & ')
  const eyebrow = isAll ? 'All-Time Series' : 'Season Leaderboard'
  const { title, sub } = { title: SORT_META[sortKey].title, sub: SORT_META[sortKey].sub(isAll) }

  // Nothing to show until a result is scored — don't render an empty shell.
  if (loaded && season.length === 0 && allTime.length === 0) return null

  const rows = showAll ? ranked : ranked.slice(0, TOP_N)

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
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-1">{eyebrow}</p>
              <h2 className="block-heading">{title}</h2>
              <p className="text-sm text-zinc-500 mt-1">{sub}</p>
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

          {isAll && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-3 border-b border-zinc-800/50 font-accent text-[11px] uppercase tracking-wider text-zinc-500">
              <span><b className="text-zinc-300">{meta.seasons}</b> seasons</span>
              <span><b className="text-zinc-300">{meta.events}</b> events</span>
              <span><b className="text-zinc-300">{allTime.length}</b> players</span>
              {allTimeLeaders && (
                <span>All-time leaders: <b style={{ color: 'var(--gold)' }}>{allTimeLeaders}</b></span>
              )}
            </div>
          )}

          {!loaded ? (
            <p className="p-6 text-zinc-600 text-sm font-accent uppercase tracking-wider">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left font-accent text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/50">
                    <th className="px-4 py-3 w-12">#</th>
                    <th className="px-4 py-3">Player</th>
                    {COLS.map((c) => (
                      <th key={c.k} className={cn('px-4 py-3 text-right', c.cls)}>
                        <button
                          type="button"
                          aria-pressed={sortKey === c.k}
                          onClick={() => { setSortKey(c.k); setShowAll(false) }}
                          className={cn(
                            'inline-flex items-center gap-1 uppercase tracking-wider transition-colors',
                            sortKey === c.k ? 'text-zinc-100' : 'hover:text-zinc-300',
                          )}
                        >
                          {c.label}{sortKey === c.k && <span aria-hidden="true">↓</span>}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => {
                    const isLeader = e.rank === 1
                    return (
                      <tr
                        key={`${e.name}-${i}`}
                        className="border-b border-zinc-800/30 last:border-0 hover:bg-zinc-800/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span
                            className={cn('font-display text-lg', e.rank === 2 ? 'text-zinc-300' : e.rank >= 3 ? 'text-zinc-600' : '')}
                            style={isLeader ? { color: 'var(--gold)' } : undefined}
                          >
                            {e.tied ? `T${e.rank}` : e.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-200" style={isLeader ? { color: 'var(--gold)' } : undefined}>
                          {e.name}
                          {e.og && (
                            <span
                              className="ml-2 align-middle inline-block px-1.5 py-0.5 rounded text-[9px] font-accent uppercase tracking-wider bg-zinc-800 text-zinc-400 border border-zinc-700/60"
                              title="Played in the founding season"
                            >
                              OG
                            </span>
                          )}
                        </td>
                        <td className={cn('px-4 py-3 text-right font-accent text-heat-jalapeno', sortKey === 'points' && 'font-bold')}>{e.points}</td>
                        <td className={cn('px-4 py-3 text-right hidden sm:table-cell', sortKey === 'events' ? 'text-zinc-100' : 'text-zinc-400')}>{e.events}</td>
                        <td className={cn('px-4 py-3 text-right hidden sm:table-cell', sortKey === 'titles' ? 'text-zinc-100' : 'text-zinc-400')}>{e.titles}</td>
                        <td className={cn('px-4 py-3 text-right hidden md:table-cell', sortKey === 'podiums' ? 'text-zinc-100' : 'text-zinc-400')}>{e.podiums}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {ranked.length > TOP_N && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full px-4 py-3 border-t border-zinc-800/50 font-accent text-xs uppercase tracking-wider text-zinc-400 hover:text-white hover:bg-zinc-800/20 transition-colors"
                >
                  {showAll ? 'Show top 10' : `Show all ${ranked.length}`}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
