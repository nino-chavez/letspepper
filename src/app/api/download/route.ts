import { NextRequest } from 'next/server'
import { isOwnCfImageUrl } from '@/lib/cloudflare-images'

/**
 * Download proxy — forces a real file download for Cloudflare Images.
 *
 * WHY this exists: an `<a href download>` pointing straight at imagedelivery.net is cross-origin,
 * and browsers IGNORE the `download` attribute for cross-origin URLs — so the image just opens in a
 * tab instead of downloading. This route fetches the image server-side (same origin to the client)
 * and re-serves it with `Content-Disposition: attachment`, which forces the download. Mirrors the
 * approach on the photography site (`/api/download`).
 *
 * GET /api/download?url=<cloudflare-images-url>&filename=<name.jpg>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')
  // Only a plain image filename: letters, digits, dot, dash, underscore, and an image extension.
  const requested = (searchParams.get('filename') || '').replace(/[^A-Za-z0-9._-]/g, '')
  const filename = /\.(jpe?g|png|webp|avif)$/i.test(requested) ? requested : 'download.jpg'

  if (!isOwnCfImageUrl(imageUrl)) {
    return new Response('Missing or invalid url (must be a Cloudflare Images URL)', { status: 400 })
  }

  const upstream = await fetch(imageUrl, { headers: { Accept: 'image/webp,image/apng,image/*,*/*;q=0.8' } })
  const upstreamType = upstream.headers.get('content-type') || ''
  if (!upstream.ok || !upstream.body || !upstreamType.startsWith('image/')) {
    return new Response(`Failed to fetch image: ${upstream.status}`, { status: upstream.ok ? 502 : upstream.status || 502 })
  }

  const headers: Record<string, string> = {
    'Content-Type': upstreamType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-cache',
  }
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength

  // Stream through without buffering.
  return new Response(upstream.body, { status: 200, headers })
}

export const runtime = 'edge'
