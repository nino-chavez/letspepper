'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqTeam } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg, heatBorder } from './heat'
import { useRhqModule } from './useRhqModule'
import { HeatMeter } from './HeatMeter'

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
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <HeatMeter heat={heat} size="sm" />
              <h2 className={cn('text-section-heading', heatText[heat])}>The Field</h2>
            </div>
            <span className="font-accent text-xs uppercase tracking-[0.14em] text-zinc-600">
              {teams.length} teams · Powered by Rally HQ
            </span>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map(([pool, members]) => (
              <div
                key={pool}
                className={cn('rounded-xl border border-zinc-800 border-l-2 overflow-hidden', heatBorder[heat])}
              >
                {!single && (
                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                    <span className={cn('font-accent text-xs font-bold uppercase tracking-[0.14em]', heatText[heat])}>
                      Pool {pool}
                    </span>
                    <span className="font-accent text-[0.6rem] uppercase tracking-wider text-zinc-600">
                      {members.length} teams
                    </span>
                  </div>
                )}
                <ul className="divide-y divide-zinc-800">
                  {members.map((team) => (
                    <li
                      key={team.id}
                      className="grid grid-cols-[2ch_1fr_auto] gap-3 items-center px-4 py-2.5"
                    >
                      <span className="font-display text-lg leading-none text-zinc-600 tabular-nums">
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
