import { NextRequest } from 'next/server'
import { isLPOAlbumKey } from '@/lib/gallery'

/**
 * Album ZIP — returns an HMAC-signed URL for the shared album-zip Worker (zip.ninochavez.co).
 *
 * The Worker verifies the signature with its ZIP_SIGNING_SECRET (the photography repo's
 * cloudflare-worker/album-zip). This site signs with the same secret, set as ZIP_SIGNING_SECRET
 * on the Pages project, and fails closed without it. It signs only this site's own albums, and
 * only the one quality the Worker builds. Mirrors the photography site's `/api/zip-url`.
 *
 * GET /api/zip-url?albumKey=...&quality=large
 * Returns: { url: "https://zip.ninochavez.co/zip/<albumKey>?quality=...&ts=...&sig=..." }
 */
const ZIP_WORKER_URL = 'https://zip.ninochavez.co'
const ZIP_QUALITY = 'large'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const albumKey = searchParams.get('albumKey')
  const quality = searchParams.get('quality') || ZIP_QUALITY

  if (!albumKey || quality !== ZIP_QUALITY || !(await isLPOAlbumKey(albumKey))) {
    return Response.json({ error: 'Missing albumKey parameter' }, { status: 400 })
  }

  const secret = process.env.ZIP_SIGNING_SECRET
  if (!secret) {
    return Response.json({ error: 'Server misconfigured (no signing secret)' }, { status: 503 })
  }

  const ts = Math.floor(Date.now() / 1000).toString()
  const data = `${albumKey}:${quality}:${ts}`

  // HMAC-SHA256 via Web Crypto (works in the edge runtime).
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const sig = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const url = `${ZIP_WORKER_URL}/zip/${encodeURIComponent(albumKey)}?quality=${encodeURIComponent(quality)}&ts=${ts}&sig=${sig}`
  return Response.json({ url })
}

export const runtime = 'edge'
