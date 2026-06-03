import { getSeasonResults } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

/**
 * Series tournament results — derived by Rally HQ (ADR-0006), placements joined
 * with full rosters. Replaces the hand-maintained results table; auto-includes
 * future events once Rally HQ resolves their brackets.
 */

const SERIES_EVENT = 'lets-pepper-open-2026'

export async function GET() {
  try {
    const results = await getSeasonResults(SERIES_EVENT)
    return ok({ results })
  } catch (err) {
    console.error('Season results fetch error:', err)
    return serverError('Could not load results')
  }
}

export const runtime = 'edge'
