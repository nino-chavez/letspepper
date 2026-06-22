'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { cfImageUrl } from '@/lib/cloudflare-images'
import type { Photo } from '@/types/photo'

interface PhotoCardProps {
  photo: Photo
  sizes?: string
  onClick?: () => void
  /** Above-the-fold cards: eager-load the image and skip the fade-in so the LCP isn't gated by hydration. */
  priority?: boolean
}

export function PhotoCard({ photo, sizes, onClick, priority = false }: PhotoCardProps) {
  const src = cfImageUrl(photo.cfImageId, 'grid')

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative aspect-[3/4] rounded-lg overflow-hidden w-full',
        'bg-pepper-charcoal cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-jalapeno'
      )}
      variants={{
        initial: { opacity: 0, scale: 0.95 },
        animate: { opacity: 1, scale: 1 },
      }}
      initial={priority ? false : undefined}
      whileHover={{ scale: 1.02 }}
    >
      <Image
        src={src}
        alt={`${photo.sportType} ${photo.photoCategory} photo`}
        fill
        priority={priority}
        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
        sizes={sizes || '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw'}
      />

      {/* Hover overlay */}
      <div
        className={cn(
          'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          'bg-gradient-to-t from-pepper-black/80 via-transparent to-transparent'
        )}
      >
        {photo.playType && (
          <div className="absolute bottom-3 left-3">
            <span className="font-accent text-[10px] text-heat-jalapeno uppercase tracking-wider">
              {photo.playType}
            </span>
          </div>
        )}
      </div>
    </motion.button>
  )
}
