import { getRankedLeaderboard, tournamentResults } from '@/lib/standings-data'
import { serverError, ok } from '../_lib/validate'

/**
 * Season leaderboard — the points race for the current season, derived from the
 * curated results. We compute this locally (not from Rally HQ's live board)
 * because the platform has the rosters but hasn't scored the bracket yet, so its
 * board lists every player at 0 and duplicates names across editions. Computing
 * from results keeps the champion at the top and one row per player. Swap back to
 * Rally HQ once it scores the live event.
 */
export async function GET() {
  try {
    // Current season = latest year present in results (matches the standings page).
    const years = Array.from(
      new Set(tournamentResults.map(t => t.date.match(/\d{4}/)?.[0]).filter(Boolean) as string[]),
    ).sort()
    const season = years.at(-1)
    // `leaderboard` = current season (fresh race, winnable by a first-time entrant);
    // `allTime` = the series board across every edition (the reason to return yearly).
    const leaderboard = getRankedLeaderboard(season)
    const allTime = getRankedLeaderboard()
    return ok({ leaderboard, allTime, season })
  } catch (err) {
    console.error('Season leaderboard error:', err)
    return serverError('Could not load the leaderboard')
  }
}

export const runtime = 'edge'
