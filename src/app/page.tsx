import {
  Header,
  HeroSection,
  TournamentSeries,
  StandingsCallout,
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
        <EthosSection />
        <GalleryPreview />
      </main>

      <Footer />
    </>
  )
}
