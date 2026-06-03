/**
 * Rally HQ integration core for Let's Pepper (server-only).
 *
 * Branded server-fetch pattern: LP route handlers (src/app/api/rhq/*) call RHQ's
 * v1 API through these helpers and return shaped JSON to LP-native components
 * themed by heat-config. The RHQ API key (added when write modules land) lives
 * ONLY here, server-side — it must never reach the browser.
 *
 * Reads (pools/bracket/schedule/teams) hit RHQ's PUBLIC v1 surface and need no
 * auth; an optional Bearer buys rate-limit headroom. Writes + auth-only reads
 * (predictions, fan tokens, engagement points, results, rankings) will route
 * through here with a Bearer from RALLY_HQ_API_KEY.
 */

import type {
  RhqPool,
  RhqTeam,
  RhqScheduleMatch,
  RhqBracketRound,
  RhqFan,
} from './types/rhq'

const RHQ_BASE = process.env.RALLY_HQ_BASE_URL ?? 'https://rallyhq.app'

/**
 * Maps a Let's Pepper flavor slug (/flavors/[slug]) to its Rally HQ tournament
 * slug. The three 2026 tournaments live under RHQ event `lets-pepper-open-2026`.
 */
export const FLAVOR_TO_RHQ_TOURNAMENT: Record<string, string> = {
  'bell-pepper-open': 'bell-pepper-open-2026',
  'jalapeno-open': 'jalapeno-open-2026',
  'poblano-open': 'poblano-open-2026',
}

/** Resolve an LP flavor slug to an RHQ tournament slug, or null if unmapped. */
export function rhqTournamentSlug(flavor: string): string | null {
  return FLAVOR_TO_RHQ_TOURNAMENT[flavor] ?? null
}

/** Non-2xx from an RHQ endpoint; carries the status so callers can branch on 404. */
export class RhqError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'RhqError'
  }
}

/**
 * Server-side GET against an RHQ public v1 endpoint. Adds a Bearer when
 * RALLY_HQ_API_KEY is set (optional for public reads). Returns the unwrapped
 * `data` payload; throws RhqError on non-2xx.
 */
async function rhqPublicGet<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const key = process.env.RALLY_HQ_API_KEY
  if (key) headers.Authorization = `Bearer ${key}`

  const res = await fetch(`${RHQ_BASE}/api/public/v1${path}`, {
    headers,
    // RHQ serves pools with Cache-Control public max-age=60; align revalidation.
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    throw new RhqError(res.status, `RHQ GET ${path} -> ${res.status}`)
  }
  const body = (await res.json()) as { data: T }
  return body.data
}

/** Pool standings (wins/losses/point-diff per team, grouped by pool). */
export function fetchRhqPools(rhqSlug: string): Promise<RhqPool[]> {
  return rhqPublicGet<RhqPool[]>(`/tournaments/${rhqSlug}/pools`)
}

/** Registered teams (name, pool, seed, status) — no captain identity in public view. */
export function fetchRhqTeams(rhqSlug: string): Promise<RhqTeam[]> {
  return rhqPublicGet<RhqTeam[]>(`/tournaments/${rhqSlug}/teams`)
}

/** Match schedule (court, matchup, status) ordered by the tournament's own ordering. */
export function fetchRhqSchedule(rhqSlug: string): Promise<RhqScheduleMatch[]> {
  return rhqPublicGet<RhqScheduleMatch[]>(`/tournaments/${rhqSlug}/schedule`)
}

/** Elimination bracket, grouped by round. Empty until pool play completes. */
export function fetchRhqBracket(rhqSlug: string): Promise<RhqBracketRound[]> {
  return rhqPublicGet<RhqBracketRound[]>(`/tournaments/${rhqSlug}/bracket`)
}

// ---------------------------------------------------------------------------
// Authenticated writes (server-only). These hit RHQ's /api/v1 surface and
// REQUIRE the Pro API key — it carries a global `write` scope, so only these
// anonymous fan-token primitives (issue token, submit champion pick) are ever
// exposed through LP routes. Never wire raw PATCH teams / score writes here.
// ---------------------------------------------------------------------------

/** Thrown when a write is attempted but RALLY_HQ_API_KEY is not configured. */
export class RhqKeyMissingError extends Error {
  constructor() {
    super('RALLY_HQ_API_KEY is not set — write modules are unavailable')
    this.name = 'RhqKeyMissingError'
  }
}

/** Server-side authed POST to RHQ's /api/v1 surface. Returns the unwrapped data. */
async function rhqAuthedPost<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.RALLY_HQ_API_KEY
  if (!key) throw new RhqKeyMissingError()

  const res = await fetch(`${RHQ_BASE}/api/v1${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new RhqError(res.status, `RHQ POST ${path} -> ${res.status}`)
  }
  const json = (await res.json()) as { data: T }
  return json.data
}

/** Issue an anonymous cross-surface fan identity (fan_token). */
export function issueRhqFanToken(): Promise<RhqFan> {
  return rhqAuthedPost<RhqFan>('/fans', {})
}

/** Submit/upsert a champion pick for a fan. Allowed until the bracket is set. */
export function submitChampionPick(
  rhqSlug: string,
  fanToken: string,
  predictedTeamId: string
): Promise<unknown> {
  return rhqAuthedPost(`/tournaments/${rhqSlug}/predictions`, {
    fanToken,
    predictedTeamId,
  })
}
