'use client'

import { useEffect, useState } from 'react'
import type { RhqSummary } from '@/lib/rhq-types'

/**
 * The event lifecycle phase, derived from Rally HQ's canonical summary — the
 * spine of the "one page, three faces" event page. The same `/flavors/[slug]`
 * surface renders differently in each phase (field + countdown → live standings
 * + scores → champion + recap) instead of a static snapshot or a grid of zeros.
 */
export type EventPhase = 'pre' | 'live' | 'post'

interface PhaseState {
  phase: EventPhase
  /** Champion team name once the bracket has resolved (post only). */
  champion: string | null
  /** RHQ's own phase label (e.g. "Pool Play", "Bracket") — drives the live pill. */
  currentPhase: string | null
  /** False until the summary read resolves; hold the hero's default until then. */
  ready: boolean
}

/** How often to re-check the phase so the page transitions without a reload. */
const POLL_MS = 60_000

/**
 * Champion = the winner of the bracket's terminal round, but only when that
 * round is a single decided match (the final). A semifinal round with one match
 * still pending must not read as "post".
 */
function championOf(summary: RhqSummary): string | null {
  const rounds = summary.bracket_results
  if (rounds.length === 0) return null
  const finalRound = rounds[rounds.length - 1]
  if (finalRound.matches.length !== 1) return null
  return finalRound.matches[0].winner ?? null
}

/**
 * Derives the event phase from RHQ's canonical `/summary` read — `is_live` is the
 * authoritative live signal (not re-derived from scores), and the champion comes
 * from `bracket_results`. Polls every 60s so the page auto-advances pre → live →
 * post during the event without a reload (the polling fallback for the Headless-
 * tier SSE stream). See blueprint/research/rhq-lpo-design-direction.md.
 *
 * `override` forces a phase for preview/QA (the `?phase=` query param) without
 * faking data — it only changes which face renders, and pauses polling.
 */
export function usePhase(slug: string, override?: EventPhase | null): PhaseState {
  const [state, setState] = useState<PhaseState>({ phase: 'pre', champion: null, currentPhase: null, ready: false })

  useEffect(() => {
    if (override) {
      setState((s) => ({ phase: override, champion: s.champion, currentPhase: s.currentPhase, ready: true }))
      return
    }
    let active = true

    const load = () =>
      fetch(`/api/rhq/summary?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : { summary: null }))
        .then((d) => {
          if (!active) return
          const summary = d.summary as RhqSummary | null
          if (!summary) {
            setState({ phase: 'pre', champion: null, currentPhase: null, ready: true })
            return
          }
          const champion = championOf(summary)
          const phase: EventPhase = champion ? 'post' : summary.is_live ? 'live' : 'pre'
          setState({ phase, champion, currentPhase: summary.current_phase ?? null, ready: true })
        })
        .catch(() => {
          if (active) setState((s) => ({ ...s, ready: true }))
        })

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [slug, override])

  return state
}
