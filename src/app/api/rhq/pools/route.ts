import { NextRequest } from 'next/server'
import { rhqTournamentSlug, fetchRhqPools, RhqError } from '@/lib/rhq'
import { badRequest, serverError, ok } from '../../_lib/validate'

export const runtime = 'edge'

/**
 * GET /api/rhq/pools?flavor=bell-pepper-open
 *
 * Branded server-fetch of Rally HQ pool standings. Maps the LP flavor slug to
 * its RHQ tournament slug, fetches RHQ's public pools endpoint server-side, and
 * returns shaped JSON to the LP-native RhqStandingsTable. No auth needed (public
 * read); a 404 from RHQ (tournament not yet public, or no pools assigned) is
 * normalized to an empty list so the component renders its pre-tournament state.
 */
export async function GET(request: NextRequest) {
  const flavor = request.nextUrl.searchParams.get('flavor')
  if (!flavor) return badRequest('flavor is required')

  const rhqSlug = rhqTournamentSlug(flavor)
  if (!rhqSlug) return badRequest(`Unknown flavor '${flavor}'`)

  try {
    const pools = await fetchRhqPools(rhqSlug)
    return ok({ pools })
  } catch (err) {
    if (err instanceof RhqError && err.status === 404) {
      return ok({ pools: [] })
    }
    console.error('RHQ pools fetch failed:', err)
    return serverError('Failed to load standings')
  }
}
