'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { getTeamStats, tournamentResults, type TournamentResult } from '@/lib/standings-data'

function StatBar({ label, valueA, valueB, maxValue }: { label: string; valueA: number; valueB: number; maxValue: number }) {
  const widthA = maxValue > 0 ? (valueA / maxValue) * 100 : 0
  const widthB = maxValue > 0 ? (valueB / maxValue) * 100 : 0

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-accent uppercase tracking-wider text-zinc-500">
        <span>{valueA}</span>
        <span>{label}</span>
        <span>{valueB}</span>
      </div>
      <div className="flex gap-2 h-3">
        <div className="flex-1 flex justify-end">
          <motion.div
            className="h-full rounded-l-full bg-heat-jalapeno"
            initial={{ width: 0 }}
            animate={{ width: `${widthA}%` }}
            transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
          />
        </div>
        <div className="flex-1">
          <motion.div
            className="h-full rounded-r-full bg-heat-bell"
            initial={{ width: 0 }}
            animate={{ width: `${widthB}%` }}
            transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
          />
        </div>
      </div>
    </div>
  )
}

export function HeadToHead() {
  const [teamAIndex, setTeamAIndex] = useState<number>(-1)
  const [teamBIndex, setTeamBIndex] = useState<number>(-1)
  const [showComparison, setShowComparison] = useState(false)

  // Rally HQ is the source of truth (placements + rosters); the local snapshot is
  // the initial paint + offline fallback. Team stats derive from whichever is live.
  const [results, setResults] = useState<TournamentResult[]>(tournamentResults)
  useEffect(() => {
    fetch('/api/standings-results')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.results) && d.results.length > 0) setResults(d.results)
      })
      .catch(() => {})
  }, [])
  const teams = useMemo(() => getTeamStats(results), [results])

  const teamA = teamAIndex >= 0 ? teams[teamAIndex] : null
  const teamB = teamBIndex >= 0 ? teams[teamBIndex] : null

  function handleCompare() {
    if (teamA && teamB) {
      setShowComparison(true)
    }
  }

  const maxPoints = Math.max(teamA?.totalPoints ?? 0, teamB?.totalPoints ?? 0, 1)
  const maxEvents = Math.max(teamA?.events ?? 0, teamB?.events ?? 0, 1)

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Team A Selector */}
        <div>
          <label className="block font-accent text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Team A
          </label>
          <select
            value={teamAIndex}
            onChange={(e) => { setTeamAIndex(Number(e.target.value)); setShowComparison(false) }}
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-heat-jalapeno"
          >
            <option value={-1}>Select a team</option>
            {teams.map((team, i) => (
              <option key={team.key} value={i}>
                {team.players.join(' / ')}
              </option>
            ))}
          </select>
        </div>

        {/* Team B Selector */}
        <div>
          <label className="block font-accent text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Team B
          </label>
          <select
            value={teamBIndex}
            onChange={(e) => { setTeamBIndex(Number(e.target.value)); setShowComparison(false) }}
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-heat-bell"
          >
            <option value={-1}>Select a team</option>
            {teams.map((team, i) => (
              <option key={team.key} value={i}>
                {team.players.join(' / ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Compare Button */}
      <div className="text-center mb-8">
        <button
          type="button"
          onClick={handleCompare}
          disabled={!teamA || !teamB || teamAIndex === teamBIndex}
          className={cn(
            'btn-primary',
            (!teamA || !teamB || teamAIndex === teamBIndex) && 'opacity-50 cursor-not-allowed'
          )}
        >
          Compare
        </button>
      </div>

      {/* Comparison Results */}
      <AnimatePresence>
        {showComparison && teamA && teamB && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5, ease: MOTION.ease.outExpo }}
            className="space-y-6"
          >
            {/* Team Names Header */}
            <div className="flex justify-between items-center">
              <span className="font-display text-lg uppercase text-heat-jalapeno">
                {teamA.players.join(' / ')}
              </span>
              <span className="font-accent text-xs uppercase tracking-wider text-zinc-500">VS</span>
              <span className="font-display text-lg uppercase text-heat-bell text-right">
                {teamB.players.join(' / ')}
              </span>
            </div>

            <StatBar label="Season Points" valueA={teamA.totalPoints} valueB={teamB.totalPoints} maxValue={maxPoints} />
            <StatBar label="Wins" valueA={teamA.wins} valueB={teamB.wins} maxValue={Math.max(teamA.wins, teamB.wins, 1)} />
            <StatBar label="Podiums" valueA={teamA.podiums} valueB={teamB.podiums} maxValue={Math.max(teamA.podiums, teamB.podiums, 1)} />
            <StatBar label="Best Finish" valueA={teamA.bestFinish > 0 ? teamA.bestFinish : 0} valueB={teamB.bestFinish > 0 ? teamB.bestFinish : 0} maxValue={9} />
            <StatBar label="Events Played" valueA={teamA.events} valueB={teamB.events} maxValue={maxEvents} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
