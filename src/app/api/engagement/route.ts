import { resolveFanToken } from '@/lib/fan-bridge'
import { submitEngagementPoints } from '@/lib/rally-hq'
import { isValidUUID, badRequest, serverError, ok } from '../_lib/validate'

/**
 * Award engagement points (ADR-0007 stage 4) — bingo wins, award votes, etc.
 * Resolves the device's cross-surface fan_token, then posts the (capped,
 * idempotent) award to Rally HQ so it rides the unified community leaderboard.
 * The points value is the consumer's; Rally HQ owns the store and caps it.
 */

// The series event the points count toward (the community board scopes by it).
const SERIES_EVENT = 'lets-pepper-open-2026'

// Allowlist of sources + their point values, so the client can't inflate them.
const POINTS: Record<string, number> = {
  bingo: 10,
  award_vote: 5,
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { device_id, source, ref, nickname } = body
  if (!isValidUUID(device_id)) return badRequest('Invalid device_id')
  if (typeof source !== 'string' || !(source in POINTS)) return badRequest('Unknown source')
  if (typeof ref !== 'string' || !ref) return badRequest('ref is required')

  const nick = typeof nickname === 'string' && nickname.trim().length > 0
    ? nickname.trim().slice(0, 30)
    : null

  const fanToken = await resolveFanToken(device_id, nick)
  if (!fanToken) return serverError('Could not establish a fan identity')

  const awarded = await submitEngagementPoints(fanToken, source, ref, POINTS[source], SERIES_EVENT)
  return ok({ success: awarded, fan_token: fanToken })
}

export const runtime = 'edge'
