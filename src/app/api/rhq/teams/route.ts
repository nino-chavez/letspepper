import { NextRequest } from 'next/server'
import { getRoster } from '@/lib/rally-hq'
import { rhqViewRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/teams?slug=… — the registered field for the event-page embed. */
export const GET = (request: NextRequest) => rhqViewRoute(request, 'teams', getRoster)
