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
