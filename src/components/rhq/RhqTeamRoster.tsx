'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqTeam } from '@/lib/types/rhq'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'

interface Props {
  flavor: string
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
export function RhqTeamRoster({ flavor, heat }: Props) {
  const { data: teams, failed } = useRhqModule<RhqTeam[]>('teams', flavor, 'teams')

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
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className={cn('text-section-heading', heatText[heat])}>The Field</h2>
            <span className="font-accent text-xs uppercase tracking-wider text-zinc-600">
              {teams.length} teams · Powered by Rally HQ
            </span>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map(([pool, members]) => (
              <div key={pool} className="rounded-xl border border-zinc-800 overflow-hidden">
                {!single && (
                  <div
                    className={cn(
                      'px-4 py-1.5 font-accent text-xs font-bold uppercase tracking-wider text-pepper-charcoal',
                      heatBg[heat]
                    )}
                  >
                    Pool {pool}
                  </div>
                )}
                <ul className="divide-y divide-zinc-800">
                  {members.map((team) => (
                    <li
                      key={team.id}
                      className="grid grid-cols-[1.5rem_1fr_auto] gap-3 items-center px-4 py-2.5"
                    >
                      <span className="font-accent text-xs text-zinc-600">
                        {team.seed ?? '·'}
                      </span>
                      <span className="font-semibold text-white">{team.name}</span>
                      {team.status === 'checked_in' && (
                        <span
                          className={cn('h-2 w-2 rounded-full', heatBg[heat])}
                          title="Checked in"
                          aria-label="Checked in"
                        />
                      )}
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
