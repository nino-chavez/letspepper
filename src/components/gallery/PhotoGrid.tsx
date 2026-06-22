'use client'

import { motion } from 'framer-motion'
import { PhotoCard } from './PhotoCard'
import type { Photo } from '@/types/photo'

interface PhotoGridProps {
  photos: Photo[]
  onPhotoClick?: (photo: Photo, index: number) => void
}

export function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
  return (
    <motion.div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4"
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.05 }}
    >
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          priority={index < 4}
          onClick={() => onPhotoClick?.(photo, index)}
        />
      ))}
    </motion.div>
  )
}
