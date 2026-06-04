'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqBracketRound, RhqBracketMatch } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'

interface Props {
  slug: string
  heat: Heat
}

function isWinner(match: RhqBracketMatch, teamId: string | null): boolean {
  return teamId !== null && match.winner_id === teamId
}

/**
 * The elimination bracket, by round. Returns null until pool play completes and
 * a bracket exists (RHQ returns an empty list pre-bracket).
 */
export function RhqBracketPreview({ slug, heat }: Props) {
  const { data: rounds, failed } = useRhqModule<RhqBracketRound[]>(
    'bracket',
    slug,
    'bracket'
  )

  if (failed || rounds === null || rounds.length === 0) return null

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
            <h2 className={cn('text-section-heading', heatText[heat])}>Bracket</h2>
            <span className="font-accent text-xs uppercase tracking-wider text-zinc-600">
              Powered by Rally HQ
            </span>
          </div>

          <div className="mt-8 grid gap-6 md:grid-flow-col md:auto-cols-fr overflow-x-auto">
            {rounds.map((round) => (
              <div key={round.round} className="min-w-[220px] space-y-4">
                <h3 className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  {round.round}
                </h3>
                {round.matches.map((m, i) => (
                  <div
                    key={`${round.round}-${i}`}
                    className="rounded-lg border border-zinc-800 overflow-hidden"
                  >
                    {[
                      { id: m.team1_id, name: m.team1_name },
                      { id: m.team2_id, name: m.team2_name },
                    ].map((side, s) => (
                      <div
                        key={s}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 text-sm',
                          s === 0 && 'border-b border-zinc-800',
                          isWinner(m, side.id) ? 'text-white font-semibold' : 'text-zinc-500'
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {isWinner(m, side.id) && (
                            <span
                              className={cn('h-1.5 w-1.5 rounded-full', heatBg[heat])}
                              aria-hidden="true"
                            />
                          )}
                          {side.name}
                        </span>
                        {m.score && (
                          <span className="font-accent text-xs text-zinc-500 tabular-nums">
                            {m.score.split('-')[s]}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
