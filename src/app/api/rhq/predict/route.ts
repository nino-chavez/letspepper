import { NextRequest } from 'next/server'
import {
  rhqTournamentSlug,
  submitChampionPick,
  RhqKeyMissingError,
  RhqError,
} from '@/lib/rhq'
import { badRequest, serverError, ok } from '../../_lib/validate'

export const runtime = 'edge'

/**
 * POST /api/rhq/predict — submit/upsert a fan's champion pick (server holds the
 * key). Body: { flavor, fanToken, predictedTeamId }. RHQ allows changing the
 * pick until the bracket is set; a 400 from RHQ means the window closed or the
 * team is invalid.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    flavor?: unknown
    fanToken?: unknown
    predictedTeamId?: unknown
  } | null

  if (
    !body ||
    typeof body.flavor !== 'string' ||
    typeof body.fanToken !== 'string' ||
    typeof body.predictedTeamId !== 'string'
  ) {
    return badRequest('flavor, fanToken and predictedTeamId are required')
  }

  const rhqSlug = rhqTournamentSlug(body.flavor)
  if (!rhqSlug) return badRequest(`Unknown flavor '${body.flavor}'`)

  try {
    await submitChampionPick(rhqSlug, body.fanToken, body.predictedTeamId)
    return ok({ ok: true, predictedTeamId: body.predictedTeamId })
  } catch (err) {
    if (err instanceof RhqKeyMissingError) {
      return serverError('Predictions are not available right now')
    }
    if (err instanceof RhqError && err.status === 400) {
      return badRequest('The prediction window has closed for this tournament')
    }
    console.error('RHQ predict failed:', err)
    return serverError('Could not submit your pick')
  }
}
