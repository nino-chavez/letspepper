import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Season Awards | Let's Pepper",
  description: 'Vote for the performances that defined 2026.',
  openGraph: {
    title: 'Season Awards',
    description: 'Vote for the performances that defined 2026.',
    images: [{ url: '/images/og/creative/awards.jpg', width: 1200, height: 630, alt: "Let's Pepper season awards" }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/og/creative/awards.jpg'] },
}

export default function AwardsLayout({ children }: { children: React.ReactNode }) {
  return children
}
