'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqScheduleMatch } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'
import { HeatMeter } from './HeatMeter'

interface Props {
  slug: string
  heat: Heat
  /** Set (e.g. 60000) to live-poll the schedule while the event is in progress. */
  pollMs?: number
}

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Upcoming',
  in_progress: 'Live',
  complete: 'Final',
}

/** Upcoming + in-progress matches first, completed last; then by match number. */
function orderMatches(matches: RhqScheduleMatch[]): RhqScheduleMatch[] {
  const rank: Record<string, number> = { in_progress: 0, scheduled: 1, complete: 2 }
  return [...matches].sort(
    (a, b) =>
      (rank[a.status] ?? 1) - (rank[b.status] ?? 1) ||
      (a.match_number ?? 0) - (b.match_number ?? 0)
  )
}

/** The match schedule — court, matchup, and status, branded to the event heat. */
export function RhqScheduleSection({ slug, heat, pollMs }: Props) {
  const { data: schedule, failed } = useRhqModule<RhqScheduleMatch[]>(
    'schedule',
    slug,
    'schedule',
    pollMs
  )

  if (failed || schedule === null || schedule.length === 0) return null

  const matches = orderMatches(schedule)

  return (
    <section className="section-padding bg-pepper-charcoal/30">
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
              <h2 className={cn('text-section-heading', heatText[heat])}>Schedule</h2>
            </div>
            <span className="font-accent text-xs uppercase tracking-[0.14em] text-zinc-600">
              Powered by Rally HQ
            </span>
          </div>

          <ul className="mt-8 rounded-xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
            {matches.map((m) => {
              const live = m.status === 'in_progress'
              const done = m.status === 'complete'
              return (
                <li
                  key={m.id}
                  className={cn(
                    'grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-3 border-l-2 border-transparent',
                    live && cn('border-current', heatText[heat]),
                    done && 'opacity-55'
                  )}
                >
                  <span className="font-accent text-[0.65rem] uppercase tracking-wider text-zinc-300 border border-zinc-700 rounded-md px-2 py-1 whitespace-nowrap">
                    {m.court ? `Court ${m.court}` : `#${m.match_number ?? '—'}`}
                  </span>
                  <span className="text-white truncate">
                    <span className="font-semibold">{m.team1_name}</span>
                    <span className="text-zinc-600 font-accent text-xs px-2">vs</span>
                    <span className="font-semibold">{m.team2_name}</span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-accent text-[0.6rem] uppercase tracking-[0.12em] px-2.5 py-1 rounded-full border whitespace-nowrap',
                      live
                        ? cn(heatText[heat], 'border-current')
                        : done
                          ? 'text-zinc-600 border-zinc-800'
                          : 'text-zinc-400 border-zinc-700'
                    )}
                  >
                    {live && (
                      <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', heatBg[heat])} aria-hidden="true" />
                    )}
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </li>
              )
            })}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}
