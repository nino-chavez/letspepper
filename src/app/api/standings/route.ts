import { getRankedLeaderboard, tournamentResults, type TournamentResult } from '@/lib/standings-data'
import { getSeasonResults } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

/**
 * Season leaderboard — the points race, computed from tournament results. Rally
 * HQ now scores the brackets, so we derive from its live results (placements +
 * rosters) and fall back to the local snapshot only when RHQ is unreachable. The
 * points race itself is computed here, not read from RHQ's board, because this
 * board merges name-variants into one row and applies the series' own point
 * system — both of which live in getRankedLeaderboard.
 */
const SERIES_EVENT = 'lets-pepper-open-2026'

export async function GET() {
  try {
    // RHQ-primary, snapshot-fallback (see standings-data.ts).
    let results: TournamentResult[] = tournamentResults
    try {
      const live = await getSeasonResults(SERIES_EVENT)
      if (live.length > 0) results = live
    } catch {
      /* RHQ unreachable — fall back to the offline snapshot. */
    }

    // Current season = latest year present in results (matches the standings page).
    const years = Array.from(
      new Set(results.map(t => t.date.match(/\d{4}/)?.[0]).filter(Boolean) as string[]),
    ).sort()
    const season = years.at(-1)
    // `leaderboard` = current season (fresh race, winnable by a first-time entrant);
    // `allTime` = the series board across every edition (the reason to return yearly).
    const leaderboard = getRankedLeaderboard(season, results)
    const allTime = getRankedLeaderboard(undefined, results)
    return ok({ leaderboard, allTime, season, seasons: years.length, events: results.length })
  } catch (err) {
    console.error('Season leaderboard error:', err)
    return serverError('Could not load the leaderboard')
  }
}

export const runtime = 'edge'
