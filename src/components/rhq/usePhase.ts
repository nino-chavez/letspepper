'use client'

import { useEffect, useState } from 'react'
import type { RhqPool, RhqBracketRound } from '@/lib/rhq-types'

/**
 * The event lifecycle phase, derived from live Rally HQ data — the spine of the
 * "one page, three faces" event page. The same `/flavors/[slug]` surface renders
 * differently in each phase (field + countdown → live standings + scores →
 * champion + recap) instead of showing a static snapshot (or a grid of zeros).
 */
export type EventPhase = 'pre' | 'live' | 'post'

interface PhaseState {
  phase: EventPhase
  /** Champion team name once the bracket has resolved (post only). */
  champion: string | null
  /** False until the deriving reads resolve; hold the hero's default until then. */
  ready: boolean
}

/** Any pool team with a recorded result means play has started. */
function hasPlay(pools: RhqPool[]): boolean {
  return pools.some((p) => p.teams.some((t) => t.wins > 0 || t.losses > 0))
}

/**
 * Champion = the winner of the bracket's terminal round, but only when that
 * round is a single decided match (the final). A semifinal round with one match
 * still pending must not read as "post".
 */
function championOf(bracket: RhqBracketRound[]): string | null {
  if (bracket.length === 0) return null
  const finalRound = bracket[bracket.length - 1]
  if (finalRound.matches.length !== 1) return null
  return finalRound.matches[0].winner_name ?? null
}

/**
 * Derives the event phase client-side from RHQ's public pools + bracket reads
 * (the same `/api/rhq/*` routes the section components use). Phase is intentionally
 * NOT served by RHQ today; the canonical upgrade is an RHQ-exposed `phase`/`is_live`
 * summary field consumed here instead of re-derived — see
 * blueprint/research/rhq-lpo-design-direction.md.
 *
 * `override` forces a phase for preview/QA (the `?phase=` query param) without
 * faking data — it only changes which face renders, not the underlying reads.
 */
export function usePhase(slug: string, override?: EventPhase | null): PhaseState {
  const [state, setState] = useState<PhaseState>({ phase: 'pre', champion: null, ready: false })

  useEffect(() => {
    if (override) {
      setState((s) => ({ phase: override, champion: s.champion, ready: true }))
      return
    }
    let active = true
    Promise.all([
      fetch(`/api/rhq/pools?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : { pools: [] }))
        .then((d) => (d.pools ?? []) as RhqPool[])
        .catch(() => [] as RhqPool[]),
      fetch(`/api/rhq/bracket?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : { bracket: [] }))
        .then((d) => (d.bracket ?? []) as RhqBracketRound[])
        .catch(() => [] as RhqBracketRound[]),
    ]).then(([pools, bracket]) => {
      if (!active) return
      const champion = championOf(bracket)
      const phase: EventPhase = champion ? 'post' : hasPlay(pools) ? 'live' : 'pre'
      setState({ phase, champion, ready: true })
    })
    return () => {
      active = false
    }
  }, [slug, override])

  return state
}
