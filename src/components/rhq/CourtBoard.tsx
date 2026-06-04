'use client'

import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqMatch } from '@/lib/rhq-types'
import { type Heat, heatText, heatBg } from './heat'
import { useRhqModule } from './useRhqModule'
import type { EventPhase } from './usePhase'

/**
 * Broadcast scorebug — the LPO signature live component. Dark-glass chassis, a
 * compartment per team, oversized tabular numerals. Scores render when present
 * (live/complete); pre-score it shows the matchup + court for "up next"
 * wayfinding. The leader/winner compartment lights up in the event heat.
 */
export function LiveScorebug({ match, heat }: { match: RhqMatch; heat: Heat }) {
  const live = match.status === 'in_progress'
  const done = match.status === 'complete'
  const hasScore = match.team1_score !== null && match.team2_score !== null
  const t1Lead = hasScore && (match.team1_score ?? 0) > (match.team2_score ?? 0)
  const t2Lead = hasScore && (match.team2_score ?? 0) > (match.team1_score ?? 0)

  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="font-accent text-[0.65rem] uppercase tracking-[0.12em] text-zinc-300">
          {match.court ? `Court ${match.court}` : `Match #${match.match_number ?? '—'}`}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 font-accent text-[0.6rem] uppercase tracking-[0.12em]',
            live ? heatText[heat] : done ? 'text-zinc-500' : 'text-zinc-400'
          )}
        >
          {live && <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', heatBg[heat])} aria-hidden="true" />}
          {live ? 'Live' : done ? 'Final' : 'Up Next'}
        </span>
      </div>

      {[
        { name: match.team1_name, score: match.team1_score, lead: t1Lead },
        { name: match.team2_name, score: match.team2_score, lead: t2Lead },
      ].map((row, i) => (
        <div
          key={i}
          className={cn(
            'flex items-center justify-between px-4 py-2.5',
            i === 1 && 'border-t border-zinc-800'
          )}
        >
          <span className={cn('font-semibold truncate', row.lead ? heatText[heat] : 'text-white')}>
            {row.name}
          </span>
          <span
            className={cn(
              'font-display text-2xl leading-none tabular-nums ml-3',
              row.lead ? heatText[heat] : hasScore ? 'text-white' : 'text-zinc-700'
            )}
          >
            {row.score ?? '·'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Lowest match_number first — the tournament's own ordering. */
function byMatchNumber(a: RhqMatch, b: RhqMatch): number {
  return (a.match_number ?? Infinity) - (b.match_number ?? Infinity)
}

/** Next upcoming match on each court (one card per court). */
function nextPerCourt(matches: RhqMatch[]): RhqMatch[] {
  const seen = new Set<string>()
  const out: RhqMatch[] = []
  for (const m of [...matches].filter((m) => m.status === 'scheduled').sort(byMatchNumber)) {
    const court = m.court ?? `#${m.match_number}`
    if (seen.has(court)) continue
    seen.add(court)
    out.push(m)
  }
  return out.sort((a, b) => (a.court ?? '').localeCompare(b.court ?? ''))
}

interface Props {
  slug: string
  heat: Heat
  phase: EventPhase
}

/**
 * The court board — a phase-aware glanceable strip of scorebugs. Live = the
 * in-progress matches ("Happening Now"). Pre = the next match on each court
 * ("Up Next"), the #1 courtside wayfinding question. Hidden post-event (the
 * recap owns that state). Scorebug-level updates would come from SSE/polling;
 * for now it reflects the load-time read.
 */
export function CourtBoard({ slug, heat, phase }: Props) {
  // Poll live scores every 60s while the event is live; static otherwise.
  const { data: matches, failed } = useRhqModule<RhqMatch[]>(
    'matches',
    slug,
    'matches',
    phase === 'live' ? 60_000 : undefined
  )

  if (phase === 'post' || failed || matches === null) return null

  const live = matches.filter((m) => m.status === 'in_progress').sort(byMatchNumber)
  const shown = phase === 'live' && live.length > 0 ? live : nextPerCourt(matches)
  if (shown.length === 0) return null

  const heading = phase === 'live' && live.length > 0 ? 'Happening Now' : 'Up Next'

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
            <h2 className="block-heading">{heading}</h2>
            <span className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500">
              By court · <span className={heatText[heat]}>powered by Rally HQ</span>
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {shown.map((m) => (
              <LiveScorebug key={m.id} match={m} heat={heat} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
