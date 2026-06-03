import { NextRequest } from 'next/server'
import { fetchRhqSchedule } from '@/lib/rhq'
import { rhqModuleRoute } from '@/lib/rhq-route'

export const runtime = 'edge'

/** GET /api/rhq/schedule?flavor=… — branded server-fetch of the RHQ match schedule. */
export const GET = (request: NextRequest) =>
  rhqModuleRoute(request, 'schedule', fetchRhqSchedule, [])
