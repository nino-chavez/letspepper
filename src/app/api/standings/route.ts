import { getSeasonLeaderboard } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

/**
 * Season leaderboard — derived live by Rally HQ from match results (ADR-0006).
 * Replaces the hand-maintained standings: the board is now the platform's truth,
 * so it stays correct as the season plays out instead of going stale.
 */

// The series' current edition; `all_time` aggregates every edition sharing the
// series key (so 2025 results roll into the season-long board).
const SERIES_EVENT = 'lets-pepper-open-2026'

export async function GET() {
  try {
    const leaderboard = await getSeasonLeaderboard(SERIES_EVENT, 'all_time')
    return ok({ leaderboard })
  } catch (err) {
    console.error('Season leaderboard fetch error:', err)
    return serverError('Could not load the leaderboard')
  }
}

export const runtime = 'edge'
