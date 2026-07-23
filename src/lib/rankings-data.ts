/**
 * Let's Pepper - Power Rankings Data
 * Editorial rankings with narrative blurbs and scoville ratings.
 */

export type Trend = 'up' | 'down' | 'steady' | 'new'

export interface PowerRanking {
  rank: number
  players: string[]
  scovilleRating: number // 1-5
  trend: Trend
  blurb: string
  highlights: string[]
}

export const powerRankings: PowerRanking[] = [
  {
    rank: 1,
    players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'],
    scovilleRating: 5,
    trend: 'new',
    blurb: 'The #1 reseed went undefeated in bracket play at the 2026 Bell Pepper Open and beat the two-time champions in the final. They enter the rankings at No. 1.',
    highlights: ['2026 Bell Pepper Open Champions', 'Undefeated bracket run', 'Beat Meyer/Podgorny in the final'],
  },
  {
    rank: 2,
    players: ['Nate Meyer', 'Charlie Podgorny'],
    scovilleRating: 5,
    trend: 'down',
    blurb: 'Still the winningest names in the series: two titles and a finals appearance at every event. The 2026 runner-up finish keeps them at No. 2.',
    highlights: ['2x Series Champions', '275 series points', 'Finalists at all 3 events'],
  },
  {
    rank: 3,
    players: ['David Hill', 'Quinn Bozarth', 'Braxton Francis'],
    scovilleRating: 4,
    trend: 'up',
    blurb: 'The breakout of 2026. The #12 reseed eliminated the #5 and #4 seeds back-to-back to reach the semifinals and move to No. 3.',
    highlights: ['2026 Semifinalist', 'Beat the #5 and #4 seeds', '#12 reseed → 3rd'],
  },
  {
    rank: 4,
    players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'],
    scovilleRating: 4,
    trend: 'up',
    blurb: 'The #6 reseed upset No. 3 Maruyama and finished tied for third in 2026. That result moves them into the top four.',
    highlights: ['2026 Semifinalist', 'Upset #3 Maruyama', 'Reseed 6 → tied 3rd'],
  },
  {
    rank: 5,
    players: ['Nick Maruyama', 'Lincoln Geist'],
    scovilleRating: 4,
    trend: 'steady',
    blurb: 'A podium in two of three events and 150 series points keep them in the top five after a 2026 quarterfinal finish.',
    highlights: ['Silver + Bronze finishes', '150 series points', 'Most consistent non-champion'],
  },
  {
    rank: 6,
    players: ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer'],
    scovilleRating: 3,
    trend: 'up',
    blurb: 'The field\'s most underrated team. Seeded 14th, finished tied-5th, and posted one of the best pool differentials in the bracket. Underestimated and moving up.',
    highlights: ['Seed 14 → tied 5th', '+4 pool set differential', 'Elite Eight'],
  },
  {
    rank: 7,
    players: ['Ian Schuller'],
    scovilleRating: 3,
    trend: 'steady',
    blurb: 'Won the Grass Launch and returned to the final in 2026 with Meyer and Podgorny. The results keep adding up.',
    highlights: ['Grass Launch Champion', '2026 Finalist', '175 series points'],
  },
  {
    rank: 8,
    players: ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney'],
    scovilleRating: 3,
    trend: 'new',
    blurb: 'The deep four-man squad that keeps reaching the bracket. Elite Eight in 2026 with points on the board — the kind of roster depth that wins long days on the grass.',
    highlights: ['2026 Quarterfinalist', 'Four-deep roster', 'Elite Eight'],
  },
]

// Fallbacks for the stats row — the page overrides eventsCompleted + totalPoints
// live from the standings API so they don't go stale between editorial updates.
export const SEASON_STATS = {
  totalPointsAwarded: 3795,
  eventsCompleted: 3,
  teamsRanked: powerRankings.length,
}
