/**
 * OG mascot loading — fetches the palette-quantized PNGs (Satori can't decode
 * WebP) from our own origin's static assets at render time. Bundling them via
 * fetch(new URL(..., import.meta.url)) emits a relative /_next/static/media
 * path that edge fetch() can't parse, so same-origin fetch it is: the assets
 * live on the same Cloudflare zone as the route, and a miss degrades to the
 * type-only card instead of failing the most-shared URL.
 * Regenerate the PNGs with `pnpm derive:mascots`.
 */
import { headers } from 'next/headers'
import type { TournamentDetail } from './tournaments'

const FILES = {
	brand: 'og-jalapeno-menace-walk-360.png',
	bell: 'og-bell-pepper-block-360.png',
	jalapeno: 'og-jalapeno-jump-serve-360.png',
	// Poblano Verde fronts the poblano event (men's divisions only; see flavors/[slug] note).
	poblano: 'og-poblano-verde-menace-walk-360.png',
} satisfies Record<TournamentDetail['heat'] | 'brand', string>

export async function loadMascot(key: keyof typeof FILES): Promise<ArrayBuffer | undefined> {
	try {
		const h = headers()
		const host = h.get('x-forwarded-host') ?? h.get('host')
		if (!host) return undefined
		const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
		const res = await fetch(`${proto}://${host}/images/mascots/anime/web/${FILES[key]}`)
		if (!res.ok) return undefined
		return await res.arrayBuffer()
	} catch {
		return undefined
	}
}
