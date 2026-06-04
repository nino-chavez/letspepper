'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'
import { generateBingoCard, checkForBingo, type BingoSquareData } from '@/lib/bingo-data'
import { getStoredValue, setStoredValue, getDeviceId, STORAGE_KEYS } from '@/lib/local-storage'
import { usePhase, type EventPhase } from '@/components/rhq/usePhase'
import { HeatMeter } from '@/components/rhq/HeatMeter'

// Bingo is a series-wide surface with no single owning heat tier.
// Card-category border tinting uses subtle zinc hairlines; category mark colors
// use low-opacity heat tints but NOT bright heat borders (per design audit).
const CATEGORY_MARK_COLORS: Record<string, string> = {
  play: 'bg-heat-bell/20 border-zinc-700',
  culture: 'bg-heat-poblano/20 border-zinc-700',
  pepper: 'bg-heat-jalapeno/20 border-zinc-700',
  wild: 'bg-zinc-800/60 border-zinc-700',
}

/** Read `?phase=` override for QA — mirrors the flavors page pattern. */
function usePhaseOverride(): EventPhase | null {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search).get('phase')
  if (p === 'pre' || p === 'live' || p === 'post') return p
  return null
}

// Points awarded for a bingo win — kept in sync with the write payload the
// /api/engagement route receives. The actual server-side value is authoritative;
// this is the client-visible confirmation label only.
const BINGO_WIN_POINTS = 50

export default function BingoPage() {
  const [seed, setSeed] = useState('lp-2025')
  const [eventSlug, setEventSlug] = useState('')
  const [card, setCard] = useState<BingoSquareData[]>([])
  const [marks, setMarks] = useState<boolean[]>(Array(25).fill(false))
  const [hasBingo, setHasBingo] = useState(false)
  const [winningLine, setWinningLine] = useState<number[] | null>(null)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)

  const override = usePhaseOverride()
  const { phase } = usePhase(eventSlug, override)
  const isLive = phase === 'live'

  // Initialize card and load saved state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlSeed = params.get('seed') || 'lp-2025'
    // Optional ?event= param wires usePhase to a specific tournament slug.
    const urlEvent = params.get('event') || ''
    setSeed(urlSeed)
    setEventSlug(urlEvent)

    const generatedCard = generateBingoCard(urlSeed)
    setCard(generatedCard)

    const savedMarks = getStoredValue<boolean[]>(STORAGE_KEYS.BINGO_MARKS, Array(25).fill(false))
    const savedSeed = getStoredValue<string>(STORAGE_KEYS.BINGO_SEED, '')

    if (savedSeed === urlSeed && savedMarks.length === 25) {
      // Free space always marked
      savedMarks[12] = true
      setMarks(savedMarks)

      const result = checkForBingo(savedMarks)
      setHasBingo(result.hasBingo)
      setWinningLine(result.winningLine)
    } else {
      const initialMarks = Array(25).fill(false)
      initialMarks[12] = true // Free space
      setMarks(initialMarks)
    }
  }, [])

  const toggleSquare = useCallback((index: number) => {
    if (index === 12) return // Can't unmark free space

    setMarks(prev => {
      const next = [...prev]
      next[index] = !next[index]

      // Persist
      setStoredValue(STORAGE_KEYS.BINGO_MARKS, next)
      setStoredValue(STORAGE_KEYS.BINGO_SEED, seed)

      // Check for bingo
      const result = checkForBingo(next)
      const wasBingo = checkForBingo(prev).hasBingo
      setHasBingo(result.hasBingo)
      setWinningLine(result.winningLine)

      // First bingo on this card earns points on Rally HQ's community board.
      // Idempotent per card (ref = the seed), best-effort, points server-set.
      if (result.hasBingo && !wasBingo) {
        setPointsEarned(BINGO_WIN_POINTS)
        fetch('/api/engagement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id: getDeviceId(),
            source: 'bingo',
            ref: `bingo:${seed}`,
            nickname: getStoredValue<string>(STORAGE_KEYS.FAN_NICKNAME, '') || null,
          }),
        }).catch(() => {})
      }

      return next
    })
  }, [seed])

  function handleNewCard() {
    const newSeed = `lp-${Date.now()}`
    setSeed(newSeed)
    const newCard = generateBingoCard(newSeed)
    setCard(newCard)
    const initialMarks = Array(25).fill(false)
    initialMarks[12] = true
    setMarks(initialMarks)
    setHasBingo(false)
    setWinningLine(null)
    setPointsEarned(null)
    setStoredValue(STORAGE_KEYS.BINGO_MARKS, initialMarks)
    setStoredValue(STORAGE_KEYS.BINGO_SEED, newSeed)
  }

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero */}
        <section className="section-padding pb-8 sm:pb-12">
          <div className="section-container">
            <motion.div
              className="max-w-3xl mx-auto text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-4">
                {isLive
                  ? <span style={{ color: 'var(--live)' }}>Game Day — Live</span>
                  : 'Game Day'
                }
              </p>
              <h2 className="block-heading mb-6">
                Pepper <span className="text-heat-jalapeno">Bingo</span>
              </h2>
              <div className="flex justify-center mb-4">
                <HeatMeter heat="jalapeno" size="sm" />
              </div>
              <p className="text-xl text-zinc-400">
                Tap squares as they happen. Get 5 in a row to win.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Bingo Card */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <div className="max-w-lg mx-auto">
              {/* BINGO header */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2 mb-1 sm:mb-2">
                {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                  <div
                    key={letter}
                    className="text-center font-display text-2xl sm:text-3xl text-heat-jalapeno"
                  >
                    {letter}
                  </div>
                ))}
              </div>

              {/* Card grid */}
              <div className="grid grid-cols-5 gap-1 sm:gap-2">
                {card.map((square, i) => {
                  const isMarked = marks[i]
                  const isFreeSpace = i === 12
                  const isWinning = winningLine?.includes(i)

                  return (
                    <motion.button
                      key={square.id}
                      type="button"
                      onClick={() => toggleSquare(i)}
                      disabled={isFreeSpace}
                      className={cn(
                        'aspect-square rounded-lg border p-1 sm:p-2 flex items-center justify-center text-center transition-all',
                        'text-[10px] sm:text-xs leading-tight',
                        isFreeSpace && 'bg-heat-jalapeno/20 border-zinc-700 cursor-default',
                        !isFreeSpace && !isMarked && 'bg-zinc-900/30 border-zinc-800 cursor-pointer hover:bg-zinc-800/50',
                        !isFreeSpace && isMarked && CATEGORY_MARK_COLORS[square.category],
                        isWinning && 'ring-2 ring-heat-jalapeno'
                      )}
                      whileTap={!isFreeSpace ? { scale: 0.95 } : undefined}
                      aria-pressed={isMarked}
                      aria-label={`${square.text}${isMarked ? ' — marked' : ''}`}
                    >
                      <span className={cn(
                        'font-accent uppercase tracking-wider',
                        isMarked ? 'text-white' : 'text-zinc-400',
                        isFreeSpace && 'text-heat-jalapeno'
                      )}>
                        {isFreeSpace ? '🌶️' : square.text}
                      </span>
                    </motion.button>
                  )
                })}
              </div>

              {/* New Card button */}
              <div className="text-center mt-6">
                <button type="button" onClick={handleNewCard} className="btn-secondary">
                  New Card
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Bingo Win Overlay */}
        <AnimatePresence>
          {hasBingo && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-pepper-black/80 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 sm:p-12 text-center max-w-md mx-4"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={MOTION.spring.bouncy}
              >
                <div className="text-6xl mb-4">🌶️🔥🌶️</div>
                <h2 className="block-heading mb-2" style={{ color: 'var(--gold)' }}>
                  BINGO!
                </h2>
                <p className="text-zinc-400 mb-3">
                  You got 5 in a row! You&apos;re officially spicy.
                </p>
                {pointsEarned !== null && (
                  <p
                    className="font-accent text-sm uppercase tracking-wider mb-6"
                    style={{ color: 'var(--gold)' }}
                  >
                    +{pointsEarned} Pepper points earned
                  </p>
                )}
                {pointsEarned === null && <div className="mb-6" />}
                <button
                  type="button"
                  onClick={() => setHasBingo(false)}
                  className="btn-primary"
                >
                  Keep Playing
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </>
  )
}
