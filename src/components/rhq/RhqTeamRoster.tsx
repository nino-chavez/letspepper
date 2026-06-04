'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqTeam } from '@/lib/rhq-types'
import { type Heat, heatText } from './heat'
import { useRhqModule } from './useRhqModule'

interface Props {
  slug: string
  heat: Heat
}

/** Group teams by pool label; null/empty pool sorts last under "Unseeded". */
function groupByPool(teams: RhqTeam[]): [string, RhqTeam[]][] {
  const groups = new Map<string, RhqTeam[]>()
  for (const t of teams) {
    const key = t.pool ?? '—'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  for (const list of Array.from(groups.values())) {
    list.sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
}

/** The registered field, by pool — team names only, no captain identity. */
export function RhqTeamRoster({ slug, heat }: Props) {
  const { data: teams, failed } = useRhqModule<RhqTeam[]>('teams', slug, 'teams')

  if (failed || teams === null || teams.length === 0) return null

  const pools = groupByPool(teams)
  const single = pools.length === 1 && pools[0][0] === '—'

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
            <h2 className="block-heading">The Field</h2>
            <span className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500">
              {teams.length} teams · {pools.length} {pools.length === 1 ? 'pool' : 'pools'} ·{' '}
              <span className={heatText[heat]}>powered by Rally HQ</span>
            </span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {pools.map(([pool, members]) => (
              <div
                key={pool}
                className="rounded-xl border border-zinc-800 overflow-hidden"
              >
                {!single && (
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                    <span className={cn('font-accent text-xs font-bold uppercase tracking-[0.1em]', heatText[heat])}>
                      Pool {pool}
                    </span>
                  </div>
                )}
                <ul className="divide-y divide-zinc-800">
                  {members.map((team) => (
                    <li
                      key={team.id}
                      className="grid grid-cols-[1.8rem_1fr] gap-3 items-center px-4 py-2.5"
                    >
                      <span className="font-display text-xl leading-none text-zinc-500 tabular-nums">
                        {team.seed ?? '·'}
                      </span>
                      <span className="font-semibold text-white">{team.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
