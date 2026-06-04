/**
 * Types for the Rally HQ event-page embed (live pool standings, roster, schedule,
 * bracket on /flavors/[slug]). Pure types — shared between the server-side client
 * (rally-hq.ts) and the client components, so neither pulls the other's runtime.
 *
 * These describe RHQ's public v1 read surface. Hand-authored for this fixed set;
 * generate from /api/public/v1/openapi.json (openapi-typescript) if it grows.
 */

/** One team's standing within a pool. */
export interface RhqPoolTeam {
  team_id: string
  team_name: string
  wins: number
  losses: number
  point_diff: number
}

/** A pool and its teams. */
export interface RhqPool {
  pool: string
  teams: RhqPoolTeam[]
}

/** A registered team (names only — no captain identity in the public view). */
export interface RhqTeam {
  id: string
  name: string
  pool: string | null
  seed: number | null
  status: string
}

/** A scheduled/played match on the schedule. */
export interface RhqScheduleMatch {
  id: string
  court: string | null
  team1_id: string | null
  team1_name: string
  team2_id: string | null
  team2_name: string
  status: string
  match_number: number | null
  scheduled_time: string | null
}

/**
 * A match with live scores — the `/matches` read. Distinct from RhqScheduleMatch:
 * the schedule list is upcoming-only, while matches carries scores + winner for
 * the live court board (in-progress) and recaps (complete).
 */
export interface RhqMatch {
  id: string
  round: string | null
  court: string | null
  team1_id: string | null
  team1_name: string
  team2_id: string | null
  team2_name: string
  team1_score: number | null
  team2_score: number | null
  winner_id: string | null
  winner_name: string | null
  status: string
  match_number: number | null
  scheduled_time: string | null
}

/** One bracket match. `score` is "21-18" once complete, else null. */
export interface RhqBracketMatch {
  team1_id: string | null
  team1_name: string
  team2_id: string | null
  team2_name: string
  score: string | null
  winner_id: string | null
  winner_name: string | null
  match_number: number | null
}

/** A bracket round and its matches. */
export interface RhqBracketRound {
  round: string
  matches: RhqBracketMatch[]
}
