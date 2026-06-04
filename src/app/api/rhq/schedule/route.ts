import { NextRequest } from 'next/server'
import { getSchedule } from '@/lib/rally-hq'
import { rhqViewRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/schedule?slug=… — match schedule for the event-page embed. */
export const GET = (request: NextRequest) => rhqViewRoute(request, 'schedule', getSchedule)
