import { supabase } from '@/lib/supabase'
import { badRequest, serverError, ok } from '../_lib/validate'

const VALID_PERSONALITIES = ['bell', 'poblano', 'jalapeno', 'habanero', 'reaper']

/** POST — increment tally for a personality */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.personality !== 'string') {
    return badRequest('personality is required')
  }

  const { personality } = body
  if (!VALID_PERSONALITIES.includes(personality)) {
    return badRequest('Invalid personality')
  }

  const { error } = await supabase.rpc('lp_increment_quiz_tally', {
    p_personality: personality,
  })

  if (error) {
    console.error('Quiz tally error:', error)
    return serverError()
  }

  return ok({ success: true })
}

/** GET — return distribution (counts + percentages) */
export async function GET() {
  const { data, error } = await supabase
    .from('lp_quiz_tallies')
    .select('personality, count')

  if (error) {
    console.error('Quiz tallies fetch error:', error)
    return serverError()
  }

  const total = data.reduce((sum, row) => sum + row.count, 0)
  const distribution = data.map((row) => ({
    personality: row.personality,
    count: row.count,
    percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
  }))

  return ok({ distribution, total })
}
export const runtime = "edge";
