import { NextRequest } from 'next/server'
import { getBracket } from '@/lib/rally-hq'
import { rhqViewRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/bracket?slug=… — elimination bracket for the event-page embed. */
export const GET = (request: NextRequest) => rhqViewRoute(request, 'bracket', getBracket)
