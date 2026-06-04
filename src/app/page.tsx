import {
  Header,
  HeroSection,
  TournamentSeries,
  StandingsCallout,
  PepperBelle,
  EthosSection,
  GalleryPreview,
  Footer,
} from '@/components'

export default function HomePage() {
  return (
    <>
      <Header />

      <main id="main-content">
        <HeroSection />
        <TournamentSeries />
        <StandingsCallout />
        <PepperBelle />
        <EthosSection />
        <GalleryPreview />
      </main>

      <Footer />
    </>
  )
}
