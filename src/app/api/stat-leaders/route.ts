import { getStatLeaders } from '@/lib/match-stats'
import { serverError, ok } from '../_lib/validate'

/**
 * Match-level "stat leader" boards (Giant Killers / Cinderella / Dominance / Clutch)
 * for the 2026 Bell Pepper Open — derived from the captured pool + bracket matches.
 */
export async function GET() {
  try {
    return ok({ boards: getStatLeaders() })
  } catch (err) {
    console.error('Stat leaders error:', err)
    return serverError('Could not load stat leaders')
  }
}

export const runtime = 'edge'
