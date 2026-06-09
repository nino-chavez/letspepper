'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MOTION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { PhotoGrid } from '@/components/gallery/PhotoGrid'
import { Lightbox } from '@/components/gallery/Lightbox'
import { VideoCard } from '@/components/gallery/VideoCard'
import { VideoPlayer } from '@/components/gallery/VideoPlayer'
import type { Photo, Video } from '@/types/photo'

interface AlbumDetailProps {
  albumName: string
  albumKey: string
  photos: Photo[]
  videos: Video[]
  totalCount: number
  currentPage: number
  pageSize: number
  slug: string
}

export function AlbumDetail({
  albumName,
  albumKey,
  photos,
  videos,
  totalCount,
  currentPage,
  pageSize,
  slug,
}: AlbumDetailProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)
  const [zipping, setZipping] = useState(false)
  const totalPages = Math.ceil(totalCount / pageSize)
  const hasPhotos = photos.length > 0
  const hasVideos = videos.length > 0

  const openLightbox = useCallback((_photo: Photo, index: number) => {
    setLightboxIndex(index)
  }, [])

  // ── Cross-page lightbox: accumulate photos beyond the current page ──────────
  const router = useRouter()
  const [lightboxPhotos, setLightboxPhotos] = useState<Photo[]>(photos)
  const [loadedThroughPage, setLoadedThroughPage] = useState(currentPage)
  const [loadingMore, setLoadingMore] = useState(false)
  const indexOffset = (currentPage - 1) * pageSize
  const hasMorePages = indexOffset + lightboxPhotos.length < totalCount

  // Reset the accumulated list when the underlying server page changes.
  useEffect(() => {
    setLightboxPhotos(photos)
    setLoadedThroughPage(currentPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  // Pull the next page when the lightbox reaches the end of the loaded photos.
  const loadNextPage = useCallback(async () => {
    if (loadingMore) return
    const nextPage = loadedThroughPage + 1
    try {
      setLoadingMore(true)
      const res = await fetch(`/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${nextPage}`)
      if (!res.ok) return
      const { photos: more } = await res.json()
      if (Array.isArray(more) && more.length) {
        setLightboxPhotos((prev) => [...prev, ...more])
        setLoadedThroughPage(nextPage)
      }
    } catch (err) {
      console.error('[Lightbox loadNextPage]', err)
    } finally {
      setLoadingMore(false)
    }
  }, [albumKey, loadedThroughPage, loadingMore])

  // Contextual close: land on the page that holds the last-viewed photo.
  const handleLightboxClose = useCallback(() => {
    const idx = lightboxIndex
    setLightboxIndex(null)
    if (idx === null) return
    const targetPage = Math.floor((indexOffset + idx) / pageSize) + 1
    if (targetPage !== currentPage) {
      router.push(`/gallery/${slug}?page=${targetPage}`)
    }
  }, [lightboxIndex, indexOffset, pageSize, currentPage, slug, router])

  // Download the whole album as a ZIP via the shared album-zip Worker (server-signed URL).
  const handleDownloadAlbum = useCallback(async () => {
    try {
      setZipping(true)
      const res = await fetch(`/api/zip-url?albumKey=${encodeURIComponent(albumKey)}&quality=large`)
      if (!res.ok) throw new Error(`zip-url failed: ${res.status}`)
      const { url } = await res.json()
      if (!url) throw new Error('no signed url returned')
      // The Worker streams the ZIP with Content-Disposition: attachment, so this downloads
      // (rather than navigating away).
      window.location.href = url
    } catch (err) {
      console.error('[AlbumDownload]', err)
      alert('Album download could not be prepared. Please try again.')
    } finally {
      setZipping(false)
    }
  }, [albumKey])

  // Build summary line: "199 photos" / "3 videos" / "199 photos · 3 videos"
  const summaryParts: string[] = []
  if (totalCount > 0) summaryParts.push(`${totalCount} photo${totalCount !== 1 ? 's' : ''}`)
  if (videos.length > 0) summaryParts.push(`${videos.length} video${videos.length !== 1 ? 's' : ''}`)

  return (
    <>
      <Header />
      <main id="main-content" className="min-h-screen">
        {/* Album Header */}
        <section className="section-padding pt-32 pb-8">
          <div className="section-container">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: MOTION.ease.outExpo }}
            >
              <Link
                href="/gallery"
                className="inline-flex items-center gap-2 text-text-secondary hover:text-white transition-colors mb-6 font-accent text-xs uppercase tracking-wider"
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

              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl text-white mb-3">
                {albumName}
              </h1>
              <p className="text-text-secondary font-accent text-sm">
                {summaryParts.join(' \u00B7 ')}
              </p>

              {hasPhotos && (
                <button
                  type="button"
                  onClick={handleDownloadAlbum}
                  disabled={zipping}
                  className={cn(
                    'mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg',
                    'btn-primary font-accent text-xs uppercase tracking-wider',
                    'disabled:opacity-60 disabled:cursor-not-allowed'
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
                  {zipping ? 'Preparing ZIP\u2026' : 'Download album (ZIP)'}
                </button>
              )}
            </motion.div>
          </div>
        </section>

        {/* Video Grid */}
        {hasVideos && (
          <section className="section-padding pb-8">
            <div className="section-container">
              {hasPhotos && (
                <h2 className="font-accent text-xs uppercase tracking-wider text-heat-jalapeno mb-4">
                  Videos
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    onClick={() => setActiveVideo(video)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Photo Grid */}
        {hasPhotos && (
          <section className="section-padding pb-12">
            <div className="section-container">
              {hasVideos && (
                <h2 className="font-accent text-xs uppercase tracking-wider text-heat-jalapeno mb-4">
                  Photos
                </h2>
              )}
              <PhotoGrid photos={photos} onPhotoClick={openLightbox} />
            </div>
          </section>
        )}

        {/* Pagination (photos only) */}
        {totalPages > 1 && (
          <section className="section-padding pb-24">
            <div className="section-container flex justify-center gap-2">
              {currentPage > 1 && (
                <Link
                  href={`/gallery/${slug}?page=${currentPage - 1}`}
                  className={cn(
                    'px-4 py-2 rounded-lg font-accent text-xs uppercase tracking-wider',
                    'bg-pepper-charcoal text-white hover:bg-pepper-dark border border-border-subtle',
                    'transition-colors'
                  )}
                >
                  Previous
                </Link>
              )}

              <span className="px-4 py-2 font-accent text-xs text-text-secondary uppercase">
                Page {currentPage} of {totalPages}
              </span>

              {currentPage < totalPages && (
                <Link
                  href={`/gallery/${slug}?page=${currentPage + 1}`}
                  className={cn(
                    'px-4 py-2 rounded-lg font-accent text-xs uppercase tracking-wider',
                    'bg-pepper-charcoal text-white hover:bg-pepper-dark border border-border-subtle',
                    'transition-colors'
                  )}
                >
                  Next
                </Link>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />

      {/* Photo Lightbox — navigates across page boundaries; closes onto the last-viewed page */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={lightboxPhotos}
          currentIndex={lightboxIndex}
          onClose={handleLightboxClose}
          onNavigate={setLightboxIndex}
          hasMore={hasMorePages}
          onLoadMore={loadNextPage}
          loadingMore={loadingMore}
          totalCount={totalCount}
          indexOffset={indexOffset}
        />
      )}

      {/* Video Player */}
      {activeVideo && (
        <VideoPlayer
          cfStreamId={activeVideo.cfStreamId}
          title={activeVideo.title}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </>
  )
}
