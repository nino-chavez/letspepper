'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
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
}

export function AlbumDetail({
  albumName,
  albumKey,
  photos,
  videos,
  totalCount,
}: AlbumDetailProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [activeVideo, setActiveVideo] = useState<Video | null>(null)
  const [zipping, setZipping] = useState(false)
  const hasPhotos = totalCount > 0
  const hasVideos = videos.length > 0

  const openLightbox = useCallback((_photo: Photo, index: number) => {
    setLightboxIndex(index)
  }, [])

  // ── One growing photo list feeds both the grid and the lightbox ─────────────
  // The first page is server-rendered; "Load more" appends each subsequent page
  // client-side, so the video grid above never re-renders and the lightbox can
  // walk past page boundaries without a navigation. (The API paginates at 48,
  // matching the server's initial fetch, so page N is a clean continuation.)
  const [loadedPhotos, setLoadedPhotos] = useState<Photo[]>(photos)
  const [nextPage, setNextPage] = useState(2)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMore = loadedPhotos.length < totalCount

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    try {
      setLoadingMore(true)
      const res = await fetch(`/api/album-photos?albumKey=${encodeURIComponent(albumKey)}&page=${nextPage}`)
      if (!res.ok) return
      const { photos: more } = await res.json()
      if (Array.isArray(more) && more.length) {
        setLoadedPhotos((prev) => [...prev, ...more])
        setNextPage((p) => p + 1)
      }
    } catch (err) {
      console.error('[Gallery loadMore]', err)
    } finally {
      setLoadingMore(false)
    }
  }, [albumKey, nextPage, loadingMore, hasMore])

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

              {/* Jump chips \u2014 skip the video wall and land straight on the
                  photos (photography-first), or vice-versa. Only meaningful
                  when both media types are present. */}
              {hasPhotos && hasVideos && (
                <nav
                  aria-label="Jump to media type"
                  className="mt-5 flex flex-wrap gap-2"
                >
                  {[
                    { href: '#photos', label: `Photos (${totalCount})` },
                    { href: '#videos', label: `Videos (${videos.length})` },
                  ].map(({ href, label }) => (
                    <a
                      key={href}
                      href={href}
                      className={cn(
                        'px-4 py-2 rounded-lg font-accent text-xs uppercase tracking-wider',
                        'bg-pepper-charcoal text-white hover:bg-pepper-dark border border-border-subtle',
                        'transition-colors'
                      )}
                    >
                      {label}
                    </a>
                  ))}
                </nav>
              )}

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
          <section id="videos" className="section-padding pb-8 scroll-mt-28">
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
          <section id="photos" className="section-padding pb-12 scroll-mt-28">
            <div className="section-container">
              {hasVideos && (
                <h2 className="font-accent text-xs uppercase tracking-wider text-heat-jalapeno mb-4">
                  Photos
                </h2>
              )}
              <PhotoGrid photos={loadedPhotos} onPhotoClick={openLightbox} />

              {hasMore && (
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className={cn(
                      'px-6 py-3 rounded-lg font-accent text-xs uppercase tracking-wider',
                      'bg-pepper-charcoal text-white hover:bg-pepper-dark border border-border-subtle',
                      'transition-colors disabled:opacity-60 disabled:cursor-wait'
                    )}
                  >
                    {loadingMore
                      ? 'Loading…'
                      : `Load more · ${loadedPhotos.length} of ${totalCount}`}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      <Footer />

      {/* Photo Lightbox — walks the full loaded list and pulls the next page at the boundary */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={loadedPhotos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          hasMore={hasMore}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          totalCount={totalCount}
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
