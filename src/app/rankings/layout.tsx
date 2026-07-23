import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Power Rankings | Let's Pepper",
  description: 'The current read on the field.',
  openGraph: {
    title: 'Power Rankings',
    description: 'The current read on the field.',
    images: [{ url: '/images/og/creative/rankings.jpg', width: 1200, height: 630, alt: "Let's Pepper power rankings" }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/og/creative/rankings.jpg'] },
}

export default function RankingsLayout({ children }: { children: React.ReactNode }) {
  return children
}
