import { NextRequest } from 'next/server'
import { badRequest, ok } from '@/app/api/_lib/validate'

/**
 * Shared handler for the event-page read modules (/api/rhq/*). Takes a `?slug=`
 * (the RHQ tournament slug, supplied by the flavor page) and returns
 * `{ [key]: data }`. The rally-hq.ts fetchers are best-effort — they return an
 * empty array on any failure — so there is no error branch here; an empty result
 * renders the section's pre-tournament/empty state instead of breaking the page.
 */
export async function rhqViewRoute<T>(
  request: NextRequest,
  key: string,
  fetcher: (slug: string) => Promise<T>
) {
  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) return badRequest('slug is required')
  return ok({ [key]: await fetcher(slug) })
}
