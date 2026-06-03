import { issueRhqFanToken, RhqKeyMissingError } from '@/lib/rhq'
import { serverError, ok } from '../../_lib/validate'

export const runtime = 'edge'

/**
 * POST /api/rhq/fan — issue an anonymous RHQ fan_token (server holds the key).
 * The browser stores the returned token and reuses it for champion picks and
 * (later) engagement points. No body required.
 */
export async function POST() {
  try {
    const fan = await issueRhqFanToken()
    return ok({ fanToken: fan.fanToken })
  } catch (err) {
    if (err instanceof RhqKeyMissingError) {
      return serverError('Predictions are not available right now')
    }
    console.error('RHQ fan issue failed:', err)
    return serverError('Could not start your prediction')
  }
}
