'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'
import { tournamentResults, getAllPlayers } from '@/lib/standings-data'
import { getStoredValue, setStoredValue, getDeviceId, STORAGE_KEYS } from '@/lib/local-storage'
import { heatText, heatBg, heatBorder, type Heat } from '@/components/rhq/heat'
import { HeatMeter } from '@/components/rhq/HeatMeter'
import { usePhase } from '@/components/rhq/usePhase'

// Slug → heat tier for the vote page meta line accent
const SLUG_HEAT: Record<string, Heat> = {
  'bell-pepper-open': 'bell',
  'jalapeno-open': 'jalapeno',
  'poblano-open': 'poblano',
}

// Heat → btn-heat classes (mirrors flavors page heatConfig)
const HEAT_BTN: Record<Heat, { bgClass: string; glowClass: string }> = {
  bell: { bgClass: 'bg-heat-bell', glowClass: 'hover:bg-heat-bell-glow' },
  jalapeno: { bgClass: 'bg-heat-jalapeno', glowClass: 'hover:bg-heat-jalapeno-glow' },
  poblano: { bgClass: 'bg-heat-poblano', glowClass: 'hover:bg-heat-poblano-glow' },
}

// RHQ slug lookup for usePhase (tournament event slug, not series slug)
const SLUG_RHQ: Record<string, string> = {
  'bell-pepper-open': 'bell-pepper-open',
  'jalapeno-open': 'jalapeno-open',
  'poblano-open': 'poblano-open',
}

function VotePageInner({ eventId }: { eventId: string }) {
  const [players, setPlayers] = useState<string[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [tallies, setTallies] = useState<Record<string, number>>({})

  const heat: Heat | null = eventId ? SLUG_HEAT[eventId] ?? null : null
  const rhqSlug = eventId ? SLUG_RHQ[eventId] ?? '' : ''
  const { phase } = usePhase(rhqSlug)
  const isLive = rhqSlug ? phase === 'live' : false

  useEffect(() => {
    // Try RHQ roster first, then awards candidates, fall back to static data
    async function loadPlayers() {
      if (eventId) {
        // 1. Try RHQ roster
        try {
          const res = await fetch(`/api/rhq/teams?slug=${encodeURIComponent(eventId)}`)
          if (res.ok) {
            const data = await res.json()
            const teams: { name: string }[] = data.teams ?? []
            if (teams.length > 0) {
              // team names are "{Player1} / {Player2} / {Player3}" — extract all players
              const playerSet = new Set<string>()
              for (const team of teams) {
                const parts = team.name.split(/\s*\/\s*/)
                for (const p of parts) {
                  const trimmed = p.trim()
                  if (trimmed) playerSet.add(trimmed)
                }
              }
              if (playerSet.size > 0) {
                setPlayers(Array.from(playerSet).sort())
                return
              }
            }
          }
        } catch (_) {}

        // 2. Try awards candidates (MVP category)
        try {
          const res = await fetch(`/api/awards-candidates`)
          if (res.ok) {
            const data = await res.json()
            const mvp: { name: string }[] = data.candidates?.mvp ?? []
            if (mvp.length > 0) {
              setPlayers(mvp.map((c) => c.name).sort())
              return
            }
          }
        } catch (_) {}

        // 3. Static fallback — event players
        const tournament = tournamentResults.find((t) => t.id === eventId)
        if (tournament) {
          const eventPlayers = new Set<string>()
          tournament.results.forEach((r) => r.players.forEach((p) => eventPlayers.add(p)))
          setPlayers(Array.from(eventPlayers).sort())
          return
        }
      }

      // No event context — use all-time player list
      setPlayers(getAllPlayers())
    }

    loadPlayers()

    // Check for existing vote
    const storageKey = `${STORAGE_KEYS.MVP_VOTE_PREFIX}${eventId || 'general'}`
    const saved = getStoredValue<{ player: string; deviceId: string } | null>(storageKey, null)
    if (saved) {
      setSelectedPlayer(saved.player)
      setHasVoted(true)
    }
  }, [eventId])

  // Fetch tallies after voting
  useEffect(() => {
    if (!hasVoted) return
    const scope = `mvp:${eventId || 'general'}`
    fetch(`/api/votes?scope=${scope}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tallies?.[scope]) setTallies(data.tallies[scope])
      })
      .catch(() => {})
  }, [hasVoted, eventId])

  function handleVote() {
    if (!selectedPlayer) return
    const deviceId = getDeviceId()
    const storageKey = `${STORAGE_KEYS.MVP_VOTE_PREFIX}${eventId || 'general'}`
    setStoredValue(storageKey, { player: selectedPlayer, deviceId })
    setHasVoted(true)

    fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        scope: `mvp:${eventId || 'general'}`,
        choice: selectedPlayer,
      }),
    }).catch(() => {})
  }

  const eventName = eventId
    ? tournamentResults.find((t) => t.id === eventId)?.event || 'Event'
    : 'Season'

  const sortedPlayers =
    hasVoted && Object.keys(tallies).length > 0
      ? [...players].sort((a, b) => (tallies[b] || 0) - (tallies[a] || 0))
      : players

  const totalVotes = Object.values(tallies).reduce((a, b) => a + b, 0)

  // Winner = top vote-getter after voting resolves
  const topPlayer = sortedPlayers.length > 0 ? sortedPlayers[0] : null

  const ctaBtnClass =
    heat
      ? cn('btn-heat', HEAT_BTN[heat].bgClass, HEAT_BTN[heat].glowClass)
      : 'btn-primary'

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-2xl mx-auto text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              {/* Meta line */}
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-3 flex items-center justify-center gap-2">
                {heat && <HeatMeter heat={heat} size="sm" />}
                {isLive ? (
                  <span style={{ color: 'var(--live)' }}>Live Vote</span>
                ) : (
                  <span>MVP Vote</span>
                )}
                {heat && (
                  <span className={heatText[heat]}>{eventName}</span>
                )}
              </p>

              <h2 className="block-heading mb-6">
                {eventName} MVP
              </h2>

              <p className="text-xl text-zinc-400">
                {hasVoted
                  ? 'Thanks for voting! Your pick has been recorded.'
                  : 'Cast your vote for the most valuable player. One vote per device.'}
              </p>
            </motion.div>
          </div>
        </section>

        {/* Player List */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <div className="max-w-lg mx-auto">
              {hasVoted ? (
                <motion.div
                  className="space-y-2"
                  initial="initial"
                  animate="animate"
                  transition={{ staggerChildren: 0.03 }}
                >
                  {/* Confirmation banner */}
                  <motion.div
                    className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-6 text-center mb-4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <div className="text-3xl mb-2">
                      <span style={{ color: 'var(--gold)' }}>★</span>
                    </div>
                    <p className="text-zinc-400 text-sm">
                      You voted for{' '}
                      <span className="text-white font-medium">{selectedPlayer}</span>
                    </p>
                    {totalVotes > 0 && (
                      <p className="text-xs text-zinc-600 font-accent mt-1">
                        {totalVotes} total votes
                      </p>
                    )}
                  </motion.div>

                  {/* Ranked results */}
                  {sortedPlayers.map((player, i) => {
                    const count = tallies[player] || 0
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
                    if (count === 0 && totalVotes > 0) return null

                    const isWinner = hasVoted && totalVotes > 0 && player === topPlayer

                    return (
                      <motion.div
                        key={player}
                        className={cn(
                          'p-4 rounded-xl border transition-all',
                          isWinner
                            ? 'border-zinc-700 bg-zinc-900/50'
                            : 'border-zinc-800 bg-zinc-900/30'
                        )}
                        style={isWinner ? { borderLeftColor: 'var(--gold)', borderLeftWidth: '3px' } : undefined}
                        variants={MOTION.variants.slideUp}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-zinc-600 font-accent text-xs w-5">{i + 1}.</span>
                            <span
                              className={cn('font-display text-lg uppercase', isWinner ? '' : 'text-zinc-300')}
                              style={isWinner ? { color: 'var(--gold)' } : undefined}
                            >
                              {player}
                            </span>
                          </div>
                          <span className="text-zinc-500 font-accent text-xs">{count} votes</span>
                        </div>
                        {totalVotes > 0 && (
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden ml-8">
                            <motion.div
                              className={cn('h-full rounded-full', heat ? heatBg[heat] : 'bg-zinc-400')}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
                            />
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </motion.div>
              ) : (
                <motion.div
                  className="space-y-2"
                  initial="initial"
                  animate="animate"
                  transition={{ staggerChildren: 0.03 }}
                >
                  {players.map((player) => (
                    <motion.button
                      key={player}
                      type="button"
                      onClick={() => setSelectedPlayer(player)}
                      className={cn(
                        'w-full text-left p-4 rounded-xl border transition-all',
                        selectedPlayer === player
                          ? cn(
                              'bg-zinc-800/60 text-white',
                              heat ? heatBorder[heat] + '/50' : 'border-zinc-600'
                            )
                          : 'border-zinc-800 bg-zinc-900/30 text-zinc-400 hover:border-zinc-700 hover:text-white'
                      )}
                      variants={MOTION.variants.slideUp}
                      whileTap={{ scale: 0.98 }}
                    >
                      <span className="font-display text-lg uppercase">{player}</span>
                    </motion.button>
                  ))}

                  {/* Submit */}
                  <div className="pt-4 text-center">
                    <button
                      type="button"
                      onClick={handleVote}
                      disabled={!selectedPlayer}
                      className={cn(ctaBtnClass, !selectedPlayer && 'opacity-50 cursor-not-allowed')}
                    >
                      Cast Vote
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}

export default function VotePage() {
  const [eventId, setEventId] = useState<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setEventId(params.get('event') || '')
    setReady(true)
  }, [])

  if (!ready) return null

  return <VotePageInner eventId={eventId} />
}
