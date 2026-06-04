'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'
import { awardCategories, AWARDS_RESULTS_REVEALED } from '@/lib/awards-data'
import { HEAT_CONFIG, type HeatLevel } from '@/lib/heat-config'
import { heatText, type Heat } from '@/components/rhq/heat'
import { HeatMeter } from '@/components/rhq/HeatMeter'
import { getStoredValue, setStoredValue, getDeviceId, STORAGE_KEYS } from '@/lib/local-storage'

/** Iron award category injected when RHQ returns iron nominees */
const IRON_CATEGORY = {
  id: 'iron',
  name: 'Iron Player',
  pepperName: 'Iron Pepper Award',
  description: 'The player who competed in every match — no substitutions, no breaks, no excuses.',
  heat: 'jalapeno' as const,
  nominees: [] as { id: string; name: string; reason: string }[],
}

/** Maps canonical Heat tiers to HeatMeter-compatible values */
const CANONICAL_HEATS = new Set<string>(['bell', 'poblano', 'jalapeno'])

function categoryHeatMeter(heat: string) {
  if (CANONICAL_HEATS.has(heat)) return heat as Heat
  return null
}

function categoryAccentClass(heat: string): string | null {
  if (CANONICAL_HEATS.has(heat)) return heatText[heat as Heat]
  return null
}

interface VoteState {
  votes: Record<string, string> // categoryId -> nomineeId
  submitted: boolean
  deviceId: string
}

export default function AwardsPage() {
  const [votes, setVotes] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [tallies, setTallies] = useState<Record<string, Record<string, number>>>({})
  // Objective categories (MVP, Most Improved, Iron) pull live nominees from Rally HQ;
  // brand metadata and subjective categories (sportsmanship, fun) stay local.
  const [categories, setCategories] = useState(awardCategories)

  useEffect(() => {
    const RHQ_BY_LP: Record<string, string> = {
      mvp: 'mvp',
      improved: 'most_improved',
      iron: 'iron',
    }
    fetch('/api/awards-candidates')
      .then((r) => r.json())
      .then((data) => {
        const derived = data?.candidates as Record<string, { id: string; name: string; reason: string }[]> | undefined
        if (!derived) return
        setCategories((prev) => {
          // Update existing categories with live nominees
          const updated = prev.map((cat) => {
            const nominees = derived[RHQ_BY_LP[cat.id]]
            return nominees && nominees.length > 0 ? { ...cat, nominees } : cat
          })
          // Inject iron category if RHQ returns iron nominees and it isn't already present
          const hasIron = updated.some((c) => c.id === 'iron')
          const ironNominees = derived['iron']
          if (!hasIron && ironNominees && ironNominees.length > 0) {
            return [...updated, { ...IRON_CATEGORY, nominees: ironNominees }]
          }
          return updated
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const saved = getStoredValue<VoteState>(STORAGE_KEYS.AWARDS_VOTES, {
      votes: {},
      submitted: false,
      deviceId: '',
    })
    setVotes(saved.votes)
    setSubmitted(saved.submitted)
  }, [])

  // Fetch live tallies when submitted or on mount if already submitted
  useEffect(() => {
    if (!submitted) return
    const scopes = categories.map((c) => `awards:${c.id}`).join(',')
    fetch(`/api/votes?scopes=${scopes}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tallies) setTallies(data.tallies)
      })
      .catch(() => {})
  }, [submitted, categories])

  function handleVote(categoryId: string, nomineeId: string) {
    if (submitted) return
    setVotes(prev => {
      const next = { ...prev, [categoryId]: nomineeId }
      return next
    })
  }

  async function handleSubmit() {
    const deviceId = getDeviceId()
    const state: VoteState = { votes, submitted: true, deviceId }
    setStoredValue(STORAGE_KEYS.AWARDS_VOTES, state)
    setSubmitted(true)

    // Submit all votes in parallel
    const promises = categories.map((category) => {
      const choice = votes[category.id]
      if (!choice) return Promise.resolve()
      return fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          scope: `awards:${category.id}`,
          choice,
        }),
      }).catch(() => {})
    })
    await Promise.all(promises)

    // Voting earns points on Rally HQ's community board (idempotent per device,
    // best-effort, points server-set). Nickname names the fan on the board.
    fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        source: 'award_vote',
        ref: 'award_vote:lets-pepper-open-2026',
        nickname: getStoredValue<string>(STORAGE_KEYS.FAN_NICKNAME, '') || null,
      }),
    }).catch(() => {})

    // Fetch tallies after submitting
    const scopes = categories.map((c) => `awards:${c.id}`).join(',')
    fetch(`/api/votes?scopes=${scopes}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tallies) setTallies(data.tallies)
      })
      .catch(() => {})
  }

  const votedCount = Object.keys(votes).length

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
              <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-4">
                Fan Vote
              </p>
              <h1 className="text-display mb-6">
                Pepper <span style={{ color: 'var(--gold)' }}>Awards</span>
              </h1>
              <p className="text-xl text-zinc-400">
                Vote for the best of the 2025 season. One vote per category. Choose wisely.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Award Categories */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="space-y-12"
              initial="initial"
              animate="animate"
              transition={{ staggerChildren: 0.15 }}
            >
              {categories.map((category) => {
                const heat = HEAT_CONFIG[category.heat as HeatLevel]
                const selectedNominee = votes[category.id]
                const scopeTallies = tallies[`awards:${category.id}`] || {}
                const totalVotes = Object.values(scopeTallies).reduce((a, b) => a + b, 0)
                const meterHeat = categoryHeatMeter(category.heat)
                const accentClass = categoryAccentClass(category.heat)

                return (
                  <motion.div
                    key={category.id}
                    variants={MOTION.variants.slideUp}
                  >
                    {/* Category Header */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-1">
                        {meterHeat && <HeatMeter heat={meterHeat} size="sm" />}
                        <p
                          className={cn('font-accent text-[0.6rem] uppercase tracking-[0.1em]', accentClass ?? 'text-zinc-500')}
                          style={!accentClass ? { color: 'var(--gold)' } : undefined}
                        >
                          {category.pepperName}
                        </p>
                      </div>
                      <h2 className="block-heading">{category.name}</h2>
                      <p className="text-zinc-400 text-sm mt-2">{category.description}</p>
                    </div>

                    {/* Nominees */}
                    <div className="grid sm:grid-cols-2 gap-3">
                      {category.nominees.map((nominee) => {
                        const isSelected = selectedNominee === nominee.id
                        const voteCount = scopeTallies[nominee.id] || 0
                        const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0

                        return (
                          <motion.button
                            key={nominee.id}
                            type="button"
                            onClick={() => handleVote(category.id, nominee.id)}
                            disabled={submitted}
                            className={cn(
                              'text-left p-4 rounded-xl border transition-all',
                              isSelected
                                ? 'border-zinc-800 bg-zinc-900/60'
                                : 'border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700',
                              submitted && 'cursor-default'
                            )}
                            whileTap={!submitted ? { scale: 0.98 } : undefined}
                          >
                            <p className={cn('font-display text-lg uppercase mb-1', isSelected ? 'text-white' : 'text-zinc-300')}>
                              {nominee.name}
                            </p>
                            {/* Reason string is RHQ-authoritative — surface it prominently */}
                            <p className="text-sm text-zinc-300 leading-snug">{nominee.reason}</p>

                            {/* Vote tally bar (shown after submission) */}
                            {submitted && totalVotes > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-zinc-500 font-accent">{voteCount} votes</span>
                                  <span className="text-zinc-500 font-accent">{pct}%</span>
                                </div>
                                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                  <motion.div
                                    className={cn('h-full rounded-full', heat.bgClass)}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
                                  />
                                </div>
                              </div>
                            )}
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>

            {/* Submit */}
            {!submitted && (
              <div className="mt-12 text-center">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={votedCount < categories.length}
                  className={cn(
                    'btn-primary',
                    votedCount < categories.length && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  Submit Votes ({votedCount}/{categories.length})
                </button>
                {votedCount < categories.length && (
                  <p className="text-xs text-zinc-600 mt-2">Vote in all categories to submit</p>
                )}
              </div>
            )}

            {/* Confirmation */}
            <AnimatePresence>
              {submitted && !AWARDS_RESULTS_REVEALED && (
                <motion.div
                  className="mt-12 bg-zinc-900/30 rounded-xl border p-8 text-center max-w-lg mx-auto"
                  style={{ borderColor: 'color-mix(in srgb, var(--gold) 30%, transparent)' }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="text-4xl mb-3">🏆</div>
                  <h3 className="font-display text-2xl uppercase mb-2" style={{ color: 'var(--gold)' }}>
                    Votes Submitted!
                  </h3>
                  <p className="text-zinc-400 text-sm">
                    Thanks for voting! Winners will be announced at the end of the season.
                  </p>
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
