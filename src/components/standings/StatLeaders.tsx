'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import type { StatBoard } from '@/lib/match-stats'

export function StatLeaders() {
  const [boards, setBoards] = useState<StatBoard[]>([])
  const [tournamentName, setTournamentName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/stat-leaders')
      .then((r) => r.json())
      .then((d) => {
        setBoards(Array.isArray(d.boards) ? d.boards : [])
        setTournamentName(typeof d.tournamentName === 'string' ? d.tournamentName : null)
      })
      .catch(() => setBoards([]))
      .finally(() => setLoaded(true))
  }, [])

  if (loaded && boards.every((b) => b.entries.length === 0)) return null
  if (!loaded) return null

  return (
    <section className="section-padding pt-0">
      <div className="section-container">
        <div className="mb-8">
          <p className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500 mb-2">
            Beyond the Bracket
          </p>
          <h2 className="block-heading">
            Stat <span className="text-heat-jalapeno">Leaders</span>
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {tournamentName ? `The ${tournamentName}, by the numbers.` : 'By the numbers.'}
          </p>
        </div>

        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          initial="initial"
          whileInView="animate"
          viewport={MOTION.viewport.once}
          transition={{ staggerChildren: 0.08 }}
        >
          {boards.filter((b) => b.entries.length > 0).map((b) => (
            <motion.div
              key={b.key}
              className="bg-zinc-900/30 rounded-xl border border-zinc-800 p-6"
              variants={MOTION.variants.slideUp}
            >
              <h3 className="font-display text-xl uppercase text-white">{b.title}</h3>
              <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-accent mb-4">{b.blurb}</p>
              <ol className="space-y-3">
                {b.entries.map((e, i) => (
                  <li key={e.team} className="flex items-start gap-3">
                    <span
                      className="font-display text-lg leading-none pt-0.5 text-zinc-600"
                      style={i === 0 ? { color: 'var(--gold)' } : i === 1 ? { color: '#d4d4d8' } : undefined}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-zinc-200 truncate" style={i === 0 ? { color: 'var(--gold)' } : undefined}>
                          {e.team}
                        </span>
                        <span className="font-accent text-sm text-heat-jalapeno flex-shrink-0">
                          {b.key === 'cinderella' || b.key === 'dominance' ? (e.value > 0 ? `+${e.value}` : e.value) : e.value}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 leading-snug">{e.detail}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
