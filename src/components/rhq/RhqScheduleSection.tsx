'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqScheduleMatch } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'

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

type Lens = 'court' | 'time' | 'team'

/**
 * Three-axis schedule lens. The prototype's toggle is decorative (it never
 * re-sorts); this one actually re-orders: by court, chronologically (match
 * number), or by team name. In-progress matches always float to the top so the
 * live state is never buried.
 */
function sortByLens(matches: RhqScheduleMatch[], lens: Lens): RhqScheduleMatch[] {
  const liveFirst = (a: RhqScheduleMatch, b: RhqScheduleMatch) =>
    Number(b.status === 'in_progress') - Number(a.status === 'in_progress')
  const num = (m: RhqScheduleMatch) => m.match_number ?? 0
  const arr = [...matches]
  if (lens === 'court') {
    return arr.sort(
      (a, b) =>
        liveFirst(a, b) ||
        String(a.court ?? '').localeCompare(String(b.court ?? ''), undefined, { numeric: true }) ||
        num(a) - num(b)
    )
  }
  if (lens === 'team') {
    return arr.sort(
      (a, b) =>
        liveFirst(a, b) ||
        String(a.team1_name ?? '').localeCompare(String(b.team1_name ?? '')) ||
        String(a.team2_name ?? '').localeCompare(String(b.team2_name ?? ''))
    )
  }
  return arr.sort((a, b) => liveFirst(a, b) || num(a) - num(b))
}

/** The match schedule — court, matchup, and status, with a By court/time/team lens. */
export function RhqScheduleSection({ slug, heat, pollMs }: Props) {
  const [lens, setLens] = useState<Lens>('court')
  const { data: schedule, failed } = useRhqModule<RhqScheduleMatch[]>(
    'schedule',
    slug,
    'schedule',
    pollMs
  )

  if (failed || schedule === null || schedule.length === 0) return null

  const matches = sortByLens(schedule, lens)

  return (
    <section className="section-padding bg-pepper-charcoal/30">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6 }}
        >
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
            <h2 className="block-heading">Schedule</h2>
            <div className="inline-flex rounded-lg border border-zinc-800 overflow-hidden" role="tablist" aria-label="Schedule lens">
              {(['court', 'time', 'team'] as Lens[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="tab"
                  aria-selected={lens === l}
                  onClick={() => setLens(l)}
                  className={cn(
                    'font-accent text-[0.62rem] font-bold uppercase tracking-[0.08em] px-3 py-1.5 transition-colors',
                    lens === l ? cn(heatBg[heat], 'text-pepper-black') : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  By {l}
                </button>
              ))}
            </div>
          </div>
          <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] mb-6">
            <span className={heatText[heat]}>live via Rally HQ</span>
          </p>

          <ul className="rounded-xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden">
            {matches.map((m) => {
              const live = m.status === 'in_progress'
              const done = m.status === 'complete'
              return (
                <li
                  key={m.id}
                  className={cn(
                    'grid grid-cols-[auto_1fr_auto] gap-3 items-center px-4 py-3 border-l-2 border-transparent',
                    done && 'opacity-50'
                  )}
                  style={
                    live
                      ? {
                          borderLeftColor: 'var(--live)',
                          background: 'linear-gradient(90deg, color-mix(in srgb, var(--live) 12%, transparent), transparent 55%)',
                        }
                      : undefined
                  }
                >
                  <span className="font-accent text-[0.64rem] font-bold uppercase tracking-wider text-zinc-400 border border-zinc-700 rounded-md px-2 py-1 whitespace-nowrap">
                    {m.court ? `Court ${m.court}` : `#${m.match_number ?? '—'}`}
                  </span>
                  <span className="text-white truncate">
                    <span className="font-semibold">{m.team1_name}</span>
                    <span className="text-zinc-600 font-accent text-xs px-2">vs</span>
                    <span className="font-semibold">{m.team2_name}</span>
                  </span>
                  <span
                    className={cn(
                      'font-accent text-[0.6rem] uppercase tracking-[0.08em] whitespace-nowrap',
                      !live && (done ? 'text-zinc-600' : 'text-zinc-400')
                    )}
                    style={live ? { color: 'var(--live)' } : undefined}
                  >
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
