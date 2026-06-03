/**
 * Shapes returned by Rally HQ's public v1 API, consumed by the Let's Pepper embed.
 *
 * Hand-authored for the pools surface (the first embed module). When the embed
 * fans out to bracket/schedule/teams/matches, replace these with types generated
 * from RHQ's /api/public/v1/openapi.json via openapi-typescript — at that breadth
 * hand-copying rots against the spec. For a single 5-field payload, codegen tooling
 * would be over-engineering; this stays the source of truth until the second module.
 */

/** One team's standing within a pool (GET /api/public/v1/tournaments/:slug/pools). */
export interface RhqPoolTeam {
  team_id: string
  team_name: string
  wins: number
  losses: number
  point_diff: number
}

/** A pool and its teams, as returned by the public pools endpoint. */
export interface RhqPool {
  pool: string
  teams: RhqPoolTeam[]
}
