import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "What Pepper Are You? | Let's Pepper",
  description: 'Seven questions. One court identity.',
  openGraph: {
    title: 'What Pepper Are You?',
    description: 'Seven questions. One court identity.',
    images: [{ url: '/images/og/creative/quiz.jpg', width: 1200, height: 630, alt: 'What Pepper Are You?' }],
  },
  twitter: { card: 'summary_large_image', images: ['/images/og/creative/quiz.jpg'] },
}

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return children
}
