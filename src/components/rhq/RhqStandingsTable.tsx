'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqPool, RhqPoolTeam } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg, heatBorder } from './heat'
import { useRhqModule } from './useRhqModule'
import { HeatMeter } from './HeatMeter'

interface Props {
  /** RHQ tournament slug (supplied by the flavor page from its rhqSlug field). */
  slug: string
  heat: Heat
}

/** Rank within a pool: most wins, then best point differential. */
function rankTeams(teams: RhqPoolTeam[]): RhqPoolTeam[] {
  return [...teams].sort((a, b) => b.wins - a.wins || b.point_diff - a.point_diff)
}

/**
 * Live pool standings from Rally HQ, rendered in Let's Pepper's own brand.
 * Branded server-fetch: the useRhqModule hook calls LP's /api/rhq/pools handler,
 * which proxies RHQ's public API server-side — the key never reaches the browser.
 */
export function RhqStandingsTable({ slug, heat }: Props) {
  const { data: pools, failed } = useRhqModule<RhqPool[]>('pools', slug, 'pools')

  // Network/server error — stay silent rather than show a broken section.
  if (failed) return null

  const hasStandings = pools !== null && pools.length > 0

  return (
    <section className="section-padding">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <HeatMeter heat={heat} size="sm" />
              <h2 className={cn('text-section-heading', heatText[heat])}>Live Standings</h2>
            </div>
            <span className="font-accent text-xs uppercase tracking-[0.14em] text-zinc-600">
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
                  className={cn('rounded-xl border border-zinc-800 border-l-2 overflow-hidden', heatBorder[heat])}
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                    <span className={cn('font-accent text-xs font-bold uppercase tracking-[0.14em]', heatText[heat])}>
                      Pool {pool.pool}
                    </span>
                    <span className="font-accent text-[0.55rem] uppercase tracking-wider text-zinc-600">W–L · Diff</span>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {rankTeams(pool.teams).map((team, i) => (
                      <div
                        key={team.team_id}
                        className={cn(
                          'grid grid-cols-[2ch_1fr_auto_3ch] gap-3 items-center px-4 py-2.5',
                          i === 0 && 'bg-zinc-900/40'
                        )}
                      >
                        <span
                          className={cn(
                            'font-display text-lg leading-none tabular-nums',
                            i === 0 ? heatText[heat] : 'text-zinc-600'
                          )}
                        >
                          {i + 1}
                        </span>
                        <span className="font-semibold text-white truncate">{team.team_name}</span>
                        <span className="font-accent text-xs text-zinc-400 tabular-nums">
                          {team.wins}–{team.losses}
                        </span>
                        <span
                          className={cn(
                            'font-accent text-xs tabular-nums text-right',
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
