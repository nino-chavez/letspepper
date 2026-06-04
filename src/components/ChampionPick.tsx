'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { type Heat, heatBg } from '@/components/rhq/heat'
import { getStoredValue, setStoredValue, getDeviceId, STORAGE_KEYS } from '@/lib/local-storage'

/** Full static class strings per heat so Tailwind keeps them (no runtime templating). */
const HEAT_TINT: Record<Heat, { text: string; selBorder: string; selBg: string; panelBorder: string; panelBg: string; ring: string }> = {
  bell: { text: 'text-heat-bell', selBorder: 'border-heat-bell/60', selBg: 'bg-heat-bell/10', panelBorder: 'border-heat-bell/30', panelBg: 'bg-heat-bell/5', ring: 'focus:ring-heat-bell' },
  poblano: { text: 'text-heat-poblano', selBorder: 'border-heat-poblano/60', selBg: 'bg-heat-poblano/10', panelBorder: 'border-heat-poblano/30', panelBg: 'bg-heat-poblano/5', ring: 'focus:ring-heat-poblano' },
  jalapeno: { text: 'text-heat-jalapeno', selBorder: 'border-heat-jalapeno/60', selBg: 'bg-heat-jalapeno/10', panelBorder: 'border-heat-jalapeno/30', panelBg: 'bg-heat-jalapeno/5', ring: 'focus:ring-heat-jalapeno' },
}

interface Team {
  id: string
  name: string
  seed: number | null
}

interface ChampionPickProps {
  /** Rally HQ tournament slug — the source of truth for teams + scoring. */
  tournament: string
  /** Display name of the tournament (e.g. "Bell Pepper Open"). */
  tournamentName: string
  /** ISO deadline; picks soft-lock here client-side (RHQ hard-locks at bracket). */
  deadline: string
  /** Champion team name once the bracket resolves — grades the fan's pick (post). */
  champion?: string | null
  /** Event heat — themes the accent + CTA (defaults to bell). */
  heat?: Heat
}

export function ChampionPick({ tournament, tournamentName, deadline, champion, heat = 'bell' }: ChampionPickProps) {
  const tint = HEAT_TINT[heat]
  const storageKey = `${STORAGE_KEYS.CHAMPION_PREFIX}${tournament}`
  const [teams, setTeams] = useState<Team[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isLocked = new Date(deadline).getTime() <= Date.now()

  // Restore prior pick + shared nickname.
  useEffect(() => {
    const saved = getStoredValue<{ pick: string | null; submitted: boolean }>(storageKey, { pick: null, submitted: false })
    setPick(saved.pick)
    setSubmitted(saved.submitted)
    setNickname(getStoredValue<string>(STORAGE_KEYS.FAN_NICKNAME, ''))
  }, [storageKey])

  // Load the real teams from Rally HQ.
  useEffect(() => {
    fetch(`/api/champion?tournament=${tournament}`)
      .then((r) => r.json())
      .then((data) => setTeams(Array.isArray(data.teams) ? data.teams : []))
      .catch(() => setTeams([]))
      .finally(() => setLoaded(true))
  }, [tournament])

  function choose(teamId: string) {
    if (isLocked || submitted) return
    setPick(teamId)
    setError(null)
    setStoredValue(storageKey, { pick: teamId, submitted: false })
  }

  async function submit() {
    if (!pick || busy) return
    setBusy(true)
    setError(null)
    const trimmed = nickname.trim()
    setStoredValue(STORAGE_KEYS.FAN_NICKNAME, trimmed)

    try {
      const res = await fetch('/api/champion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: getDeviceId(),
          tournament,
          predicted_team_id: pick,
          nickname: trimmed || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not submit your pick.')
        return
      }
      setSubmitted(true)
      setStoredValue(storageKey, { pick, submitted: true })
    } catch {
      setError('Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  const pickedTeam = teams.find((t) => t.id === pick)

  return (
    <motion.div
      className="bg-zinc-900/40 rounded-xl border border-zinc-800 p-6 max-w-3xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <span className={cn('block font-accent text-[0.62rem] font-bold uppercase tracking-[0.14em] mb-2', tint.text)}>
            Second Screen <span className="text-zinc-500">·</span> Points, No Money
          </span>
          <h2 className="font-display text-2xl uppercase text-white">
            Predict the <span className={tint.text}>Champion</span>
          </h2>
        </div>
        <span className="flex-shrink-0 font-accent text-[10px] uppercase tracking-wider text-zinc-500 border border-zinc-700/60 rounded-full px-2 py-1">
          Powered by Rally HQ
        </span>
      </div>
      <p className="text-zinc-400 text-sm mb-5">
        Call the {tournamentName} winner. Auto-scored off the live bracket — and your pick
        rides the same leaderboard whether you call it here or on Rally HQ.
      </p>

      {champion && (
        <div
          className="mb-5 rounded-lg border px-4 py-3"
          style={
            pickedTeam && pickedTeam.name === champion
              ? { borderColor: 'color-mix(in srgb, var(--gold) 45%, transparent)', background: 'color-mix(in srgb, var(--gold) 8%, transparent)' }
              : { borderColor: '#27272a' }
          }
        >
          {pickedTeam && pickedTeam.name === champion ? (
            <p className="font-display text-lg uppercase" style={{ color: 'var(--gold)' }}>
              🏆 You called it — {champion} took the title.
            </p>
          ) : pick ? (
            <p className="text-zinc-300 text-sm">
              <span className="font-display text-lg uppercase block" style={{ color: 'var(--gold)' }}>
                {champion} took it
              </span>
              You had {pickedTeam?.name ?? 'a different team'}.
            </p>
          ) : (
            <p className="font-display text-lg uppercase" style={{ color: 'var(--gold)' }}>
              {champion} took the title.
            </p>
          )}
        </div>
      )}

      {!loaded && <p className="text-zinc-600 text-sm font-accent uppercase tracking-wider">Loading teams…</p>}

      {loaded && teams.length === 0 && (
        <p className="text-zinc-500 text-sm">
          Teams aren&apos;t posted yet. Check back once the {tournamentName} field is set.
        </p>
      )}

      {loaded && teams.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {teams.map((team) => {
              const isSelected = pick === team.id
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => choose(team.id)}
                  disabled={isLocked || submitted}
                  className={cn(
                    'flex items-center gap-2 text-left px-4 py-3 rounded-lg border text-sm transition-all',
                    isSelected && cn(tint.selBorder, tint.selBg, 'text-white'),
                    !isSelected && 'border-zinc-800/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300',
                    (isLocked || submitted) && !isSelected && 'opacity-50 cursor-default',
                  )}
                >
                  {team.seed != null && (
                    <span className="font-accent text-xs text-zinc-600">#{team.seed}</span>
                  )}
                  <span className="truncate">{team.name}</span>
                </button>
              )
            })}
          </div>

          {submitted ? (
            <motion.div
              className={cn('mt-5 rounded-lg border px-4 py-3', tint.panelBorder, tint.panelBg)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className={cn('font-display text-lg uppercase', tint.text)}>Pick locked in</p>
              <p className="text-zinc-400 text-sm">
                You called <span className="text-white">{pickedTeam?.name ?? 'your team'}</span> to win.
              </p>
            </motion.div>
          ) : (
            <div className="mt-5">
              {!isLocked && (
                <div className="mb-4">
                  <label className="block font-accent text-xs uppercase tracking-wider text-zinc-500 mb-2">
                    Nickname (for the leaderboard)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={30}
                    placeholder="Anonymous"
                    className={cn('w-full max-w-xs bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2', tint.ring)}
                  />
                </div>
              )}
              {error && <p className="text-heat-habanero text-sm mb-3">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={!pick || isLocked || busy}
                className={cn('btn-heat', heatBg[heat], (!pick || isLocked || busy) && 'opacity-50 cursor-not-allowed')}
              >
                {isLocked ? 'Picks Closed' : busy ? 'Locking…' : 'Lock In Champion'}
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
