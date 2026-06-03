import { NextRequest } from 'next/server'
import { fetchRhqBracket } from '@/lib/rhq'
import { rhqModuleRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/bracket?flavor=… — branded server-fetch of the RHQ elimination bracket. */
export const GET = (request: NextRequest) =>
  rhqModuleRoute(request, 'bracket', fetchRhqBracket, [])
