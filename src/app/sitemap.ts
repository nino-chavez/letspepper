import type { MetadataRoute } from 'next'
import { tournaments } from '@/lib/tournaments'

const SITE_URL = 'https://letspepper.com'

const staticRoutes = [
  '',
  '/signup',
  '/about',
  '/faq',
  '/standings',
  '/gallery',
  '/rankings',
  '/predictions',
  '/quiz',
  '/bingo',
  '/awards',
  '/hot-takes',
  '/photo-vote',
  '/waiver',
  '/privacy',
  '/terms',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/signup' ? 0.9 : 0.6,
  }))

  const eventEntries: MetadataRoute.Sitemap = Object.values(tournaments).map((tournament) => ({
    url: `${SITE_URL}/flavors/${tournament.slug}`,
    changeFrequency: 'weekly',
    priority: 0.9,
  }))

  return [...staticEntries, ...eventEntries]
}
