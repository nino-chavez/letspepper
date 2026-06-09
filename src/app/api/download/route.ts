import { NextRequest } from 'next/server'

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
const ALLOWED_DOMAINS = ['imagedelivery.net']

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')
  const filename = (searchParams.get('filename') || 'download.jpg').replace(/["\r\n]/g, '')

  if (!imageUrl || !ALLOWED_DOMAINS.some((d) => imageUrl.includes(d))) {
    return new Response('Missing or invalid url (must be a Cloudflare Images URL)', { status: 400 })
  }

  const upstream = await fetch(imageUrl, { headers: { Accept: 'image/webp,image/apng,image/*,*/*;q=0.8' } })
  if (!upstream.ok || !upstream.body) {
    return new Response(`Failed to fetch image: ${upstream.status}`, { status: upstream.status || 502 })
  }

  const headers: Record<string, string> = {
    'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-cache',
  }
  const contentLength = upstream.headers.get('content-length')
  if (contentLength) headers['Content-Length'] = contentLength

  // Stream through without buffering.
  return new Response(upstream.body, { status: 200, headers })
}

export const runtime = 'edge'
