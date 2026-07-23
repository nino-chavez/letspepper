import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Gallery | Let's Pepper",
  description:
    'Professional action sports photography from Let\'s Pepper grassroots volleyball tournaments. High-intensity captures from the Bell Pepper Open, Jalapeño Open, and more.',
  openGraph: {
    title: "Gallery | Let's Pepper",
    description:
      'Professional action sports photography from Let\'s Pepper grassroots volleyball tournaments.',
    type: 'website',
    siteName: "Let's Pepper",
    images: [{
      url: '/images/og/creative/gallery.jpg',
      width: 1200,
      height: 630,
      alt: "Let's Pepper full gallery",
    }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/images/og/creative/gallery.jpg'],
  },
}

export default function GalleryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
