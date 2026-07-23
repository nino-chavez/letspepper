'use client'

import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { Header, Footer } from '@/components'
import { ChampionPick } from '@/components/ChampionPick'
import { RhqTeamRoster } from '@/components/rhq/RhqTeamRoster'
import { RhqScheduleSection } from '@/components/rhq/RhqScheduleSection'
import { RhqStandingsTable } from '@/components/rhq/RhqStandingsTable'
import { RhqBracketPreview } from '@/components/rhq/RhqBracketPreview'
import { usePhase, type EventPhase } from '@/components/rhq/usePhase'
import { HeatMeter } from '@/components/rhq/HeatMeter'
import { CourtBoard } from '@/components/rhq/CourtBoard'
import { cn } from '@/lib/utils'
import { tournaments, type TournamentDetail } from '@/lib/tournaments'

const heatConfig = {
  bell: { color: 'var(--heat-bell)', textClass: 'text-heat-bell', borderClass: 'border-heat-bell', bgClass: 'bg-heat-bell', glowClass: 'hover:bg-heat-bell-glow', level: 'Mild', bars: 1 },
  poblano: { color: 'var(--heat-poblano)', textClass: 'text-heat-poblano', borderClass: 'border-heat-poblano', bgClass: 'bg-heat-poblano', glowClass: 'hover:bg-heat-poblano-glow', level: 'Medium', bars: 2 },
  jalapeno: { color: 'var(--heat-jalapeno)', textClass: 'text-heat-jalapeno', borderClass: 'border-heat-jalapeno', bgClass: 'bg-heat-jalapeno', glowClass: 'hover:bg-heat-jalapeno-glow', level: 'Hot', bars: 3 },
}

/** heat → canonical anime-library character slug (dir names differ from heat keys). */
const mascotCharacter: Record<TournamentDetail['heat'], string> = {
  bell: 'bell-pepper',
  jalapeno: 'jalapeno',
  poblano: 'poblano',
}

/** heat → role pose per the library README (bell = blocker, jalapeño = all-rounder serve,
 *  poblano = libero — her dig pose is landscape, so the shared portrait slot gets menace-walk). */
const mascotRolePose: Record<TournamentDetail['heat'], string> = {
  bell: 'block',
  jalapeno: 'jump-serve',
  poblano: 'menace-walk',
}

/** Reads a `?phase=` preview override (pre|live|post) once on mount. Forces which
 *  face renders for QA/preview — it never fabricates data. */
function usePhaseOverride(): EventPhase | null {
  const [override, setOverride] = useState<EventPhase | null>(null)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('phase')
    if (p === 'pre' || p === 'live' || p === 'post') setOverride(p)
  }, [])
  return override
}

/** Pre-event countdown to first serve. Renders nothing until mounted (avoids a
 *  hydration mismatch on the live clock). */
function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  if (now === null) return null
  const diff = Math.max(0, new Date(target).getTime() - now)
  const days = Math.floor(diff / 86_400_000)
  const hrs = Math.floor((diff % 86_400_000) / 3_600_000)
  const mins = Math.floor((diff % 3_600_000) / 60_000)
  const units: [number, string][] = [[days, 'days'], [hrs, 'hrs'], [mins, 'min']]
  return (
    <div className="flex items-baseline gap-2" aria-label="Time until first serve">
      {units.map(([n, label], i) => (
        <span key={label} className="flex items-baseline gap-2">
          {i > 0 && <span className="font-display text-2xl text-zinc-600">:</span>}
          <span className="text-center">
            <span className="block font-display text-3xl sm:text-4xl text-white tabular-nums leading-none">
              {String(n).padStart(2, '0')}
            </span>
            <span className="block font-accent text-[0.6rem] uppercase tracking-[0.14em] text-zinc-500 mt-1">{label}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/** "Sunday, June 7, 2026" -> "Sun · Jun 7" (deterministic, no Date parsing — avoids SSR/tz drift). */
function shortDate(date: string): string {
  const parts = date.split(',')
  if (parts.length < 2) return date
  const wd = parts[0].trim().slice(0, 3)
  const md = parts[1].trim().split(/\s+/)
  return `${wd} · ${(md[0] || '').slice(0, 3)} ${md[1] || ''}`.trim()
}

export default function FlavorPage({ params }: { params: { slug: string } }) {
  const tournament = tournaments[params.slug]
  const override = usePhaseOverride()
  // Hooks must run before any early return.
  const { phase, champion, currentPhase } = usePhase(tournament?.rhqSlug ?? '', override)

  if (!tournament) {
    notFound()
  }

  const config = heatConfig[tournament.heat]
  const isPre = phase === 'pre'
  const isLive = phase === 'live'
  const isPost = phase === 'post'

  const mascotPose = isPost ? 'champion' : mascotRolePose[tournament.heat]
  const mascotSrc = `/images/mascots/anime/web/${mascotCharacter[tournament.heat]}-${mascotPose}-1024.webp`

  return (
    <>
      <Header />

      <main id="main-content">
        {/* ===================== HERO — cinematic, type-led, phase-aware ===================== */}
        <section className="relative min-h-[78vh] flex items-end overflow-hidden">
          {tournament.heroImage ? (
            <Image
              src={tournament.heroImage}
              alt=""
              fill
              priority
              className="object-cover object-center"
              aria-hidden="true"
            />
          ) : (
            <div
              className="absolute inset-0 opacity-40"
              style={{ background: `radial-gradient(120% 80% at 70% 10%, ${config.color}, transparent 55%)` }}
              aria-hidden="true"
            />
          )}
          {/* mascot layer — behind the scrim so the atmosphere grounds it (feet dissolve into
              the floor shadow, heat glow backlights the head); hidden below lg where the type
              column owns the full width. key re-runs the entrance when post-phase swaps the
              role pose for champion, so the flip reads as a reveal. */}
          <motion.div
            key={mascotPose}
            className="hidden lg:block absolute bottom-0 right-0 xl:right-8 h-[48vh] max-h-[520px] xl:h-[54vh] xl:max-h-[600px] aspect-[2/3] pointer-events-none select-none"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: MOTION.ease.outExpo, delay: 0.15 }}
            aria-hidden="true"
          >
            <Image
              src={mascotSrc}
              alt=""
              fill
              unoptimized
              className="object-contain object-bottom"
            />
          </motion.div>
          {/* cinematic scrim — keeps oversized type legible over the grit */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(8,8,10,0.94) 0%, rgba(8,8,10,0.7) 42%, rgba(8,8,10,0.2) 100%), linear-gradient(0deg, rgba(8,8,10,0.96) 0%, rgba(8,8,10,0) 58%)',
            }}
            aria-hidden="true"
          />

          <div className="section-container relative z-10 pt-32 pb-16">
            <Link
              href="/#series"
              className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors font-accent text-sm uppercase tracking-wider mb-8"
            >
              <span aria-hidden="true">←</span>
              <span>Back to Series</span>
            </Link>

            <motion.div
              className="space-y-5 max-w-3xl"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
            >
              {/* eyebrow + heat meter + phase status (pill = date pre, coral live, gold post) */}
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-accent text-[0.68rem] font-bold uppercase tracking-[0.16em]">
                  <span className={config.textClass}>Underground</span>
                  <span className="text-zinc-500"> · </span>
                  <span className={config.textClass}>{tournament.tagline}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <HeatMeter heat={tournament.heat} />
                  <span className="font-accent text-[0.62rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
                    {config.level}
                  </span>
                </span>
                <span
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-700 text-zinc-300 font-accent text-[0.62rem] uppercase tracking-[0.12em]"
                  style={
                    isLive
                      ? { color: 'var(--live)', borderColor: 'color-mix(in srgb, var(--live) 50%, transparent)' }
                      : isPost
                        ? { color: 'var(--gold)', borderColor: 'color-mix(in srgb, var(--gold) 45%, transparent)' }
                        : undefined
                  }
                >
                  <span
                    className={cn('h-2 w-2 rounded-full bg-zinc-500', isLive && 'animate-pulse')}
                    style={isLive ? { background: 'var(--live)' } : isPost ? { background: 'var(--gold)' } : undefined}
                  />
                  {isLive ? `Live · ${currentPhase ?? 'Pool Play'}` : isPost ? 'Final' : shortDate(tournament.date)}
                </span>
              </div>

              <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl uppercase text-white leading-[0.86]">
                {tournament.name}
              </h1>

              <p className="text-xl sm:text-2xl leading-relaxed text-zinc-300">{tournament.headline}</p>

              <div className="flex flex-wrap gap-5 font-accent text-sm text-zinc-300 pt-1">
                <span>{tournament.division.replace(' (One Division)', '')}</span>
                <span className="text-zinc-600">·</span>
                <span>{tournament.format}</span>
                <span className="text-zinc-600">·</span>
                <span>Aurora, IL</span>
              </div>

              {/* phase-conditional CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-4">
                {isPre && (
                  <>
                    <Countdown target={tournament.startsAt} />
                    <Link href="/signup" className={cn('btn-heat', config.bgClass, config.glowClass)}><span>Sign Up Your Team</span><span aria-hidden="true">→</span></Link>
                    <a href="#predict" className="font-accent text-sm uppercase tracking-wider text-zinc-300 hover:text-white transition-colors self-center">Predict the champ →</a>
                  </>
                )}
                {isLive && (
                  <>
                    <a href={`https://rallyhq.app/t/${tournament.rhqSlug}`} target="_blank" rel="noopener noreferrer" className={cn('btn-heat', config.bgClass, config.glowClass)}><span>Watch Live on Rally HQ</span><span aria-hidden="true">↗</span></a>
                    <a href="#standings" className="font-accent text-sm uppercase tracking-wider text-zinc-300 hover:text-white transition-colors self-center">Standings →</a>
                  </>
                )}
                {isPost && (
                  <>
                    {champion && (
                      <span className="inline-flex items-center gap-3">
                        <span aria-hidden="true" className="text-3xl">🏆</span>
                        <span>
                          <span className="block font-accent text-[0.6rem] uppercase tracking-[0.14em] text-zinc-500">Champion</span>
                          <span className="block font-display text-3xl uppercase text-amber-300 leading-none">{champion}</span>
                        </span>
                      </span>
                    )}
                    <a href="#bracket" className={cn('btn-heat', config.bgClass, config.glowClass)}><span>Full Bracket</span><span aria-hidden="true">→</span></a>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ===================== EVENT DETAILS ===================== */}
        <section className="section-padding bg-pepper-charcoal/30">
          <div className="section-container">
            <motion.div
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
              initial="initial"
              whileInView="animate"
              viewport={MOTION.viewport.once}
              transition={{ staggerChildren: 0.1 }}
            >
              {([
                { label: 'Date & Time', primary: tournament.date, muted: tournament.time },
                { label: 'Location', primary: tournament.location },
                { label: 'Division', primary: tournament.division },
                { label: 'Format', primary: tournament.format },
                { label: 'Prizes', list: tournament.payouts },
              ] as { label: string; primary?: string; muted?: string; list?: string[] }[]).map((d) => (
                <motion.div key={d.label} className="space-y-3" variants={MOTION.variants.slideUp}>
                  <h2 className="font-accent text-sm uppercase tracking-wider text-zinc-500">{d.label}</h2>
                  {d.primary && <p className="text-xl text-white">{d.primary}</p>}
                  {d.muted && <p className="text-zinc-400">{d.muted}</p>}
                  {d.list && (
                    <ul className="space-y-1">
                      {d.list.map((item, i) => (
                        <li key={i} className="text-zinc-400">{item}</li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ===================== LIVE DATA SPINE (phase-gated) =====================
            One page, three faces. Pre = the field (no scores). Live/Post = live
            standings + bracket. This is what kills the grid-of-zeros and the
            Field/Standings duplication: never both at once. */}

        {/* Court board — "Up Next" per court (pre) → "Happening Now" scorebugs (live). */}
        <CourtBoard slug={tournament.rhqSlug} heat={tournament.heat} phase={phase} />

        {isPre && <RhqTeamRoster slug={tournament.rhqSlug} heat={tournament.heat} />}

        {(isLive || isPost) && (
          <div id="standings">
            <RhqStandingsTable slug={tournament.rhqSlug} heat={tournament.heat} phase={phase} pollMs={isLive ? 60_000 : undefined} />
          </div>
        )}

        <RhqScheduleSection slug={tournament.rhqSlug} heat={tournament.heat} pollMs={isLive ? 60_000 : undefined} />

        {(isLive || isPost) && (
          <div id="bracket">
            <RhqBracketPreview slug={tournament.rhqSlug} heat={tournament.heat} />
          </div>
        )}

        {(isPre || isLive) && (
          <section id="predict" className="section-padding">
            <div className="section-container">
              <ChampionPick tournament={tournament.rhqSlug} tournamentName={tournament.name} deadline={tournament.startsAt} champion={champion} heat={tournament.heat} />
            </div>
          </section>
        )}

        {/* ===================== AT THE PARK (spectator guide) ===================== */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-baseline justify-between gap-4 flex-wrap mb-6">
                <h2 className="block-heading">At the Park</h2>
                <span className="font-accent text-[0.6rem] uppercase tracking-[0.1em] text-zinc-500">
                  What to know
                </span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: '📍', title: 'Getting there', body: tournament.location },
                  { icon: '🗺️', title: 'On site', body: 'Grass triples on open-field courts. On-site check-in before first serve.' },
                  { icon: '⏱️', title: 'Timing', body: `${tournament.time}. ${tournament.format}.` },
                  { icon: '📸', title: 'Media', body: 'Photo & video by Flickday Media — taggable galleries at gallery.ninochavez.co.' },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl border border-zinc-800 bg-pepper-charcoal/30 p-5">
                    <div className="text-xl" aria-hidden="true">{c.icon}</div>
                    <h3 className="font-semibold text-white mt-2">{c.title}</h3>
                    <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{c.body}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ===================== MEDIA ===================== */}
        <section className="section-padding">
          <div className="section-container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-section-heading mb-4">Media Coverage</h2>
              <p className="text-display mb-8">
                Built For <span className={config.textClass}>Players</span>. Backed By Media.
              </p>
              <ul className="space-y-4">
                {tournament.mediaPerks.map((perk, i) => (
                  <li key={i} className="flex items-start gap-3 text-lg text-zinc-400">
                    <span className={cn('mt-1.5', config.textClass)} aria-hidden="true">●</span>
                    {perk}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="section-padding bg-gradient-to-t from-pepper-charcoal/50 to-transparent">
          <div className="section-container text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={MOTION.viewport.once}
              className="space-y-6"
            >
              {/* per-event closing beat — tournaments.ts description (character-voiced) */}
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto">{tournament.description}</p>
              <p className="font-accent text-lg text-zinc-500 uppercase tracking-wider">
                Grass roots. High level. Real stakes.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <Link href="/signup" className="btn-primary"><span>Sign Up Your Team</span><span aria-hidden="true">→</span></Link>
                <a
                  href="https://gallery.ninochavez.co/Sports/Volleyball/Grass/LPO"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  aria-label="View Let's Pepper photo gallery (opens in new tab)"
                >
                  <span>View Gallery</span><span aria-hidden="true">↗</span>
                </a>
                <Link href="/#series" className="font-accent text-sm uppercase tracking-wider text-zinc-400 hover:text-white transition-colors self-center">
                  View all events →
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
export const runtime = "edge";
