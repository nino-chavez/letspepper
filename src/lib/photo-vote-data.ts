/**
 * Let's Pepper - Photo of the Season Vote
 *
 * Candidates are real gallery photos fetched from the photography project's shared
 * gallery (peak action-intensity) — see `fetchVotablePhotos` in `lib/gallery.ts`.
 * This file holds only the shared shape.
 */

export interface VotablePhoto {
  id: string
  cfImageId: string
  caption: string
  event: string
  photographer: string
}
