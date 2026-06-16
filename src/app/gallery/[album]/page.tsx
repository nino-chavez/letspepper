import { notFound } from 'next/navigation'
import { fetchAlbumPhotos, fetchAlbumVideos } from '@/lib/gallery'
import { AlbumDetail } from './AlbumDetail'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ album: string }>
}

/** Extract album key from the slug format: "album-name--albumKey" */
function extractAlbumKey(slug: string): string {
  const parts = slug.split('--')
  return parts.length > 1 ? parts[parts.length - 1] : slug
}

function extractAlbumSlugName(slug: string): string {
  const parts = slug.split('--')
  return parts.length > 1
    ? parts.slice(0, -1).join('--').replace(/-/g, ' ')
    : slug
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { album } = await params
  const name = extractAlbumSlugName(album)
  return {
    title: `${name} | Gallery | Let's Pepper`,
    description: `Photos and videos from ${name} — Let's Pepper grassroots volleyball tournament.`,
  }
}

export default async function AlbumPage({ params }: PageProps) {
  const { album } = await params
  const albumKey = extractAlbumKey(album)

  // First page is server-rendered; the client appends the rest via "Load more".
  const [{ photos, totalCount }, videos] = await Promise.all([
    fetchAlbumPhotos({ albumKey, page: 1, pageSize: 48 }),
    fetchAlbumVideos(albumKey),
  ])

  if (totalCount === 0 && videos.length === 0) {
    notFound()
  }

  // Get album name from first photo, first video, or slug
  const albumName =
    photos[0]?.albumName || videos[0]?.albumName || extractAlbumSlugName(album)

  return (
    <AlbumDetail
      albumName={albumName}
      albumKey={albumKey}
      photos={photos}
      videos={videos}
      totalCount={totalCount}
    />
  )
}
export const runtime = "edge";
