/**
 * The Rally HQ tournament slugs this site serves, taken from `tournaments`.
 *
 * Route handlers forward a slug to Rally HQ with this site's API key, so they
 * accept only these. An unknown slug is refused here rather than passed through.
 */

import { tournaments } from './tournaments'

const KNOWN_RHQ_SLUGS: ReadonlySet<string> = new Set(Object.values(tournaments).map((t) => t.rhqSlug))

export function isKnownRhqSlug(value: unknown): value is string {
  return typeof value === 'string' && KNOWN_RHQ_SLUGS.has(value)
}
