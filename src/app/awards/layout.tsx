import type { Metadata } from 'next'

// Matches the share card (creative/copy/approved-copy.json, webCards.awards).
// If the vote reopens (AWARDS_VOTING_OPEN), change both.
export const metadata: Metadata = {
  title: "Season Awards | Let's Pepper",
  description: 'The 2025 season nominees. Voting is closed.',
  openGraph: {
    title: 'Season Awards',
    description: 'The 2025 season nominees. Voting is closed.',
    images: [{ url: '/images/og/creative/awards.jpg', width: 1200, height: 630, alt: "Let's Pepper season awards" }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/og/creative/awards.jpg'] },
}

export default function AwardsLayout({ children }: { children: React.ReactNode }) {
  return children
}
