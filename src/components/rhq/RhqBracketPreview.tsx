'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqBracketRound, RhqBracketMatch } from '@/lib/rhq-types'
import { type Heat, heatText } from './heat'
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
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
            <h2 className="block-heading">Championship Bracket</h2>
            <span className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500">
              Champion path highlighted · <span className={heatText[heat]}>Rally HQ</span>
            </span>
          </div>

          <div className="grid gap-6 md:grid-flow-col md:auto-cols-fr overflow-x-auto">
            {rounds.map((round) => {
              // Victory rounds light the winner gold (prototype .br-champ); earlier rounds use the heat accent.
              const goldRound = /final|champ/i.test(round.round)
              return (
              <div key={round.round} className="min-w-[220px] space-y-4">
                <h3 className="font-accent text-[0.6rem] uppercase tracking-[0.12em] text-zinc-500">
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
                    ].map((side, s) => {
                      const win = isWinner(m, side.id)
                      return (
                      <div
                        key={s}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 text-sm',
                          s === 0 && 'border-b border-zinc-800',
                          win ? cn(!goldRound && heatText[heat], 'font-bold') : 'text-zinc-400'
                        )}
                        style={win && goldRound ? { color: 'var(--gold)' } : undefined}
                      >
                        <span>{side.name}</span>
                        {m.score && (
                          <span className="font-accent text-xs text-zinc-500 tabular-nums">
                            {m.score.split('-')[s]}
                          </span>
                        )}
                      </div>
                      )
                    })}
                  </div>
                ))}
              </div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
