/**
 * Rally HQ API client (server-side only).
 *
 * Rally HQ (rallyhq.app) is the operational backend for the Let's Pepper series:
 * it owns tournament truth and — via ADR-0007 — the cross-surface FAN IDENTITY
 * that lets a single human be recognized on both letspepper.com and rallyhq.app.
 * Two domains on two Supabase projects can't share auth, so Rally HQ issues an
 * anonymous `fan_token` that this site stores per device and presents with
 * engagement writes. We hold the API key; the fan itself stays anonymous.
 *
 * Every call here is best-effort by design: a Rally HQ outage must never break a
 * local pick. Callers treat a null/throw as "no cross-surface identity this time"
 * and continue with the local-only flow.
 */

import type {
  RhqPool,
  RhqTeam,
  RhqScheduleMatch,
  RhqBracketRound,
  RhqMatch,
  RhqSummary,
} from './rhq-types'

export interface RallyFan {
  fanToken: string
  displayName: string | null
  claimed: boolean
}

const DEFAULT_RALLY_HQ_URL = 'https://rallyhq.app'

function config(): { url: string; key: string } | null {
  // The API key is the only required secret. The base URL is a constant that
  // defaults to production and is overridable only for local/staging — making it
  // a mandatory second var bought nothing but an extra way for activation to fail.
  const key = process.env.RALLY_HQ_API_KEY
  if (!key) return null
  const url = (process.env.RALLY_HQ_API_URL || DEFAULT_RALLY_HQ_URL).replace(/\/+$/, '')
  return { url, key }
}

interface RallyEnvelope<T> {
  data?: T
  error?: { message?: string }
}

async function call<T>(path: string, init: RequestInit): Promise<T | null> {
  const cfg = config()
  if (!cfg) {
    console.warn('Rally HQ env not configured; skipping cross-surface identity')
    return null
  }
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const body = (await res.json().catch(() => null)) as RallyEnvelope<T> | null
    if (!res.ok || !body?.data) {
      console.error(`Rally HQ ${init.method ?? 'GET'} ${path} failed:`, res.status, body?.error?.message)
      return null
    }
    return body.data
  } catch (err) {
    console.error(`Rally HQ ${init.method ?? 'GET'} ${path} threw:`, err)
    return null
  }
}

/** Mint a new anonymous fan identity, optionally with a nickname. */
export function issueFan(displayName: string | null): Promise<RallyFan | null> {
  return call<RallyFan>('/api/v1/fans', {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
}

/** Set/clear a fan's nickname on Rally HQ (keeps the unified leaderboard named). */
export function updateFanName(fanToken: string, displayName: string | null): Promise<RallyFan | null> {
  return call<RallyFan>(`/api/v1/fans/${fanToken}`, {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  })
}

export interface RallyTeam {
  id: string
  name: string
  seed: number | null
}

/** Fetch a tournament's teams — the champion-pick options (RHQ is the source of
 *  truth for who's actually entered). */
export async function getTournamentTeams(slug: string): Promise<RallyTeam[]> {
  const teams = await call<Array<{ id: string; name: string; seed: number | null }>>(
    `/api/v1/tournaments/${slug}/teams`,
    { method: 'GET' },
  )
  return (teams ?? []).map((t) => ({ id: t.id, name: t.name, seed: t.seed ?? null }))
}

/**
 * Submit a fan's champion pick to Rally HQ — the one canonical store that
 * auto-grades off the bracket. Returns the RHQ error message on a rejected write
 * (locked bracket, team not in tournament) so the UI can surface the real reason.
 */
export async function submitChampionPick(
  slug: string,
  fanToken: string,
  predictedTeamId: string,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = config()
  if (!cfg) return { ok: false, error: 'Rally HQ is not configured.' }
  try {
    const res = await fetch(`${cfg.url}/api/v1/tournaments/${slug}/predictions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fanToken, predictedTeamId }),
    })
    if (res.ok) return { ok: true }
    const body = (await res.json().catch(() => null)) as RallyEnvelope<unknown> | null
    return { ok: false, error: body?.error?.message ?? 'Could not submit your pick.' }
  } catch (err) {
    console.error('Rally HQ champion pick threw:', err)
    return { ok: false, error: 'Rally HQ is unreachable — try again.' }
  }
}

export interface SeasonLeaderEntry {
  rank: number
  tied: boolean
  name: string
  points: number
  events: number
  /** Tournament wins (1st-place finishes), not match wins. */
  titles: number
  podiums: number
  bestFinish: number
  trend: 'up' | 'down' | 'steady' | 'new'
}

interface RhqRankingEntry {
  displayName: string
  seasonPoints: number
  rank: number
  tied: boolean
  tournamentsPlayed: number
  trend: 'up' | 'down' | 'steady' | 'new'
  finishes: { placement: number }[]
}

/**
 * The live season leaderboard, derived by Rally HQ from match results — the
 * single source of truth, so it never drifts from the brackets. Aggregated across
 * the series via the event's `all_time` scope. Players with no scored finish yet
 * (e.g. registered-but-unplayed) are filtered out.
 */
export async function getSeasonLeaderboard(
  eventSlug: string,
  scope: 'season' | 'all_time' = 'all_time',
): Promise<SeasonLeaderEntry[]> {
  const data = await call<{ rankings: RhqRankingEntry[] }>(
    `/api/v1/events/${eventSlug}/rankings?scope=${scope}`,
    { method: 'GET' },
  )
  const rankings = data?.rankings ?? []
  return rankings
    .filter((r) => r.tournamentsPlayed > 0)
    .map((r) => ({
      rank: r.rank,
      tied: r.tied,
      name: r.displayName,
      points: r.seasonPoints,
      events: r.tournamentsPlayed,
      titles: r.finishes.filter((f) => f.placement === 1).length,
      podiums: r.finishes.filter((f) => f.placement <= 3).length,
      bestFinish: r.finishes.length > 0 ? Math.min(...r.finishes.map((f) => f.placement)) : 0,
      trend: r.trend,
    }))
}

export interface AwardNominee {
  id: string
  name: string
  reason: string
}

interface RhqAwardCategory {
  id: string
  label: string
  candidates: { playerKey: string; displayName: string; reason: string }[]
}

/**
 * Rally HQ-derived award candidates (ADR-0006), keyed by RHQ category id
 * (`mvp`, `most_improved`, `iron`). These are computed from match results — the
 * reasons ("200 season points · 9-0", "5th → 1st (+4)") are the platform's, never
 * hand-typed, so the objective awards can't go stale. Subjective categories
 * (sportsmanship, fun) have no derivable truth and stay editorial.
 */
export async function getAwardCandidates(eventSlug: string): Promise<Record<string, AwardNominee[]>> {
  const data = await call<{ categories: RhqAwardCategory[] }>(
    `/api/v1/events/${eventSlug}/award-candidates`,
    { method: 'GET' },
  )
  const out: Record<string, AwardNominee[]> = {}
  for (const cat of data?.categories ?? []) {
    out[cat.id] = cat.candidates.map((c) => ({ id: c.playerKey, name: c.displayName, reason: c.reason }))
  }
  return out
}

export interface RallyTournamentResult {
  id: string
  event: string
  date: string
  location: string
  heat: 'bell' | 'jalapeno' | 'poblano'
  results: { place: number; players: string[]; tied?: boolean }[]
}

/** Let's Pepper brand heat per event, derived from the name; defaults to bell. */
function heatFromName(name: string): 'bell' | 'jalapeno' | 'poblano' {
  const n = name.toLowerCase()
  if (n.includes('jalape')) return 'jalapeno'
  if (n.includes('poblano')) return 'poblano'
  return 'bell'
}

/** '2025-05-31' → 'May 31, 2025' (UTC, so no off-by-one from local tz). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso
}

interface RhqResults {
  results: { placements: { teamId: string; teamName: string; placement: number }[] }
}

/**
 * The series' tournament results, derived by Rally HQ — placements joined with
 * full team rosters (the v1 teams read now carries `roster`). Replaces the
 * hand-maintained results table so it stays correct and auto-includes future
 * events the moment Rally HQ resolves their brackets. Venue stays local (it's a
 * series constant, not derived truth).
 */
export async function getSeasonResults(
  eventSlug: string,
  location = 'Aurora, IL',
): Promise<RallyTournamentResult[]> {
  // The tournament list (slug/name/date) is enumerable from the rankings finishes.
  const ranks = await call<{ rankings: { finishes: { tournamentSlug: string; tournamentName: string; date: string }[] }[] }>(
    `/api/v1/events/${eventSlug}/rankings?scope=all_time`,
    { method: 'GET' },
  )
  const tourneys = new Map<string, { name: string; date: string }>()
  for (const r of ranks?.rankings ?? []) {
    for (const f of r.finishes) tourneys.set(f.tournamentSlug, { name: f.tournamentName, date: f.date })
  }

  const out = await Promise.all(
    Array.from(tourneys.entries()).map(async ([slug, meta]) => {
      // Placements + the roster join (the v1 teams read now carries `roster`).
      const [resultsData, rosterTeams] = await Promise.all([
        call<RhqResults>(`/api/v1/tournaments/${slug}/results`, { method: 'GET' }),
        call<{ id: string; name: string; roster: string[] | null }[]>(
          `/api/v1/tournaments/${slug}/teams?per_page=100`,
          { method: 'GET' },
        ),
      ])
      const rosterById = new Map<string, string[]>()
      for (const t of rosterTeams ?? []) {
        // Fall back to the team label if a roster isn't recorded.
        rosterById.set(t.id, t.roster && t.roster.length > 0 ? t.roster : [t.name])
      }

      const byPlace = new Map<number, string[][]>()
      for (const p of resultsData?.results?.placements ?? []) {
        const players = rosterById.get(p.teamId) ?? [p.teamName]
        const list = byPlace.get(p.placement) ?? []
        list.push(players)
        byPlace.set(p.placement, list)
      }
      const results = Array.from(byPlace.entries())
        .sort((a, b) => a[0] - b[0])
        .flatMap(([place, teamsAtPlace]) =>
          teamsAtPlace.map((players) => ({ place, players, tied: teamsAtPlace.length > 1 })),
        )

      return {
        iso: meta.date,
        result: {
          id: slug,
          event: meta.name,
          date: formatDate(meta.date),
          location,
          heat: heatFromName(meta.name),
          results,
        } satisfies RallyTournamentResult,
      }
    }),
  )

  // Most recent event first — sort on the ISO date, not the display string.
  return out.sort((a, b) => (a.iso < b.iso ? 1 : -1)).map((o) => o.result)
}

/**
 * Award engagement points to a fan on Rally HQ (ADR-0007 stage 4) — bingo lines,
 * award votes, etc. Idempotent on (fanToken, source, ref); Rally HQ caps the
 * value, so this is safe. Best-effort: a failure never blocks the local play.
 */
export async function submitEngagementPoints(
  fanToken: string,
  source: string,
  ref: string,
  points: number,
  eventSlug: string,
): Promise<boolean> {
  const cfg = config()
  if (!cfg) return false
  try {
    const res = await fetch(`${cfg.url}/api/v1/engagement/points`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fanToken, source, ref, points, eventSlug }),
    })
    return res.ok
  } catch (err) {
    console.error('Rally HQ engagement points threw:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Event-page tournament views (public reads).
//
// These back the in-page tournament embed on /flavors/[slug] — live pool
// standings, roster, schedule, and bracket for a SINGLE tournament during its
// event day (distinct from the series-level season leaderboard above). They hit
// RHQ's PUBLIC v1 surface, so no fan identity is involved; best-effort like the
// rest (an empty array on any failure, so the section just renders its
// pre-tournament state rather than breaking the page).
// ---------------------------------------------------------------------------

/** Live pool standings (wins/losses/point-diff per team, grouped by pool). */
export async function getPools(slug: string): Promise<RhqPool[]> {
  return (await call<RhqPool[]>(`/api/public/v1/tournaments/${slug}/pools`, { method: 'GET' })) ?? []
}

/** The registered field (name, pool, seed, status) — no captain identity. */
export async function getRoster(slug: string): Promise<RhqTeam[]> {
  return (await call<RhqTeam[]>(`/api/public/v1/tournaments/${slug}/teams`, { method: 'GET' })) ?? []
}

/** Match schedule (court, matchup, status), in the tournament's own ordering. */
export async function getSchedule(slug: string): Promise<RhqScheduleMatch[]> {
  return (
    (await call<RhqScheduleMatch[]>(`/api/public/v1/tournaments/${slug}/schedule`, { method: 'GET' })) ?? []
  )
}

/** Elimination bracket, grouped by round. Empty until pool play completes. */
export async function getBracket(slug: string): Promise<RhqBracketRound[]> {
  return (await call<RhqBracketRound[]>(`/api/public/v1/tournaments/${slug}/bracket`, { method: 'GET' })) ?? []
}

/**
 * Matches with live scores. `status` filters to 'in_progress' (live court board)
 * or 'complete' (recaps); omit for all. Carries team scores + winner, unlike the
 * upcoming-only schedule read.
 */
export async function getMatches(slug: string, status?: string): Promise<RhqMatch[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return (await call<RhqMatch[]>(`/api/public/v1/tournaments/${slug}/matches${qs}`, { method: 'GET' })) ?? []
}

/**
 * Canonical tournament summary — the authoritative `is_live` signal + champion.
 * Returns null on failure so callers can hold their default phase. This is the
 * polling fallback for the Headless-tier SSE `/live` stream.
 */
export async function getSummary(slug: string): Promise<RhqSummary | null> {
  return call<RhqSummary>(`/api/public/v1/tournaments/${slug}/summary`, { method: 'GET' })
}
