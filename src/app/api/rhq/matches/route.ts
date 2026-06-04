import { NextRequest } from 'next/server'
import { getMatches } from '@/lib/rally-hq'
import { badRequest, ok } from '@/app/api/_lib/validate'

export const runtime = 'edge'

/**
 * GET /api/rhq/matches?slug=…&status=in_progress|complete — matches with live
 * scores for the court board. Unlike the other /api/rhq/* reads this takes a
 * second param (status), so it doesn't use the shared rhqViewRoute helper.
 */
export const GET = async (request: NextRequest) => {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return badRequest('slug is required')
  const status = request.nextUrl.searchParams.get('status') ?? undefined
  return ok({ matches: await getMatches(slug, status) })
}
