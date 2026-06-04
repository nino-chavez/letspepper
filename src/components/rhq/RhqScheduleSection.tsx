'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqScheduleMatch } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'

interface Props {
  slug: string
  heat: Heat
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
export function RhqScheduleSection({ slug, heat }: Props) {
  const { data: schedule, failed } = useRhqModule<RhqScheduleMatch[]>(
    'schedule',
    slug,
    'schedule'
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
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className={cn('text-section-heading', heatText[heat])}>Schedule</h2>
            <span className="font-accent text-xs uppercase tracking-wider text-zinc-600">
              Powered by Rally HQ
            </span>
          </div>

          <ul className="mt-8 rounded-xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
            {matches.map((m) => (
              <li
                key={m.id}
                className="grid grid-cols-[auto_1fr_auto] gap-4 items-center px-4 py-3"
              >
                <span className="font-accent text-xs text-zinc-500 w-16">
                  {m.court ? `Court ${m.court}` : `#${m.match_number ?? '—'}`}
                </span>
                <span className="text-white">
                  <span className="font-semibold">{m.team1_name}</span>
                  <span className="text-zinc-600 px-2">vs</span>
                  <span className="font-semibold">{m.team2_name}</span>
                </span>
                <span
                  className={cn(
                    'font-accent text-xs uppercase tracking-wider',
                    m.status === 'in_progress'
                      ? heatText[heat]
                      : m.status === 'complete'
                        ? 'text-zinc-600'
                        : 'text-zinc-400'
                  )}
                >
                  {m.status === 'in_progress' && (
                    <span
                      className={cn('inline-block h-2 w-2 rounded-full mr-1.5', heatBg[heat])}
                      aria-hidden="true"
                    />
                  )}
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  )
}
