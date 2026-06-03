'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqPool, RhqPoolTeam } from '@/lib/types/rhq'

type Heat = 'bell' | 'poblano' | 'jalapeno'

const heatText: Record<Heat, string> = {
  bell: 'text-heat-bell',
  poblano: 'text-heat-poblano',
  jalapeno: 'text-heat-jalapeno',
}
const heatBg: Record<Heat, string> = {
  bell: 'bg-heat-bell',
  poblano: 'bg-heat-poblano',
  jalapeno: 'bg-heat-jalapeno',
}

interface Props {
  /** LP flavor slug (/flavors/[slug]) — mapped to an RHQ tournament server-side. */
  flavor: string
  heat: Heat
}

/** Rank within a pool: most wins, then best point differential. */
function rankTeams(teams: RhqPoolTeam[]): RhqPoolTeam[] {
  return [...teams].sort((a, b) => b.wins - a.wins || b.point_diff - a.point_diff)
}

/**
 * Live pool standings from Rally HQ, rendered in Let's Pepper's own brand.
 * Branded server-fetch: this client component calls LP's /api/rhq/pools handler,
 * which holds any key and proxies RHQ's public API — the key never reaches here.
 */
export function RhqStandingsTable({ flavor, heat }: Props) {
  const [pools, setPools] = useState<RhqPool[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setPools(null)
    setFailed(false)
    fetch(`/api/rhq/pools?flavor=${encodeURIComponent(flavor)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        if (active) setPools((d.pools ?? []) as RhqPool[])
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [flavor])

  // Network/server error — stay silent rather than show a broken section.
  if (failed) return null

  const hasStandings = pools !== null && pools.length > 0

  return (
    <section className="section-padding bg-pepper-charcoal/30">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className={cn('text-section-heading', heatText[heat])}>Live Standings</h2>
            <span className="font-accent text-xs uppercase tracking-wider text-zinc-600">
              Powered by Rally HQ
            </span>
          </div>

          {/* Loading skeleton */}
          {pools === null && (
            <div className="mt-8 grid md:grid-cols-2 gap-6" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-zinc-800 overflow-hidden">
                  <div className={cn('h-8', heatBg[heat], 'opacity-40')} />
                  <div className="divide-y divide-zinc-800">
                    {[0, 1, 2].map((j) => (
                      <div key={j} className="h-12 bg-zinc-900/40 animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pre-tournament empty state */}
          {pools !== null && pools.length === 0 && (
            <p className="mt-6 text-lg text-zinc-500">
              Pools are set when the tournament begins. Standings appear here live as
              matches are scored.
            </p>
          )}

          {/* Standings */}
          {hasStandings && (
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              {pools!.map((pool) => (
                <div
                  key={pool.pool}
                  className="rounded-xl border border-zinc-800 overflow-hidden"
                >
                  <div
                    className={cn(
                      'px-4 py-1.5 font-accent text-xs font-bold uppercase tracking-wider text-pepper-charcoal',
                      heatBg[heat]
                    )}
                  >
                    Pool {pool.pool}
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {rankTeams(pool.teams).map((team, i) => (
                      <div
                        key={team.team_id}
                        className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-3 items-center px-4 py-2.5"
                      >
                        <span className="font-accent text-xs text-zinc-600">{i + 1}</span>
                        <span className="font-semibold text-white">{team.team_name}</span>
                        <span className="font-accent text-xs text-zinc-400 tabular-nums">
                          {team.wins}–{team.losses}
                        </span>
                        <span
                          className={cn(
                            'font-accent text-xs tabular-nums',
                            team.point_diff > 0
                              ? heatText[heat]
                              : team.point_diff < 0
                                ? 'text-zinc-600'
                                : 'text-zinc-500'
                          )}
                        >
                          {team.point_diff > 0 ? '+' : ''}
                          {team.point_diff}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
