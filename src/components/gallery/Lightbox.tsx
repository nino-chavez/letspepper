'use client'

import { useCallback, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { cfImageUrl } from '@/lib/cloudflare-images'
import type { Photo } from '@/types/photo'

interface LightboxProps {
  photos: Photo[]
  currentIndex: number
  onClose: () => void
  onNavigate: (index: number) => void
  // Cross-page navigation (optional — defaults preserve single-page behavior):
  hasMore?: boolean                  // more pages exist beyond the loaded photos
  onLoadMore?: () => Promise<void>   // fetch + append the next page
  loadingMore?: boolean
  totalCount?: number                // total across all pages (for the counter)
  indexOffset?: number               // global index of photos[0] (for the counter)
}

export function Lightbox({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  totalCount,
  indexOffset = 0,
}: LightboxProps) {
  const photo = photos[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < photos.length - 1 || hasMore

  // Advance within the loaded list, or pull the next page when at the boundary.
  const goNext = useCallback(async () => {
    if (currentIndex < photos.length - 1) {
      onNavigate(currentIndex + 1)
    } else if (hasMore && onLoadMore && !loadingMore) {
      await onLoadMore()
      onNavigate(currentIndex + 1) // first photo of the just-loaded page
    }
  }, [currentIndex, photos.length, hasMore, onLoadMore, loadingMore, onNavigate])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!photo) return
      switch (e.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          if (hasPrev) onNavigate(currentIndex - 1)
          break
        case 'ArrowRight':
          if (hasNext) void goNext()
          break
      }
    },
    [photo, onClose, onNavigate, currentIndex, hasPrev, hasNext, goNext]
  )

  useEffect(() => {
    if (!photo) return
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [photo, handleKeyDown])

  if (!photo) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-pepper-black/95"
          onClick={onClose}
        />

        {/* Top-right actions */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {/* Download button */}
          <a
            href={cfImageUrl(photo.cfImageId, 'public')}
            download
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'p-2 rounded-full',
              'bg-pepper-charcoal/80 text-white hover:bg-pepper-charcoal',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-jalapeno'
            )}
            aria-label="Download photo"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>

          {/* Close button */}
          <button
            onClick={onClose}
            className={cn(
              'p-2 rounded-full',
              'bg-pepper-charcoal/80 text-white hover:bg-pepper-charcoal',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-jalapeno'
            )}
            aria-label="Close lightbox"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation: Previous */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className={cn(
              'absolute left-4 z-10 p-2 rounded-full',
              'bg-pepper-charcoal/80 text-white hover:bg-pepper-charcoal',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-jalapeno'
            )}
            aria-label="Previous photo"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* Navigation: Next (pulls the next page at the boundary) */}
        {hasNext && (
          <button
            onClick={() => void goNext()}
            disabled={loadingMore}
            className={cn(
              'absolute right-4 z-10 p-2 rounded-full',
              'bg-pepper-charcoal/80 text-white hover:bg-pepper-charcoal',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heat-jalapeno',
              loadingMore && 'opacity-60 cursor-wait'
            )}
            aria-label="Next photo"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={cn(loadingMore && 'animate-pulse')}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Photo */}
        <motion.div
          key={photo.id}
          className="relative w-[90vw] h-[85vh]"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Image
            src={cfImageUrl(photo.cfImageId, 'large')}
            alt={`${photo.sportType} ${photo.photoCategory} photo`}
            fill
            className="object-contain"
            sizes="90vw"
            priority
          />
        </motion.div>

        {/* Counter (global position across all pages when totalCount is known) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-accent text-xs text-text-secondary">
          {typeof totalCount === 'number'
            ? `${indexOffset + currentIndex + 1} / ${totalCount}`
            : `${currentIndex + 1} / ${photos.length}`}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
