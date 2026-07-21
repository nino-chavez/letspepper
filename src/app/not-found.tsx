import Link from 'next/link'
import Image from 'next/image'
import { Header, Footer } from '@/components'

export const metadata = { title: "404 | Let's Pepper" }

export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main-content" className="pt-24">
        <section className="section-padding">
          <div className="section-container">
            <div className="flex flex-col-reverse md:flex-row items-center justify-center gap-10 md:gap-16">
              <div className="text-center md:text-left max-w-md">
                <p className="text-section-heading mb-4">Out of Bounds</p>
                <h1 className="text-display mb-6">
                  Dead <span className="text-heat-jalapeno">Rally</span>
                </h1>
                <p className="text-xl text-zinc-400 mb-8">
                  This page got dug out of bounds and nobody chased it down.
                  Even Ghost Pepper&apos;s gassed. Reset, re-serve.
                </p>
                <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                  <Link href="/" className="btn-primary">
                    <span>Back to the Grass</span><span aria-hidden="true">→</span>
                  </Link>
                  <Link href="/#series" className="btn-secondary">
                    <span>View Events</span>
                  </Link>
                </div>
              </div>
              <div className="relative w-44 sm:w-52 md:w-64 aspect-[2/3] shrink-0" aria-hidden="true">
                <Image
                  src="/images/mascots/anime/web/ghost-pepper-exhausted-1024.webp"
                  alt=""
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
