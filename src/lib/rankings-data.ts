/**
 * Let's Pepper - Power Rankings Data
 * Editorial rankings with narrative blurbs and scoville ratings.
 *
 * Refreshed after the 2026 Jalapeño Open. Order: 2026 season points (see
 * standings-data.ts), and at equal points the more recent result ranks higher,
 * so current form counts most. Rosters are each team's most recent lineup.
 * Every result a blurb cites comes from the Rally HQ bracket for that event;
 * re-check against /api/rhq/bracket before editing one.
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
    players: ['Nate Meyer', 'Charlie Podgorny', 'Ethan Carroll'],
    scovilleRating: 5,
    trend: 'up',
    blurb: 'Won the 2026 Jalapeño Open without losing a match: 2–0 in pool play, then 2–0 in all four bracket rounds. That is three titles in four events for Meyer and Podgorny, and the No. 1 spot back.',
    highlights: ['2026 Jalapeño Open Champions', '3 titles in 4 events', '375 series points'],
  },
  {
    rank: 2,
    players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'],
    scovilleRating: 5,
    trend: 'down',
    blurb: 'Won the 2026 Bell Pepper Open without dropping a set in bracket play, beating Meyer and Podgorny 2–0 in the final. They did not play the Jalapeño Open, and the team they beat won it.',
    highlights: ['2026 Bell Pepper Open Champions', 'Undefeated bracket run', 'Beat Meyer/Podgorny in the final'],
  },
  {
    rank: 3,
    players: ['Nathen Toth', 'Andrew Flores', 'Christian Teresi'],
    scovilleRating: 4,
    trend: 'new',
    blurb: 'Their first series event ended in the final. After a semifinal loss to Maruyama they won three straight elimination matches, the last a 30–27 rematch with Maruyama, before Meyer stopped them in the grand final.',
    highlights: ['2026 Jalapeño Open Runner-Up', '3 straight elimination wins', 'Beat Maruyama 30–27 in the losers final'],
  },
  {
    rank: 4,
    players: ['Nick Maruyama', 'Lincoln Geist', 'Jakobi Lange'],
    scovilleRating: 4,
    trend: 'up',
    blurb: 'Went 3–0 in pool play at the Jalapeño Open and beat Toth in the semifinals, then lost to Meyer and, 30–27, to Toth. Maruyama and Geist have played all four series events and reached the podium twice.',
    highlights: ['2026 Jalapeño Open 3rd Place', 'Played all 4 events', '175 series points'],
  },
  {
    rank: 5,
    players: ['David Hill', 'Quinn Bozarth', 'Charlie Clifford'],
    scovilleRating: 4,
    trend: 'down',
    blurb: 'Tied for third at the Bell Pepper Open. At the Jalapeño Open they beat Mensching to reach the winners\' semifinal, lost to Meyer, then went out 30–28 to Konopack to finish tied for fifth.',
    highlights: ['2026 Bell Pepper Open Semifinalist', '2026 Jalapeño Open tied 5th', '75 points in 2026'],
  },
  {
    rank: 6,
    players: ['Ian Schuller'],
    scovilleRating: 3,
    trend: 'up',
    blurb: 'Won the 2025 Grass Launch and reached the 2026 Bell Pepper Open final with Meyer and Podgorny. He did not play the Jalapeño Open.',
    highlights: ['Grass Launch Champion', '2026 Bell Pepper Open Finalist', '175 series points'],
  },
  {
    rank: 7,
    players: ['Noah Konopack', 'Connor Jaral', 'Nolan Krygsheld'],
    scovilleRating: 3,
    trend: 'new',
    blurb: 'Lost their quarterfinal to Toth, then won three straight elimination matches, the last 30–28 over Hill and Bozarth, before Toth stopped them again. Fourth place at the Jalapeño Open.',
    highlights: ['2026 Jalapeño Open 4th Place', '3 straight elimination wins', 'Beat Hill/Bozarth 30–28'],
  },
  {
    rank: 8,
    players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'],
    scovilleRating: 3,
    trend: 'down',
    blurb: 'Beat Maruyama 2–0 in the quarterfinals and finished tied for third at the 2026 Bell Pepper Open. They did not play the Jalapeño Open.',
    highlights: ['2026 Bell Pepper Open Semifinalist', 'Beat Maruyama in the quarterfinals', '50 points in 2026'],
  },
]

// Fallbacks for the stats row — the page overrides eventsCompleted + totalPoints
// live from the standings API so they don't go stale between editorial updates.
export const SEASON_STATS = {
  totalPointsAwarded: 5480,
  eventsCompleted: 4,
  teamsRanked: powerRankings.length,
}
