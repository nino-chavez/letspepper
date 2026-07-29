import type { Metadata } from 'next'
import { nextOpenEvent } from '@/lib/tournaments'

/**
 * Title and description track whether anything is actually open for registration.
 * A static "register your team for the next tournament" line kept promising an
 * open form in search results after the only remaining event was cancelled — the
 * same failure the event page's own description had.
 */
export function generateMetadata(): Metadata {
  const open = nextOpenEvent(new Date().toISOString().split('T')[0])

  return {
    title: open ? 'Team Registration' : 'Team Registration — Closed',
    description: open
      ? `Register your grass triples team for the ${open.name} on ${open.date} in Aurora, Illinois.`
      : "No Let's Pepper event is open for registration right now. Season results and next season's dates are at letspepper.com.",
    alternates: {
      canonical: '/signup',
    },
  }
}

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children
}
