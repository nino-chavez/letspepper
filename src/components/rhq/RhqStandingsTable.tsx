'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqPool, RhqPoolTeam } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg, heatBorder } from './heat'
import { useRhqModule } from './useRhqModule'
import type { EventPhase } from './usePhase'

interface Props {
  /** RHQ tournament slug (supplied by the flavor page from its rhqSlug field). */
  slug: string
  heat: Heat
  /** Live = "Live Standings" + heat leader; post = "Final Standings" + gold champion. */
  phase?: EventPhase
  /** Set (e.g. 60000) to live-poll standings while the event is in progress. */
  pollMs?: number
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
export function RhqStandingsTable({ slug, heat, phase, pollMs }: Props) {
  const { data: pools, failed } = useRhqModule<RhqPool[]>('pools', slug, 'pools', pollMs)

  // Network/server error — stay silent rather than show a broken section.
  if (failed) return null

  const isPost = phase === 'post'
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
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
            <h2 className="block-heading">{isPost ? 'Final Standings' : 'Live Standings'}</h2>
            <span className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500">
              <span className={heatText[heat]}>powered by Rally HQ</span>
            </span>
          </div>

          {/* Loading skeleton */}
          {pools === null && (
            <div className="grid md:grid-cols-2 gap-4" aria-hidden="true">
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
            <div className="grid sm:grid-cols-2 gap-4">
              {pools!.map((pool) => (
                <div
                  key={pool.pool}
                  className="rounded-xl border border-zinc-800 overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                    <span className={cn('font-accent text-xs font-bold uppercase tracking-[0.1em]', heatText[heat])}>
                      Pool {pool.pool}
                    </span>
                    <span className="font-accent text-[0.55rem] uppercase tracking-wider text-zinc-600">W–L · Diff</span>
                  </div>
                  <div className="divide-y divide-zinc-800">
                    {rankTeams(pool.teams).map((team, i) => (
                      <div
                        key={team.team_id}
                        className={cn(
                          'grid grid-cols-[1.8rem_1fr_auto_3ch] gap-3 items-center px-4 py-2.5 border-l-2 border-transparent',
                          i === 0 && cn('bg-zinc-900/40', !isPost && heatBorder[heat])
                        )}
                        style={i === 0 && isPost ? { borderLeftColor: 'var(--gold)' } : undefined}
                      >
                        <span
                          className={cn(
                            'font-display text-xl leading-none tabular-nums',
                            i === 0 ? heatText[heat] : 'text-zinc-500'
                          )}
                          style={i === 0 && isPost ? { color: 'var(--gold)' } : undefined}
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
