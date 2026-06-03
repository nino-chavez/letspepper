import { getAwardCandidates } from '@/lib/rally-hq'
import { serverError, ok } from '../_lib/validate'

/**
 * Rally HQ-derived award candidates (ADR-0006). The objective categories (MVP,
 * Most Improved, Iron) come from match results so their nominees + reasons stay
 * correct; the awards page keeps its brand metadata and its subjective categories
 * local. Returns a map of RHQ category id -> nominees.
 */

const SERIES_EVENT = 'lets-pepper-open-2026'

export async function GET() {
  try {
    const candidates = await getAwardCandidates(SERIES_EVENT)
    return ok({ candidates })
  } catch (err) {
    console.error('Award candidates fetch error:', err)
    return serverError('Could not load award candidates')
  }
}

export const runtime = 'edge'
