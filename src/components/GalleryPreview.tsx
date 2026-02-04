'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'

// Gallery images from Let's Pepper tournaments via SmugMug
const galleryImages = [
  {
    id: 1,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-MKbtxb7/0/MGmNvWrKdGFhbQHwBwWM7DkpqR8LRnQhv9kjQ59RR/L/lpo-green-pepper-2025-003-L.jpg',
    alt: 'Bell Pepper Open - intense grass volleyball action',
    event: 'Bell Pepper Open 2025'
  },
  {
    id: 2,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/KrushSuburbanSlam2025/i-V5b7DfL/0/NHcnwG9P2kjf9Mq3HjnnMPG4cLZwXTFCcJ4Vn23XF/L/krush-suburban-slam-028-L.jpg',
    alt: 'Krush Suburban Slam - grass volleyball tournament',
    event: 'Krush Suburban Slam 2025'
  },
  {
    id: 3,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/Players-Player-Appreciation-Turf-4s-20250920/i-qSK643h/0/NM9Q9GH8HdK3LRqb3JZGcmzfzRC7ZRWNs64JLNcVS/L/lifezone-05-L.jpg',
    alt: 'Player Appreciation Turf 4s - spike action',
    event: 'Player Appreciation 2025'
  },
  {
    id: 4,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/Krush-Reverse-CoEd-20250720/i-g7tTzCp/0/LkngPzKtmhwzV3njpFKqSB2qQpKHFNzfWFW8rrS6c/L/krush-reverse-coed-003-L.jpg',
    alt: 'Krush Reverse Co-Ed - competitive grass volleyball',
    event: 'Krush Reverse Co-Ed 2025'
  },
  {
    id: 5,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/2025-Cookout-Volleyball-Grass-Tournament/i-pBgXBfb/0/LfkpqrRfKQJRcttfjGxCvGcJzTk4nLGvw5VXWWRKs/L/2025-cookout-vb-004-L.jpg',
    alt: 'Cookout Grass Tournament - serve action',
    event: 'Cookout Tournament 2025'
  },
  {
    id: 6,
    src: 'https://photos.smugmug.com/Sports/Volleyball/Grass/Krush-Reverse-Co-Ed-2-20250817/i-tDWZwkq/0/NcLvqJqcQMgLPZnNvQQsBdxRx8tCjWMc9djtmKkz6/L/krush-reverse-coed-2-97-L.jpg',
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

          <a
            href="https://gallery.ninochavez.co/Sports/Volleyball/Grass/LPO"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            aria-label="View full Let's Pepper photo gallery (opens in new tab)"
          >
            <span>View Full Gallery</span>
            <span aria-hidden="true">↗</span>
          </a>
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
                src={image.src}
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
