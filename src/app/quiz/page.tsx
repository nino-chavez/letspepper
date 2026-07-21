'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'
import { quizQuestions, pepperResults, calculateResult, type PepperPersonality } from '@/lib/quiz-data'
import { getStoredValue, setStoredValue, STORAGE_KEYS } from '@/lib/local-storage'
import { heatText, heatBg, type Heat } from '@/components/rhq/heat'
import { HeatMeter } from '@/components/rhq/HeatMeter'

interface QuizDistribution {
  personality: string
  count: number
  percentage: number
}

const PERSONALITY_LABELS: Record<string, string> = {
  bell: 'Bell Pepper',
  poblano: 'Poblano',
  jalapeno: 'Jalapeño',
  habanero: 'Habanero',
  reaper: 'Carolina Reaper',
  pepperX: 'Pepper X',
}

// Off-ramp personalities (habanero/reaper/pepperX) don't own a series event heat.
// Use zinc neutrals for their bar chart fill so red-600/fuchsia don't collide with --live coral.
const PERSONALITY_COLORS: Record<string, string> = {
  bell: 'bg-heat-bell',
  poblano: 'bg-heat-poblano',
  jalapeno: 'bg-heat-jalapeno',
  habanero: 'bg-zinc-400',
  reaper: 'bg-zinc-300',
  pepperX: 'bg-zinc-500',
}

// Personalities that own a series event heat (heat.ts supports only these three)
const SERIES_HEATS: Partial<Record<PepperPersonality, Heat>> = {
  bell: 'bell',
  poblano: 'poblano',
  jalapeno: 'jalapeno',
}

function QuizProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full max-w-md mx-auto mb-8">
      <div className="flex justify-between text-xs font-accent uppercase tracking-wider text-zinc-500 mb-2">
        <span>Question {current + 1}</span>
        <span>{total - current} remaining</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-heat-jalapeno rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((current + 1) / total) * 100}%` }}
          transition={{ duration: 0.4, ease: MOTION.ease.outExpo }}
        />
      </div>
    </div>
  )
}

function CommunityResults({ distribution, total, userResult }: {
  distribution: QuizDistribution[]
  total: number
  userResult: PepperPersonality
}) {
  const sorted = [...distribution].sort((a, b) => b.count - a.count)

  return (
    <motion.div
      className="mt-8 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 p-6 sm:p-8 text-left"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      <h3 className="font-display text-xl uppercase text-white mb-1 text-center">Community Results</h3>
      <p className="text-xs text-zinc-500 font-accent uppercase tracking-wider text-center mb-6">
        {total.toLocaleString()} quizzes taken
      </p>
      <div className="space-y-3">
        {sorted.map((item) => (
          <div key={item.personality}>
            <div className="flex justify-between text-sm mb-1">
              <span className={cn('text-zinc-300', item.personality === userResult && 'text-white font-medium')}>
                {PERSONALITY_LABELS[item.personality] || item.personality}
                {item.personality === userResult && ' (You)'}
              </span>
              <span className="text-zinc-500 font-accent text-xs">{item.percentage}%</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className={cn('h-full rounded-full', PERSONALITY_COLORS[item.personality] || 'bg-zinc-600')}
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ duration: 0.8, delay: 0.1, ease: MOTION.ease.outExpo }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function QuizPage() {
  const [started, setStarted] = useState(false)
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<PepperPersonality | null>(null)
  const [distribution, setDistribution] = useState<QuizDistribution[]>([])
  const [distributionTotal, setDistributionTotal] = useState(0)

  // Check for existing result on mount
  useEffect(() => {
    const stored = getStoredValue<PepperPersonality | null>(STORAGE_KEYS.QUIZ_RESULT, null)
    if (stored && pepperResults[stored]) {
      setResult(stored)
      setStarted(true)
    }
  }, [])

  // Check for ?result= param (shared link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedResult = params.get('result') as PepperPersonality | null
    if (sharedResult && pepperResults[sharedResult]) {
      setResult(sharedResult)
      setStarted(true)
    }
  }, [])

  // Fetch community distribution when result is shown
  useEffect(() => {
    if (!result) return
    fetch('/api/quiz')
      .then((r) => r.json())
      .then((data) => {
        if (data.distribution) {
          setDistribution(data.distribution)
          setDistributionTotal(data.total)
        }
      })
      .catch(() => {}) // Degrade gracefully
  }, [result])

  function handleAnswer(answerIndex: number) {
    const option = quizQuestions[currentQuestion].options[answerIndex]

    // Easter egg: short-circuit the quiz
    if (option?.easterEgg) {
      setResult(option.easterEgg)
      setStoredValue(STORAGE_KEYS.QUIZ_RESULT, option.easterEgg)
      fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personality: option.easterEgg }),
      }).catch(() => {})
      return
    }

    const newAnswers = [...answers, answerIndex]
    setAnswers(newAnswers)

    if (currentQuestion + 1 >= quizQuestions.length) {
      const personality = calculateResult(newAnswers)
      setResult(personality)
      setStoredValue(STORAGE_KEYS.QUIZ_RESULT, personality)

      // Fire-and-forget: record tally
      fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personality }),
      }).catch(() => {})
    } else {
      setCurrentQuestion(currentQuestion + 1)
    }
  }

  function handleRetake() {
    setAnswers([])
    setCurrentQuestion(0)
    setResult(null)
    setStarted(true)
  }

  function handleShare() {
    if (!result) return
    const url = `${window.location.origin}/quiz?result=${result}`
    const pepperResult = pepperResults[result]
    const text = `My result: ${pepperResult.title} — ${pepperResult.tagline}. Take the Pepper Quiz and find your court identity.`

    if (navigator.share) {
      navigator.share({ title: 'What Pepper Are You?', text, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {})
    }
  }

  const pepperResult = result ? pepperResults[result] : null

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        <section className="section-padding">
          <div className="section-container">
            <AnimatePresence mode="wait">
              {/* Start Screen */}
              {!started && (
                <motion.div
                  key="start"
                  className="max-w-2xl mx-auto text-center"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
                >
                  <h2 className="block-heading mb-4">Personality Quiz</h2>
                  <h1 className="text-display mb-6">
                    What <span className="text-heat-jalapeno">Pepper</span> Are You?
                  </h1>
                  <p className="text-xl text-zinc-400 mb-8">
                    Seven questions. One court identity. Find the pepper that matches how you play.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStarted(true)}
                    className="btn-primary text-lg"
                  >
                    Take the Quiz
                  </button>
                </motion.div>
              )}

              {/* Questions */}
              {started && !result && (
                <motion.div
                  key={`question-${currentQuestion}`}
                  className="max-w-2xl mx-auto"
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.4, ease: MOTION.ease.outExpo }}
                >
                  <QuizProgress current={currentQuestion} total={quizQuestions.length} />

                  <h2 className="font-display text-2xl sm:text-3xl uppercase text-white text-center mb-8">
                    {quizQuestions[currentQuestion].question}
                  </h2>

                  <div className="space-y-3">
                    {quizQuestions[currentQuestion].options.map((option, i) => (
                      <motion.button
                        key={i}
                        type="button"
                        onClick={() => handleAnswer(i)}
                        className="w-full text-left p-4 rounded-xl border border-zinc-800/50 bg-zinc-900/30 text-zinc-300 hover:border-heat-jalapeno/50 hover:bg-zinc-900/60 hover:text-white transition-all"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <span className="font-accent text-xs text-zinc-600 mr-3">
                          {String.fromCharCode(65 + i)}.
                        </span>
                        {option.text}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Result */}
              {result && pepperResult && (
                <motion.div
                  key="result"
                  className="max-w-2xl mx-auto text-center"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
                >
                  <h2 className="block-heading mb-4">Your Result</h2>

                  {/* Result Card */}
                  <div className="bg-zinc-900/30 rounded-2xl border border-zinc-800/50 p-8 sm:p-12 mb-8">
                    <div className="text-6xl mb-4">🌶️</div>
                    <h2 className={cn(
                      'font-display text-4xl sm:text-5xl uppercase mb-2',
                      SERIES_HEATS[result] ? heatText[SERIES_HEATS[result]!] : 'text-zinc-300'
                    )}>
                      {pepperResult.title}
                    </h2>
                    <p className="font-accent text-sm uppercase tracking-wider text-zinc-500 mb-6">
                      &ldquo;{pepperResult.tagline}&rdquo;
                    </p>

                    {/* Heat level — HeatMeter for series heats, pip row for off-ramp */}
                    <div className="flex justify-center gap-1 mb-6">
                      {SERIES_HEATS[result] ? (
                        <HeatMeter heat={SERIES_HEATS[result]!} size="sm" />
                      ) : (
                        Array.from({ length: 5 }, (_, i) => (
                          <span
                            key={i}
                            className={cn('text-lg', i < pepperResult.heatLevel ? 'opacity-100' : 'opacity-20')}
                          >
                            🌶️
                          </span>
                        ))
                      )}
                    </div>

                    <p className="text-zinc-400 text-lg leading-relaxed mb-6">
                      {pepperResult.description}
                    </p>

                    {/* Traits */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {pepperResult.traits.map((trait) => (
                        <span
                          key={trait}
                          className={cn(
                            'px-3 py-1 rounded-full text-xs font-accent uppercase tracking-wider border border-zinc-700',
                            SERIES_HEATS[result] ? heatText[SERIES_HEATS[result]!] : 'text-zinc-400'
                          )}
                        >
                          {trait}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Community Results */}
                  {distribution.length > 0 && (
                    <CommunityResults
                      distribution={distribution}
                      total={distributionTotal}
                      userResult={result}
                    />
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap justify-center gap-4 mt-8">
                    <button
                      type="button"
                      onClick={handleShare}
                      className={SERIES_HEATS[result] ? cn('btn-heat', heatBg[SERIES_HEATS[result]!]) : 'btn-primary'}
                    >
                      Share Result
                    </button>
                    <button type="button" onClick={handleRetake} className="btn-secondary">
                      Retake Quiz
                    </button>
                    <Link href="/rankings" className="btn-secondary">
                      View Rankings
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
