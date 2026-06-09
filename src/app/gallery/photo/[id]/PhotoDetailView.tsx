'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { cfImageUrl } from '@/lib/cloudflare-images'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import type { Photo } from '@/types/photo'

interface PhotoDetailViewProps {
  photo: Photo
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown date'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PhotoDetailView({ photo }: PhotoDetailViewProps) {
  // Route the full-res image through the same-origin /api/download proxy so the browser actually
  // downloads it. A direct cross-origin `<a href download>` to imagedelivery.net is ignored by
  // browsers (the `download` attr only works same-origin) and just opens the image in a tab.
  const filename = `${photo.imageKey || photo.id}.jpg`
  const downloadUrl = `/api/download?url=${encodeURIComponent(cfImageUrl(photo.cfImageId, 'public'))}&filename=${encodeURIComponent(filename)}`

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen">
        {/* Back navigation */}
        <section className="section-padding pt-32 pb-4">
          <div className="section-container">
            <Link
              href={`/gallery`}
              className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors font-accent text-xs uppercase tracking-wider"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Back to Gallery
            </Link>
          </div>
        </section>

        {/* Photo Display */}
        <section className="section-padding pb-8">
          <div className="section-container">
            <motion.div
              className="relative w-full aspect-[3/2] max-h-[80vh] rounded-xl overflow-hidden bg-pepper-charcoal"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: MOTION.ease.outExpo }}
            >
              <Image
                src={cfImageUrl(photo.cfImageId, 'large')}
                alt={`${photo.sportType} ${photo.photoCategory} photo`}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 80vw"
                priority
              />
            </motion.div>
          </div>
        </section>

        {/* Photo Info */}
        <section className="section-padding pb-24">
          <div className="section-container max-w-3xl">
            <motion.div
              className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: MOTION.ease.outExpo }}
            >
              {/* Metadata */}
              <div className="space-y-3">
                <h1 className="font-display text-2xl text-white">
                  {photo.albumName}
                </h1>
                <div className="flex flex-wrap gap-3">
                  <span className="font-accent text-xs text-text-secondary uppercase tracking-wider">
                    {formatDate(photo.photoDate)}
                  </span>
                  {photo.playType && (
                    <span className="font-accent text-xs text-heat-jalapeno uppercase tracking-wider">
                      {photo.playType}
                    </span>
                  )}
                  <span className="font-accent text-xs text-text-muted uppercase tracking-wider">
                    {photo.sportType} &middot; {photo.photoCategory}
                  </span>
                </div>
              </div>

              {/* Download */}
              <a
                href={downloadUrl}
                download={`${photo.imageKey || photo.id}.jpg`}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg',
                  'btn-primary font-accent text-xs uppercase tracking-wider',
                  'shrink-0'
                )}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Download
              </a>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
