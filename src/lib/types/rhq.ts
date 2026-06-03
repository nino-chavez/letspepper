/**
 * Shapes returned by Rally HQ's public v1 API, consumed by the Let's Pepper embed.
 *
 * Hand-authored for the public read surface (pools/teams/schedule/bracket). When the
 * embed adds more endpoints, replace these with types generated from RHQ's
 * /api/public/v1/openapi.json via openapi-typescript — at that breadth hand-copying
 * rots against the spec. For this fixed read surface, codegen tooling would be
 * over-engineering; these stay the source of truth.
 */

/** One team's standing within a pool (GET …/pools). */
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

/** A registered team (GET …/teams) — names only, no captain identity in the public view. */
export interface RhqTeam {
  id: string
  name: string
  pool: string | null
  seed: number | null
  status: string
}

/** A scheduled/played match on the schedule (GET …/schedule). */
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

/** One bracket match (GET …/bracket). `score` is "21-18" once complete, else null. */
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
