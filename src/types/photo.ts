/**
 * Photo, Video & Album types for Let's Pepper Gallery
 *
 * Simplified subset of nino-chavez-gallery's models,
 * containing only the fields needed for gallery display.
 */

export interface Photo {
  id: string
  imageKey: string
  cfImageId: string
  albumKey: string
  albumName: string
  sportType: string
  photoCategory: string
  playType: string | null
  photoDate: string | null
  uploadDate: string
  aspectRatio: number | null
}

export interface Video {
  id: string
  cfStreamId: string
  cfStreamThumbnail: string | null
  albumKey: string
  albumName: string
  title: string | null
  description: string | null
  durationSeconds: number | null
  sportType: string
  videoCategory: string
  videoDate: string | null
}

export interface Album {
  albumKey: string
  albumName: string
  photoCount: number
  videoCount: number
  coverCfImageId: string | null
  coverThumbnailUrl: string | null
  mediaType: 'photos' | 'videos' | 'mixed'
  primarySport: string
  primaryCategory: string
  earliestPhotoDate: string | null
  latestPhotoDate: string | null
  sports: string[]
  categories: string[]
}
