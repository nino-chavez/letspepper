'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { cn } from '@/lib/utils'

interface TeamResult {
  place: number
  players: string[]
  tied?: boolean
}

interface TournamentResult {
  id: string
  event: string
  date: string
  location: string
  heat: 'bell' | 'jalapeno' | 'poblano'
  results: TeamResult[]
}

// Results data - structured for easy CMS migration later
const tournamentResults: TournamentResult[] = [
  {
    id: 'bell-pepper-2025-07-19',
    event: 'Bell Pepper Open',
    date: 'July 19, 2025',
    location: 'Aurora, IL',
    heat: 'bell',
    results: [
      { place: 1, players: ['Charlie Podgorny', 'Nate Meyer', 'Peter Zurawski'] },
      { place: 2, players: ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist'] },
      { place: 3, players: ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer'], tied: true },
      { place: 3, players: ['David Butler', 'Elijah Scott', 'Owen Randle'], tied: true },
      { place: 5, players: ['Kevin Messer', 'Mark Mir', 'Grant Adler'], tied: true },
      { place: 5, players: ['Matt Muelenickel', 'Jeremiah Aro', 'Charlie Clifford'], tied: true },
      { place: 5, players: ['Mitchell Carrera', 'Connor Jaral', 'Nolan Krygsheld'], tied: true },
      { place: 5, players: ['Joe Watkins', 'Adrian Cebula', 'Eric Tripp'], tied: true },
      { place: 9, players: ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan'], tied: true },
      { place: 9, players: ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman'], tied: true },
      { place: 9, players: ['Grant Veldman', 'Will Mensching', 'Everett Haynes'], tied: true },
      { place: 9, players: ['Kurt Vandenberg', 'Brett Vandenberg', 'Caleb Vandenberg'], tied: true },
    ],
  },
  {
    id: 'grass-launch-2025-05-31',
    event: 'Grass Launch',
    date: 'May 31, 2025',
    location: 'Aurora, IL',
    heat: 'bell',
    results: [
      { place: 1, players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'] },
      { place: 2, players: ['Everett Haynes', 'Will Mensching', 'Grant Veldman'] },
      { place: 3, players: ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer'], tied: true },
      { place: 3, players: ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist'], tied: true },
      { place: 5, players: ['Kevin Messer', 'Mark Mir', 'Grant Adler'], tied: true },
      { place: 5, players: ['David Butler', 'Elijah Scott', 'Owen Randle'], tied: true },
      { place: 5, players: ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan'], tied: true },
      { place: 5, players: ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman'], tied: true },
    ],
  },
]

const heatConfig = {
  bell: {
    color: 'var(--heat-bell)',
    textClass: 'text-heat-bell',
    borderClass: 'border-heat-bell',
    bgClass: 'bg-heat-bell',
  },
  jalapeno: {
    color: 'var(--heat-jalapeno)',
    textClass: 'text-heat-jalapeno',
    borderClass: 'border-heat-jalapeno',
    bgClass: 'bg-heat-jalapeno',
  },
  poblano: {
    color: 'var(--heat-poblano)',
    textClass: 'text-heat-poblano',
    borderClass: 'border-heat-poblano',
    bgClass: 'bg-heat-poblano',
  },
}

function PlaceBadge({ place }: { place: number }) {
  if (place === 1) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-500">
        <span className="text-lg">🥇</span>
      </div>
    )
  }
  if (place === 2) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-400/20 text-zinc-400">
        <span className="text-lg">🥈</span>
      </div>
    )
  }
  if (place === 3) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-700/20 text-amber-600">
        <span className="text-lg">🥉</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800 text-zinc-500">
      <span className="font-display text-sm">{place}</span>
    </div>
  )
}

function TournamentResultCard({ tournament }: { tournament: TournamentResult }) {
  const config = heatConfig[tournament.heat]

  // Group results by place for tied teams
  const groupedResults = tournament.results.reduce((acc, result) => {
    const existing = acc.find(g => g.place === result.place)
    if (existing) {
      existing.teams.push(result.players)
    } else {
      acc.push({ place: result.place, teams: [result.players], tied: result.tied })
    }
    return acc
  }, [] as { place: number; teams: string[][]; tied?: boolean }[])

  return (
    <motion.div
      className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={MOTION.viewport.once}
      transition={{ duration: 0.6 }}
    >
      {/* Header */}
      <div className={cn('p-6 border-b border-zinc-800/50', `border-l-4 ${config.borderClass}`)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={cn('font-accent text-xs uppercase tracking-wider mb-1', config.textClass)}>
              {tournament.date}
            </p>
            <h3 className="font-display text-2xl sm:text-3xl uppercase text-white">
              {tournament.event}
            </h3>
            <p className="text-sm text-zinc-500 mt-1">{tournament.location}</p>
          </div>
          <Link
            href={`/flavors/${tournament.heat === 'bell' ? 'bell-pepper' : tournament.heat}-open`}
            className={cn(
              'font-accent text-xs uppercase tracking-wider transition-colors',
              'text-zinc-500 hover:text-white'
            )}
          >
            View Event →
          </Link>
        </div>
      </div>

      {/* Results */}
      <div className="divide-y divide-zinc-800/50">
        {groupedResults.slice(0, 8).map((group) => (
          <div key={group.place} className="p-4 sm:p-6">
            <div className="flex items-start gap-4">
              <PlaceBadge place={group.place} />
              <div className="flex-1 min-w-0">
                {group.teams.map((team, teamIndex) => (
                  <div
                    key={teamIndex}
                    className={cn(
                      'flex flex-wrap gap-x-2 gap-y-1',
                      teamIndex > 0 && 'mt-3 pt-3 border-t border-zinc-800/30'
                    )}
                  >
                    {team.map((player, playerIndex) => (
                      <span key={player} className="text-zinc-300">
                        {player}
                        {playerIndex < team.length - 1 && (
                          <span className="text-zinc-600 ml-2">•</span>
                        )}
                      </span>
                    ))}
                  </div>
                ))}
                {group.tied && group.teams.length > 1 && (
                  <p className="text-xs text-zinc-600 mt-2 font-accent uppercase tracking-wider">
                    Tied
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Show more indicator if truncated */}
      {groupedResults.length > 8 && (
        <div className="p-4 text-center border-t border-zinc-800/50">
          <p className="text-sm text-zinc-600">
            + {groupedResults.length - 8} more placements
          </p>
        </div>
      )}
    </motion.div>
  )
}

export default function StandingsPage() {
  const [selectedSeason] = useState('2025')

  // Group tournaments by season (for future multi-season support)
  const seasonTournaments = tournamentResults.filter(t => t.date.includes(selectedSeason))

  return (
    <>
      <Header />

      <main id="main-content" className="pt-24">
        {/* Hero Section */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              className="max-w-3xl"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: MOTION.ease.outExpo }}
            >
              <p className="text-section-heading mb-4">Tournament Results</p>
              <h1 className="text-display mb-6">
                2025 <span className="text-heat-jalapeno">Standings</span>
              </h1>
              <p className="text-xl text-zinc-400">
                Results from the Let&apos;s Pepper tournament series. Every point earned, every rally won.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Season Stats Summary */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <motion.div
              className="grid sm:grid-cols-3 gap-6 mb-12"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl text-white mb-1">
                  {seasonTournaments.length}
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Events Completed
                </p>
              </div>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl text-heat-bell mb-1">
                  {seasonTournaments.reduce((acc, t) => acc + t.results.length, 0)}
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Teams Competed
                </p>
              </div>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6 text-center">
                <p className="font-display text-4xl text-heat-jalapeno mb-1">
                  1
                </p>
                <p className="font-accent text-xs uppercase tracking-wider text-zinc-500">
                  Events Remaining
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Tournament Results */}
        <section className="section-padding pt-0">
          <div className="section-container">
            <div className="space-y-8">
              {seasonTournaments.map((tournament) => (
                <TournamentResultCard key={tournament.id} tournament={tournament} />
              ))}
            </div>
          </div>
        </section>

        {/* Season Leaders (Optional - for future points system) */}
        <section className="section-padding bg-pepper-charcoal/30">
          <div className="section-container">
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
            >
              <p className="text-section-heading mb-4">Season Highlights</p>
              <h2 className="text-display">
                Top <span className="text-heat-poblano">Performers</span>
              </h2>
            </motion.div>

            <motion.div
              className="grid md:grid-cols-3 gap-6"
              initial="initial"
              whileInView="animate"
              viewport={MOTION.viewport.once}
              transition={{ staggerChildren: 0.1 }}
            >
              {/* Most Wins */}
              <motion.div
                className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🏆</span>
                  <h3 className="font-display text-xl uppercase text-white">Most Wins</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Charlie Podgorny</span>
                    <span className="font-accent text-sm text-heat-jalapeno">2 wins</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Nate Meyer</span>
                    <span className="font-accent text-sm text-heat-jalapeno">2 wins</span>
                  </div>
                </div>
              </motion.div>

              {/* Consistent Finishers */}
              <motion.div
                className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🎯</span>
                  <h3 className="font-display text-xl uppercase text-white">Top 3 Finishes</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Casey Maas</span>
                    <span className="font-accent text-sm text-heat-poblano">2x 3rd</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">Kyle Zediker</span>
                    <span className="font-accent text-sm text-heat-poblano">2x 3rd</span>
                  </div>
                </div>
              </motion.div>

              {/* Events Played */}
              <motion.div
                className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6"
                variants={MOTION.variants.slideUp}
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-2xl">🔥</span>
                  <h3 className="font-display text-xl uppercase text-white">Most Events</h3>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-zinc-500">
                    Multiple players have competed in both 2025 events. Full season stats coming after the Poblano Open.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="section-padding">
          <div className="section-container text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              className="space-y-6"
            >
              <h2 className="font-display text-3xl uppercase text-white">
                Want your name on the board?
              </h2>
              <p className="text-lg text-zinc-400 max-w-xl mx-auto">
                Join the next Let&apos;s Pepper tournament and compete for cash, content, and bragging rights.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Link href="/#series" className="btn-primary">
                  <span>View Upcoming Events</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link href="/faq" className="btn-secondary">
                  <span>How It Works</span>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
