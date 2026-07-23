import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Season Standings | Let's Pepper",
  description: 'Events. Points. Podiums.',
  openGraph: {
    title: 'Season Standings',
    description: 'Events. Points. Podiums.',
    images: [{ url: '/images/og/creative/standings.jpg', width: 1200, height: 630, alt: "Let's Pepper season standings" }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/og/creative/standings.jpg'] },
}

export default function StandingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
