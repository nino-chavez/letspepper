import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isValidUUID, badRequest, forbidden, serverError, ok } from '../_lib/validate'
import { AWARDS_VOTING_OPEN } from '@/lib/awards-data'

/** POST — cast or update a vote (upsert by device_id + scope) */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { device_id, scope, choice } = body
  if (!isValidUUID(device_id)) return badRequest('Invalid device_id')
  if (typeof scope !== 'string' || !scope) return badRequest('scope is required')
  if (typeof choice !== 'string' || !choice) return badRequest('choice is required')
  if (scope.startsWith('awards:') && !AWARDS_VOTING_OPEN) return forbidden('Awards voting is closed')

  const { error } = await supabase
    .from('lp_votes')
    .upsert(
      { device_id, scope, choice },
      { onConflict: 'device_id,scope' }
    )

  if (error) {
    console.error('Vote upsert error:', error)
    return serverError()
  }

  return ok({ success: true })
}

/** GET — get vote tallies. Supports ?scope=X or ?scopes=X,Y,Z for batch */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const scope = searchParams.get('scope')
  const scopes = searchParams.get('scopes')

  const scopeList = scopes
    ? scopes.split(',').map((s) => s.trim()).filter(Boolean)
    : scope
      ? [scope]
      : []

  if (scopeList.length === 0) return badRequest('scope or scopes param required')

  const { data, error } = await supabase
    .from('lp_votes')
    .select('scope, choice')
    .in('scope', scopeList)

  if (error) {
    console.error('Vote tallies fetch error:', error)
    return serverError()
  }

  // Group by scope -> { choice: count }
  const tallies: Record<string, Record<string, number>> = {}
  for (const row of data) {
    if (!tallies[row.scope]) tallies[row.scope] = {}
    tallies[row.scope][row.choice] = (tallies[row.scope][row.choice] || 0) + 1
  }

  return ok({ tallies })
}
export const runtime = "edge";
