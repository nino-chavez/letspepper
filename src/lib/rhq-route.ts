import { NextRequest } from 'next/server'
import { rhqTournamentSlug, RhqError } from './rhq'
import { badRequest, serverError, ok } from '@/app/api/_lib/validate'

/**
 * Shared handler for every RHQ read module route (/api/rhq/*). Parses the LP
 * flavor slug, maps it to an RHQ tournament slug, runs the module's fetcher
 * server-side, and returns `{ [key]: data }`. A 404 from RHQ (tournament not
 * public, or the surface has no rows yet) is normalized to `emptyValue` so the
 * component renders its empty/pre-tournament state instead of erroring.
 *
 * Keeping this in one place is why each route.ts is three lines — the only
 * per-route variation is the response key, the fetcher, and the empty value.
 */
export async function rhqModuleRoute<T>(
  request: NextRequest,
  key: string,
  fetcher: (rhqSlug: string) => Promise<T>,
  emptyValue: T
) {
  const flavor = request.nextUrl.searchParams.get('flavor')
  if (!flavor) return badRequest('flavor is required')

  const rhqSlug = rhqTournamentSlug(flavor)
  if (!rhqSlug) return badRequest(`Unknown flavor '${flavor}'`)

  try {
    const data = await fetcher(rhqSlug)
    return ok({ [key]: data })
  } catch (err) {
    if (err instanceof RhqError && err.status === 404) {
      return ok({ [key]: emptyValue })
    }
    console.error(`RHQ ${key} fetch failed:`, err)
    return serverError(`Failed to load ${key}`)
  }
}
