import { NextRequest } from 'next/server'
import { fetchRhqPools } from '@/lib/rhq'
import { rhqModuleRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/pools?flavor=… — branded server-fetch of RHQ pool standings. */
export const GET = (request: NextRequest) =>
  rhqModuleRoute(request, 'pools', fetchRhqPools, [])
