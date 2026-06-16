/**
 * Gallery Data Fetching — Server-side only
 *
 * Queries the shared Supabase database (same as nino-chavez-gallery)
 * scoped to Let's Pepper tournament albums.
 */

import { supabase } from './supabase'
import type { Photo, Video, Album } from '@/types/photo'
import type { VotablePhoto } from './photo-vote-data'

/** Columns needed for photo display (avoids fetching embeddings/heavy data) */
const PHOTO_COLUMNS =
  'photo_id, image_key, cf_image_id, album_key, album_name, sport_type, photo_category, play_type, aspect_ratio, photo_date, upload_date'

/**
 * Fetch LPO album keys dynamically from album_settings.
 * New albums are added via SQL (`gallery_scope = 'lpo'`) — no code deploy needed.
 */
async function fetchLPOAlbumKeys(): Promise<string[]> {
  const { data, error } = await supabase
    .from('album_settings')
    .select('album_key')
    .eq('gallery_scope', 'lpo')

  if (error) {
    console.error('[Gallery] Error fetching LPO album keys:', error.message)
    return []
  }

  return (data || []).map((row) => row.album_key)
}

// ---------------------------------------------------------------------------
// Album queries
// ---------------------------------------------------------------------------

export async function fetchLPOAlbums(): Promise<Album[]> {
  const albumKeys = await fetchLPOAlbumKeys()
  if (albumKeys.length === 0) return []

  const [photosResult, videosResult] = await Promise.all([
    supabase
      .from('albums_summary')
      .select('*')
      .in('album_key', albumKeys)
      .order('latest_photo_date', { ascending: false, nullsFirst: false }),
    supabase
      .from('videos_summary')
      .select('*')
      .in('album_key', albumKeys),
  ])

  if (photosResult.error) {
    console.error('[Gallery] Error fetching photo albums:', photosResult.error.message)
  }
  if (videosResult.error) {
    console.error('[Gallery] Error fetching video albums:', videosResult.error.message)
  }

  const photoAlbums = photosResult.data || []
  const videoAlbums = videosResult.data || []

  // Index video data by album_key for fast lookup
  const videoMap = new Map(videoAlbums.map((v) => [v.album_key, v]))

  // Build merged album list from photo albums
  const merged = new Map<string, Album>()

  for (const row of photoAlbums) {
    const video = videoMap.get(row.album_key)
    const videoCount = video ? parseInt(video.video_count) || 0 : 0
    const photoCount = parseInt(row.photo_count) || 0
    merged.set(row.album_key, {
      albumKey: row.album_key,
      albumName: row.album_name || 'Unknown Album',
      photoCount,
      videoCount,
      coverCfImageId: row.cover_cf_image_id ?? null,
      coverThumbnailUrl: null,
      mediaType: videoCount > 0 ? 'mixed' : 'photos',
      primarySport: row.primary_sport || 'volleyball',
      primaryCategory: row.primary_category || 'action',
      earliestPhotoDate: row.earliest_photo_date,
      latestPhotoDate: row.latest_photo_date,
      sports: row.sports || [],
      categories: row.categories || [],
    })
  }

  // Add video-only albums (not in albums_summary)
  for (const row of videoAlbums) {
    if (!merged.has(row.album_key)) {
      merged.set(row.album_key, {
        albumKey: row.album_key,
        albumName: row.album_name || 'Unknown Album',
        photoCount: 0,
        videoCount: parseInt(row.video_count) || 0,
        coverCfImageId: null,
        coverThumbnailUrl: row.cover_thumbnail_url ?? null,
        mediaType: 'videos',
        primarySport: 'volleyball',
        primaryCategory: 'highlights',
        earliestPhotoDate: row.earliest_video_date ?? null,
        latestPhotoDate: row.latest_video_date ?? null,
        sports: ['volleyball'],
        categories: ['highlights'],
      })
    }
  }

  return Array.from(merged.values())
}

// ---------------------------------------------------------------------------
// Photo queries
// ---------------------------------------------------------------------------

interface FetchPhotosOptions {
  albumKey: string
  page?: number
  pageSize?: number
}

export async function fetchAlbumPhotos(
  options: FetchPhotosOptions
): Promise<{ photos: Photo[]; totalCount: number }> {
  const { albumKey, page = 1, pageSize = 48 } = options
  const offset = (page - 1) * pageSize

  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from('photo_metadata')
      .select(PHOTO_COLUMNS)
      .eq('album_key', albumKey)
      .not('sharpness', 'is', null)
      .order('upload_date', { ascending: false })
      .range(offset, offset + pageSize - 1),
    supabase
      .from('photo_metadata')
      .select('photo_id', { count: 'exact', head: true })
      .eq('album_key', albumKey)
      .not('sharpness', 'is', null),
  ])

  if (error) {
    console.error('[Gallery] Error fetching album photos:', error.message)
    return { photos: [], totalCount: 0 }
  }

  return {
    photos: (data || []).map(transformRow),
    totalCount: count || 0,
  }
}

/**
 * Photo-of-the-season vote candidates — real Let's Pepper gallery photos, not
 * placeholders. Curated by the photography project's own classification: the
 * highest quality_score photos are the season's best-moment set (no separate
 * curation table needed). quality_score is the weighted blend the gallery uses
 * for "Best Photos" (sharpness .35 / composition .30 / emotional .25 / exposure
 * .10); photo_date breaks ties.
 */
export async function fetchVotablePhotos(limit = 12): Promise<VotablePhoto[]> {
  const albumKeys = await fetchLPOAlbumKeys()
  if (albumKeys.length === 0) return []

  const { data, error } = await supabase
    .from('photo_metadata')
    .select('photo_id, cf_image_id, album_name, play_type, photo_category')
    .in('album_key', albumKeys)
    .not('cf_image_id', 'is', null)
    .not('sharpness', 'is', null)
    .order('quality_score', { ascending: false, nullsFirst: false })
    .order('photo_date', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error || !data) {
    if (error) console.error('[Gallery] Error fetching votable photos:', error.message)
    return []
  }

  return data.map((p) => ({
    id: p.photo_id,
    cfImageId: p.cf_image_id,
    // Short descriptor from the photo's own classification.
    caption: titleCase(p.play_type) || titleCase(p.photo_category) || 'Season highlight',
    // "Bell Pepper Open – Official Gallery - Jan 1" / "Grass Launch | Open Triples
    // - Jan 1" → "Bell Pepper Open" / "Grass Launch" (strip the gallery suffix).
    event: (p.album_name || 'Let\'s Pepper').split(/\s+[–|-]\s+/)[0].trim(),
    photographer: 'Flickday Media',
  }))
}

function titleCase(s: string | null): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, ' ')
}

export async function fetchPhoto(photoId: string): Promise<Photo | null> {
  const { data, error } = await supabase
    .from('photo_metadata')
    .select(PHOTO_COLUMNS)
    .eq('photo_id', photoId)
    .single()

  if (error || !data) return null
  return transformRow(data)
}

// ---------------------------------------------------------------------------
// Video queries
// ---------------------------------------------------------------------------

export async function fetchAlbumVideos(albumKey: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from('video_metadata')
    .select(
      'video_id, cf_stream_id, cf_stream_thumbnail, album_key, album_name, title, description, duration_seconds, sport_type, video_category, video_date'
    )
    .eq('album_key', albumKey)
    .order('upload_date', { ascending: false })

  if (error) {
    console.error('[Gallery] Error fetching album videos:', error.message)
    return []
  }

  return (data || []).map((row) => ({
    id: row.video_id as string,
    cfStreamId: row.cf_stream_id as string,
    cfStreamThumbnail: (row.cf_stream_thumbnail as string) || null,
    albumKey: row.album_key as string,
    albumName: (row.album_name as string) || 'Unknown Album',
    title: (row.title as string) || null,
    description: (row.description as string) || null,
    durationSeconds: (row.duration_seconds as number) || null,
    sportType: (row.sport_type as string) || 'volleyball',
    videoCategory: (row.video_category as string) || 'highlights',
    videoDate: (row.video_date as string) || null,
  }))
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function fetchGalleryStats(): Promise<{
  totalPhotos: number
  totalAlbums: number
}> {
  const albums = await fetchLPOAlbums()
  const totalPhotos = albums.reduce((sum, a) => sum + a.photoCount, 0)
  return { totalPhotos, totalAlbums: albums.length }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function transformRow(row: Record<string, unknown>): Photo {
  return {
    id: row.photo_id as string,
    imageKey: row.image_key as string,
    cfImageId: row.cf_image_id as string,
    albumKey: row.album_key as string,
    albumName: row.album_name as string,
    sportType: row.sport_type as string,
    photoCategory: row.photo_category as string,
    playType: (row.play_type as string) || null,
    photoDate: (row.photo_date as string) || null,
    uploadDate: row.upload_date as string,
    aspectRatio: (row.aspect_ratio as number) || null,
  }
}
