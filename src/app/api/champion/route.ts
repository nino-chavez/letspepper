import { NextRequest } from 'next/server'
import { resolveFanToken } from '@/lib/fan-bridge'
import { getTournamentTeams, submitChampionPick } from '@/lib/rally-hq'
import { isValidUUID, badRequest, serverError, ok } from '../_lib/validate'

/**
 * Champion pick — Rally HQ-backed (ADR-0007). Unlike the local culture props,
 * the champion pick lands in Rally HQ's one canonical predictions store keyed by
 * the device's fan_token, and auto-grades off the bracket. RHQ owns this truth;
 * this route is the thin bridge from the letspepper UI to it.
 */

/** GET ?tournament=<slug> — the champion-pick options (RHQ teams). */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('tournament')
  if (!slug) return badRequest('tournament is required')

  const teams = await getTournamentTeams(slug)
  return ok({ teams })
}

/** POST — submit a fan's champion pick. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { device_id, tournament, predicted_team_id, nickname } = body
  if (!isValidUUID(device_id)) return badRequest('Invalid device_id')
  if (typeof tournament !== 'string' || !tournament) return badRequest('tournament is required')
  if (typeof predicted_team_id !== 'string' || !predicted_team_id) {
    return badRequest('predicted_team_id is required')
  }

  const nick = typeof nickname === 'string' && nickname.trim().length > 0
    ? nickname.trim().slice(0, 30)
    : null

  // Cross-surface identity is mandatory here: a champion pick is meaningless
  // without the fan_token that places it on the unified leaderboard.
  const fanToken = await resolveFanToken(device_id, nick)
  if (!fanToken) return serverError('Could not establish a fan identity')

  const result = await submitChampionPick(tournament, fanToken, predicted_team_id)
  if (!result.ok) return badRequest(result.error ?? 'Could not submit your pick')

  return ok({ success: true, fan_token: fanToken })
}

export const runtime = 'edge'
