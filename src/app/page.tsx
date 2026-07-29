import type { Metadata } from 'next'
import {
  Header,
  HeroSection,
  TournamentSeries,
  StandingsCallout,
  EthosSection,
  GalleryPreview,
  Footer,
} from '@/components'

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
}

export default function HomePage() {
  return (
    <>
      <Header />

      <main id="main-content">
        <HeroSection />
        <TournamentSeries />
        <StandingsCallout />
        <EthosSection />
        <GalleryPreview />
      </main>

      <Footer />
    </>
  )
}
