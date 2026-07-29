import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Inter, Space_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const spaceMono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-accent',
  display: 'swap',
})

export const metadata: Metadata = {
  // Absolute base for the opengraph-image convention's generated og:image URLs.
  metadataBase: new URL('https://letspepper.com'),
  title: {
    default: "Let's Pepper | Grass Volleyball Tournament Series",
    template: "%s | Let's Pepper",
  },
  description:
    'A community-powered circuit for high-level grass volleyball in Chicagoland.',
  keywords: [
    'volleyball',
    'grass volleyball',
    'beach volleyball',
    '3v3 volleyball',
    'tournament',
    'grassroots sports',
    'competitive volleyball',
  ],
  authors: [{ name: "Let's Pepper" }],
  creator: "Let's Pepper",
  openGraph: {
    title: "Let's Pepper | Grass Volleyball Tournament Series",
    description:
      'A community-powered circuit for high-level grass volleyball in Chicagoland.',
    type: 'website',
    locale: 'en_US',
    siteName: "Let's Pepper",
  },
  twitter: {
    card: 'summary_large_image',
    title: "Let's Pepper | Grass Volleyball Tournament Series",
    description:
      'A community-powered circuit for high-level grass volleyball in Chicagoland.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const organizationStructuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SportsOrganization',
        '@id': 'https://letspepper.com/#organization',
        name: "Let's Pepper",
        url: 'https://letspepper.com',
        logo: 'https://letspepper.com/icon.png',
        sameAs: [
          'https://www.instagram.com/letspepper.open/',
          'https://www.facebook.com/people/Lets-Pepper-Open/61572115795472/',
        ],
        areaServed: 'Chicagoland',
        sport: 'Volleyball',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://letspepper.com/#website',
        name: "Let's Pepper",
        url: 'https://letspepper.com',
        publisher: { '@id': 'https://letspepper.com/#organization' },
      },
    ],
  }

  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="bg-pepper-black text-white antialiased">
        <script
          id="organization-jsonld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationStructuredData).replace(/</g, '\\u003c'),
          }}
        />
        {/* Grain Overlay */}
        <div className="grain-overlay" aria-hidden="true" />

        {/* Main Content */}
        {children}

        {/* Cloudflare Web Analytics */}
        <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "ee3d5f84b15b458aa4ba1e01ccaae83d"}'
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
