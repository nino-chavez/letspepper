import { NextRequest } from 'next/server'
import { fetchRhqTeams } from '@/lib/rhq'
import { rhqModuleRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/teams?flavor=… — branded server-fetch of the RHQ team roster. */
export const GET = (request: NextRequest) =>
  rhqModuleRoute(request, 'teams', fetchRhqTeams, [])
