import { getMatchStatLeaders } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

const SERIES_EVENT = 'lets-pepper-open-2026'

/**
 * Match-level "stat leader" boards (Giant Killers / Cinderella / Dominance /
 * Clutch) for the series' latest completed tournament — derived live from RHQ
 * pool + bracket match data, so this auto-advances to each new event.
 */
export async function GET() {
  try {
    const result = await getMatchStatLeaders(SERIES_EVENT)
    return ok({ boards: result?.boards ?? [], tournamentName: result?.tournamentName ?? null })
  } catch (err) {
    console.error('Stat leaders error:', err)
    return serverError('Could not load stat leaders')
  }
}

export const runtime = 'edge'
