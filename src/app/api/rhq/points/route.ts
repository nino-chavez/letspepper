import { NextRequest } from 'next/server'
import { awardRhqPoints, ENGAGEMENT_POINTS, RhqKeyMissingError } from '@/lib/rhq'
import { badRequest, serverError, ok } from '../../_lib/validate'

export const runtime = 'edge'

/**
 * POST /api/rhq/points — award engagement points for an LP action to a fan's
 * RHQ ledger. Body: { fanToken, source, ref }. The points AMOUNT is looked up
 * server-side from ENGAGEMENT_POINTS (never trusted from the client); unknown
 * sources are rejected. RHQ dedups on (fanToken, source, ref), so repeat calls
 * for the same action are safe.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    fanToken?: unknown
    source?: unknown
    ref?: unknown
  } | null

  if (
    !body ||
    typeof body.fanToken !== 'string' ||
    typeof body.source !== 'string' ||
    typeof body.ref !== 'string'
  ) {
    return badRequest('fanToken, source and ref are required')
  }

  const points = ENGAGEMENT_POINTS[body.source]
  if (points === undefined) {
    return badRequest(`Unknown engagement source '${body.source}'`)
  }

  try {
    await awardRhqPoints({
      fanToken: body.fanToken,
      source: body.source,
      ref: body.ref,
      points,
    })
    return ok({ ok: true, source: body.source, points })
  } catch (err) {
    if (err instanceof RhqKeyMissingError) {
      return serverError('Points are not available right now')
    }
    console.error('RHQ points award failed:', err)
    return serverError('Could not award points')
  }
}
