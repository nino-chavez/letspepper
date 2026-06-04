import { getCommunityLeaderboard } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

/**
 * Community leaderboard — the read side of the engagement loop. Rally HQ unions
 * champion-prediction points with engagement points (the bingo + award-vote
 * writes this site already makes) per cross-surface fan identity, so the board
 * the site's writes feed is finally readable here.
 */
const SERIES_EVENT = 'lets-pepper-open-2026'

export async function GET() {
  try {
    const leaderboard = await getCommunityLeaderboard(SERIES_EVENT, 'all_time')
    return ok({ leaderboard })
  } catch (err) {
    console.error('Community leaderboard fetch error:', err)
    return serverError('Could not load the community board')
  }
}

export const runtime = 'edge'
