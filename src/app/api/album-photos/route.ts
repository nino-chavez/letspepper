import { NextRequest } from 'next/server'
import { fetchAlbumPhotos } from '@/lib/gallery'

/**
 * Paginated album photos for client-side fetching — lets the lightbox pull the NEXT page when it
 * reaches the last loaded photo, so navigation flows across page boundaries without closing it.
 *
 * GET /api/album-photos?albumKey=...&page=N  →  { photos, totalCount, page }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const albumKey = searchParams.get('albumKey')
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))

  if (!albumKey) {
    return Response.json({ error: 'Missing albumKey parameter' }, { status: 400 })
  }

  const { photos, totalCount } = await fetchAlbumPhotos({ albumKey, page, pageSize: 48 })
  return Response.json({ photos, totalCount, page })
}

export const runtime = 'edge'
