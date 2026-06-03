import { fetchVotablePhotos } from '@/lib/gallery'
import { serverError, ok } from '../_lib/validate'

/**
 * Photo-of-the-season vote candidates — real Let's Pepper gallery photos
 * (peak action-intensity), replacing the placeholder set.
 */
export async function GET() {
  try {
    const photos = await fetchVotablePhotos(12)
    return ok({ photos })
  } catch (err) {
    console.error('Votable photos fetch error:', err)
    return serverError('Could not load photos')
  }
}

export const runtime = 'edge'
