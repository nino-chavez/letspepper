import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Inter, Space_Mono } from 'next/font/google'
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
  title: "Let's Pepper | Underground Grassroots Volleyball",
  description:
    'Underground. Unfiltered. Unapologetically competitive. A community-powered circuit of high-level grass volleyball tournaments.',
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
    title: "Let's Pepper | Underground Grassroots Volleyball",
    description:
      'Underground. Unfiltered. Unapologetically competitive. A community-powered circuit of high-level grass volleyball tournaments.',
    type: 'website',
    locale: 'en_US',
    siteName: "Let's Pepper",
  },
  twitter: {
    card: 'summary_large_image',
    title: "Let's Pepper | Underground Grassroots Volleyball",
    description:
      'Underground. Unfiltered. Unapologetically competitive. A community-powered circuit of high-level grass volleyball tournaments.',
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
  return (
    <html
      lang="en"
      className={`${bebasNeue.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="bg-pepper-black text-white antialiased">
        {/* Grain Overlay */}
        <div className="grain-overlay" aria-hidden="true" />

        {/* Main Content */}
        {children}
      </body>
    </html>
  )
}
