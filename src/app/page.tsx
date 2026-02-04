import {
  Header,
  HeroSection,
  TournamentSeries,
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
        <PepperBelle />
        <EthosSection />
        <GalleryPreview />
      </main>

      <Footer />
    </>
  )
}
