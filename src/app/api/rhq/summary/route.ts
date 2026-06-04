import { NextRequest } from 'next/server'
import { getSummary } from '@/lib/rally-hq'
import { rhqViewRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/summary?slug=… — canonical is_live + champion for phase derivation. */
export const GET = (request: NextRequest) => rhqViewRoute(request, 'summary', getSummary)
