'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { cfImageLoader } from '@/lib/cloudflare-images'

// Gallery images from Let's Pepper tournaments, by Cloudflare Images ID
// (the same IDs the shared photo database lists as cf_image_id)
const galleryImages = [
  {
    id: 1,
    cfImageId: 'MKbtxb7',
    alt: 'Bell Pepper Open - intense grass volleyball action',
    event: 'Bell Pepper Open 2025'
  },
  {
    id: 2,
    cfImageId: 'V5b7DfL',
    alt: 'Krush Suburban Slam - grass volleyball tournament',
    event: 'Krush Suburban Slam 2025'
  },
  {
    id: 3,
    cfImageId: 'qSK643h',
    alt: 'Player Appreciation Turf 4s - spike action',
    event: 'Player Appreciation 2025'
  },
  {
    id: 4,
    cfImageId: 'g7tTzCp',
    alt: 'Krush Reverse Co-Ed - competitive grass volleyball',
    event: 'Krush Reverse Co-Ed 2025'
  },
  {
    id: 5,
    cfImageId: 'pBgXBfb',
    alt: 'Cookout Grass Tournament - serve action',
    event: 'Cookout Tournament 2025'
  },
  {
    id: 6,
    cfImageId: 'tDWZwkq',
    alt: 'Krush Reverse Co-Ed 2 - athletic play',
    event: 'Krush Reverse Co-Ed 2'
  },
]

export function GalleryPreview() {
  return (
    <section
      id="gallery"
      aria-labelledby="gallery-heading"
      className="section-padding relative overflow-hidden"
    >
      <div className="section-container">
        {/* Section Header */}
        <motion.div
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={MOTION.viewport.once}
          transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
        >
          <div>
            <p className="text-section-heading mb-4">Captured Moments</p>
            <h2 id="gallery-heading" className="text-display">
              The <span className="text-heat-jalapeno">Shots</span>
            </h2>
          </div>

          <Link
            href="/gallery"
            className="btn-secondary"
            aria-label="View full Let's Pepper photo gallery"
          >
            <span>View Full Gallery</span>
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </motion.div>

        {/* Gallery Grid */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6"
          initial="initial"
          whileInView="animate"
          viewport={MOTION.viewport.once}
          transition={{ staggerChildren: 0.1 }}
        >
          {galleryImages.map((image, index) => (
            <motion.div
              key={image.id}
              className={cn(
                'group relative aspect-[4/5] rounded-xl overflow-hidden',
                'bg-pepper-charcoal',
                // Make first image larger on desktop
                index === 0 && 'md:col-span-2 md:row-span-2',
              )}
              variants={MOTION.variants.scaleIn}
              whileHover={{ scale: 1.02 }}
            >
              {/* Gallery Image */}
              <Image
                loader={cfImageLoader}
                src={image.cfImageId}
                alt={image.alt}
                fill
                className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                sizes={index === 0 ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 50vw, 33vw'}
              />

              {/* Hover Overlay */}
              <div
                className={cn(
                  'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                  'bg-gradient-to-t from-pepper-black/90 via-transparent to-transparent'
                )}
              >
                <div className="absolute bottom-4 left-4 right-4">
                  <p className="font-accent text-xs text-heat-jalapeno uppercase tracking-wider mb-1">
                    {image.event}
                  </p>
                  <p className="text-xs text-white/80 line-clamp-2">
                    {image.alt}
                  </p>
                </div>
              </div>

              {/* Border Glow on Hover */}
              <div
                className="absolute inset-0 rounded-xl border border-heat-jalapeno/0 group-hover:border-heat-jalapeno/40 transition-colors duration-300"
                aria-hidden="true"
              />
            </motion.div>
          ))}
        </motion.div>

        {/* Flickday Attribution */}
        <motion.div
          className="mt-12 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={MOTION.viewport.once}
          transition={{ delay: 0.3 }}
        >
          <p className="font-accent text-sm text-zinc-600">
            Professional photography by{' '}
            <a
              href="https://flickdaymedia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-heat-jalapeno transition-colors"
              aria-label="Flickday Media photography (opens in new tab)"
            >
              Flickday Media
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  )
}
