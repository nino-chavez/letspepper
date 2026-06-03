'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer, ChampionPick } from '@/components'
import { cn } from '@/lib/utils'
import { predictionEvents, calculatePredictionScore, type PropHeat } from '@/lib/predictions-data'
import { HEAT_CONFIG, type HeatLevel } from '@/lib/heat-config'
import { getStoredValue, setStoredValue, getDeviceId, STORAGE_KEYS } from '@/lib/local-storage'

const heatMap: Record<PropHeat, HeatLevel> = { bell: 'bell', jalapeno: 'jalapeno', reaper: 'reaper' }

interface LeaderboardEntry {
  nickname: string | null
  score: number
}

function DeadlineTimer({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const now = Date.now()
      const target = new Date(deadline).getTime()
      const diff = target - now

      if (diff <= 0) {
        setTimeLeft('Locked')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${mins}m`)
      } else {
        setTimeLeft(`${hours}h ${mins}m`)
      }
    }

    update()
    const interval = setInterval(update, 60_000)
    return () => clearInterval(interval)
  }, [deadline])

  return (
    <span className="font-accent text-sm uppercase tracking-wider">
      {timeLeft}
    </span>
  )
}

export default function PredictionsPage() {
  const event = predictionEvents[0]
  const storageKey = `${STORAGE_KEYS.PREDICTIONS_PREFIX}${event.id}`
  const [picks, setPicks] = useState<Record<string, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const [nickname, setNickname] = useState('')
  const [entryCount, setEntryCount] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    const saved = getStoredValue<{ picks: Record<string, number>; submitted: boolean }>(storageKey, { picks: {}, submitted: false })
    setPicks(saved.picks)
    setSubmitted(saved.submitted)
  }, [storageKey])

  // Fetch predictions data from API
  useEffect(() => {
    const deviceId = getDeviceId()
    fetch(`/api/predictions?event_id=${event.id}&device_id=${deviceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.entryCount) setEntryCount(data.entryCount)
        if (data.leaderboard) setLeaderboard(data.leaderboard)
        if (data.ownEntry?.nickname) setNickname(data.ownEntry.nickname)
      })
      .catch(() => {})
  }, [event.id])

  const isLocked = event.isLocked || new Date(event.deadline).getTime() <= Date.now()

  function handlePick(propId: string, optionIndex: number) {
    if (isLocked || submitted) return
    setPicks(prev => {
      const next = { ...prev, [propId]: optionIndex }
      setStoredValue(storageKey, { picks: next, submitted: false })
      return next
    })
  }

  function handleSubmit() {
    setSubmitted(true)
    setStoredValue(storageKey, { picks, submitted: true })

    const deviceId = getDeviceId()
    fetch('/api/predictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        event_id: event.id,
        picks,
        nickname: nickname.trim() || null,
      }),
    })
      .then(() => {
        // Re-fetch entry count
        return fetch(`/api/predictions?event_id=${event.id}&device_id=${deviceId}`)
      })
      .then((r) => r.json())
      .then((data) => {
        if (data.entryCount) setEntryCount(data.entryCount)
        if (data.leaderboard) setLeaderboard(data.leaderboard)
      })
      .catch(() => {})
  }

  const totalPossible = event.props.reduce((sum, p) => sum + p.points, 0)
  const pickedCount = Object.keys(picks).length
  const score = event.resultsRevealed ? calculatePredictionScore(event.id, picks) : null

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-3xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">Predictions</p>
              <h1 className="text-display mb-6">
                Pepper <span className="text-heat-poblano">Props</span>
              </h1>
              <p className="text-xl text-zinc-400 mb-4">
                Make your picks for {event.event}. Higher heat = more points if you&apos;re right.
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-zinc-500">
                  <span className="font-accent text-xs uppercase tracking-wider">Deadline:</span>
                  <DeadlineTimer deadline={event.deadline} />
                </div>
                <div className="text-zinc-600">|</div>
                <span className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  {totalPossible} pts possible
                </span>
                {entryCount > 0 && (
                  <>
                    <div className="text-zinc-600">|</div>
                    <span className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                      {entryCount} predictions submitted
                    </span>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Score (if revealed) */}
        {score && (
          <section className="section-padding pt-0">
            <div className="section-container">
              <div className="bg-zinc-900/30 rounded-xl border border-heat-jalapeno/50 p-6 text-center max-w-md">
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500 mb-2">Your Score</p>
                <p className="font-display text-5xl text-heat-jalapeno">{score.total}</p>
                <p className="text-zinc-500 text-sm mt-1">
                  {score.correct} correct out of {event.props.length} props
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Leaderboard (if results revealed and scores exist) */}
        {event.resultsRevealed && leaderboard.length > 0 && (
          <section className="section-padding pt-0">
            <div className="section-container">
              <div className="max-w-md">
                <h3 className="font-display text-xl uppercase text-white mb-4">Leaderboard</h3>
                <div className="space-y-2">
                  {leaderboard.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-zinc-900/30 rounded-lg border border-zinc-800/50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'font-display text-lg w-6',
                          i === 0 ? 'text-heat-bell' : i === 1 ? 'text-zinc-400' : i === 2 ? 'text-heat-habanero' : 'text-zinc-600'
                        )}>
                          {i + 1}
                        </span>
                        <span className="text-zinc-300 text-sm">
                          {entry.nickname || 'Anonymous'}
                        </span>
                      </div>
                      <span className="font-accent text-sm text-heat-jalapeno">{entry.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Champion pick (Rally HQ-backed) — the "who wins" call, auto-scored off the bracket */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <ChampionPick
              tournament={event.id}
              tournamentName={event.event}
              deadline={event.deadline}
            />
          </div>
        </section>

        {/* Props */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="space-y-4 max-w-3xl"
              initial="initial"
              animate="animate"
              transition={{ staggerChildren: 0.05 }}
            >
              {event.props.map((prop) => {
                const heat = HEAT_CONFIG[heatMap[prop.heat]]
                const userPick = picks[prop.id]
                const isCorrect = event.resultsRevealed && prop.correctAnswer !== undefined && userPick === prop.correctAnswer

                return (
                  <motion.div
                    key={prop.id}
                    className={cn(
                      'bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-5',
                      event.resultsRevealed && isCorrect && 'border-heat-bell/50'
                    )}
                    variants={MOTION.variants.slideUp}
                  >
                    {/* Question */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <h3 className="text-white font-medium">{prop.question}</h3>
                      <span className={cn(
                        'flex-shrink-0 px-2 py-1 rounded-full text-xs font-accent uppercase tracking-wider',
                        heat.textClass, `border ${heat.borderClass}`
                      )}>
                        {prop.points}pt
                      </span>
                    </div>

                    {/* Options */}
                    <div className="grid sm:grid-cols-2 gap-2">
                      {prop.options.map((option, i) => {
                        const isSelected = userPick === i
                        const isAnswer = event.resultsRevealed && prop.correctAnswer === i

                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handlePick(prop.id, i)}
                            disabled={isLocked || submitted}
                            className={cn(
                              'text-left px-4 py-3 rounded-lg border text-sm transition-all',
                              isSelected && !event.resultsRevealed && 'border-heat-jalapeno/50 bg-heat-jalapeno/10 text-white',
                              !isSelected && !event.resultsRevealed && 'border-zinc-800/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300',
                              isAnswer && 'border-heat-bell/50 bg-heat-bell/10 text-heat-bell',
                              event.resultsRevealed && isSelected && !isAnswer && 'border-heat-habanero/50 bg-heat-habanero/10 text-heat-habanero',
                              (isLocked || submitted) && !event.resultsRevealed && 'cursor-default'
                            )}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>

                    {/* Category tag */}
                    <div className="mt-3">
                      <span className="font-accent text-[10px] uppercase tracking-wider text-zinc-600">
                        {prop.category}
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>

            {/* Nickname + Submit */}
            {!isLocked && !submitted && (
              <div className="mt-8 max-w-3xl">
                <div className="mb-4">
                  <label className="block font-accent text-xs uppercase tracking-wider text-zinc-500 mb-2">
                    Nickname (for leaderboard)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={30}
                    placeholder="Anonymous"
                    className="w-full max-w-xs bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-heat-poblano"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={pickedCount === 0}
                  className={cn('btn-primary', pickedCount === 0 && 'opacity-50 cursor-not-allowed')}
                >
                  Lock In Picks ({pickedCount}/{event.props.length})
                </button>
              </div>
            )}

            {submitted && !event.resultsRevealed && (
              <motion.div
                className="mt-8 max-w-3xl bg-zinc-900/30 rounded-xl border border-heat-bell/30 p-6 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="font-display text-xl uppercase text-heat-bell mb-2">Picks Locked In!</p>
                <p className="text-zinc-400 text-sm">
                  Your predictions are saved. Results will be revealed after the event.
                </p>
                {entryCount > 0 && (
                  <p className="text-xs text-zinc-600 font-accent mt-2">
                    {entryCount} predictions submitted so far
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
