import { NextRequest } from 'next/server'
import { getPools } from '@/lib/rally-hq'
import { rhqViewRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/pools?slug=… — live pool standings for the event-page embed. */
export const GET = (request: NextRequest) => rhqViewRoute(request, 'pools', getPools)
