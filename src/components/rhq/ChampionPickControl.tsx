'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { RhqTeam } from '@/lib/types/rhq'
import { type Heat, heatText, heatBg, heatBorder } from './heat'
import { useRhqModule } from './useRhqModule'
import { ensureFanToken, awardEngagementPoints } from './fanToken'

interface Props {
  flavor: string
  heat: Heat
}

type SubmitState = 'idle' | 'submitting' | 'error'

/**
 * Spectator champion prediction. Picks write to RHQ's anonymous fan_token
 * (issued + stored client-side), upserting until the bracket is set. The API
 * key stays in the LP /api/rhq/{fan,predict} route handlers — never the browser.
 */
export function ChampionPickControl({ flavor, heat }: Props) {
  const { data: teams, failed } = useRhqModule<RhqTeam[]>('teams', flavor, 'teams')
  const [pick, setPick] = useState<string | null>(null)
  const [submit, setSubmit] = useState<SubmitState>('idle')

  // Restore a prior pick for this flavor.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setPick(window.localStorage.getItem(`rhq_pick_${flavor}`))
  }, [flavor])

  async function choose(team: RhqTeam) {
    if (submit === 'submitting') return
    setSubmit('submitting')
    try {
      const fanToken = await ensureFanToken()
      const res = await fetch('/api/rhq/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flavor, fanToken, predictedTeamId: team.id }),
      })
      if (!res.ok) throw new Error(`predict failed (${res.status})`)
      window.localStorage.setItem(`rhq_pick_${flavor}`, team.id)
      setPick(team.id)
      setSubmit('idle')
      // Participation reward into the unified RHQ engagement ledger. Idempotent
      // on (fan, source, ref=flavor) — changing the pick doesn't re-award.
      awardEngagementPoints('champion_pick', flavor)
    } catch {
      setSubmit('error')
    }
  }

  // No field yet, or reads failed — nothing to predict against.
  if (failed || teams === null || teams.length === 0) return null

  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name))
  const pickedTeam = sorted.find((t) => t.id === pick)

  return (
    <section className="section-padding bg-pepper-charcoal/30">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6 }}
          className={cn('rounded-2xl border p-6 sm:p-8', heatBorder[heat])}
        >
          <h2 className={cn('text-section-heading', heatText[heat])}>Call Your Shot</h2>
          <p className="mt-2 text-zinc-400">
            {pickedTeam
              ? 'Change your pick anytime until the bracket is set.'
              : 'Who takes the title? Pick the champion — no account needed.'}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {sorted.map((team) => {
              const isPick = team.id === pick
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => choose(team)}
                  disabled={submit === 'submitting'}
                  aria-pressed={isPick}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-semibold transition-colors border disabled:opacity-50',
                    isPick
                      ? cn(heatBg[heat], 'text-pepper-charcoal border-transparent')
                      : cn('text-white border-zinc-700 hover:border-zinc-500')
                  )}
                >
                  {team.name}
                </button>
              )
            })}
          </div>

          <div className="mt-4 min-h-[1.25rem] font-accent text-xs uppercase tracking-wider">
            {submit === 'submitting' && <span className="text-zinc-500">Saving your pick…</span>}
            {submit === 'error' && (
              <span className="text-zinc-400">Couldn&apos;t save that — tap to try again.</span>
            )}
            {submit === 'idle' && pickedTeam && (
              <span className={heatText[heat]}>Your pick: {pickedTeam.name}</span>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
