/**
 * Let's Pepper - Standings Data
 * Shared tournament results and player stats used across standings, rankings, and community features.
 */

export interface TeamResult {
  place: number
  players: string[]
  tied?: boolean
}

export interface TournamentResult {
  id: string
  event: string
  date: string
  location: string
  heat: 'bell' | 'jalapeno' | 'poblano'
  results: TeamResult[]
}

export interface PlayerStats {
  name: string
  events: number
  wins: number
  podiums: number
  bestFinish: number
  seasonPoints: number
  teams: string[][] // teammates per event
  placements: { eventId: string; place: number }[]
}

// Point system: 1st=100, 2nd=75, 3rd=50, 5th=25, 9th=10
const POINTS_MAP: Record<number, number> = {
  1: 100,
  2: 75,
  3: 50,
  5: 25,
  9: 10,
}

function getPoints(place: number): number {
  return POINTS_MAP[place] ?? 0
}

// Results data - structured for easy CMS migration later
export const tournamentResults: TournamentResult[] = [
  {
    id: 'bell-pepper-2026-06-07',
    event: 'Bell Pepper Open',
    date: 'June 7, 2026',
    location: 'Aurora, IL',
    heat: 'bell',
    // Placements bracket-derived (19-team single-elim, post-pool reseed).
    results: [
      { place: 1, players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'] },
      { place: 2, players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'] },
      { place: 3, players: ['David Hill', 'Quinn Bozarth', 'Braxton Francis'], tied: true },
      { place: 3, players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'], tied: true },
      { place: 5, players: ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney'], tied: true },
      { place: 5, players: ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer'], tied: true },
      { place: 5, players: ['Nick Maruyama', 'Braydon Savitski-Lynde', 'Lincoln Geist'], tied: true },
      { place: 5, players: ['Everett Haynes', 'Will Mensching', 'Blayr Young'], tied: true },
      { place: 9, players: ['Erik Kirschbaum', 'Mike Hallman', 'Joe Glatz'], tied: true },
      { place: 9, players: ['Elijah Skutt', 'Owen Randel', 'Ian'], tied: true },
      { place: 9, players: ['Sriram Sundareswaram', 'Cedric', 'Shane'], tied: true },
      { place: 9, players: ['Pat Paasch', 'Joel Paasch'], tied: true },
      { place: 9, players: ['Noah Konopack', 'Josh Bloom', 'Ray Driver'], tied: true },
      { place: 9, players: ['Tom Blankenstein', 'Rolando', 'Jack Huizinga'], tied: true },
      { place: 9, players: ['Jack Stolzer', 'Will Elias', 'Ty Steponaitus'], tied: true },
      { place: 9, players: ['Kyle Swarens', 'Carter Geiger', 'Tony Solis'], tied: true },
      { place: 17, players: ['Brad Hornstein', 'Cooper Hansen', 'Mason Kolar'], tied: true },
      { place: 17, players: ['Justin Arrowood', 'Ben Boron', 'Bella Thompson'], tied: true },
      { place: 17, players: ['David Johnson', 'Tam', 'Kenyon Hayes'], tied: true },
    ],
  },
  {
    id: 'bell-pepper-2025-07-19',
    event: 'Bell Pepper Open',
    date: 'July 19, 2025',
    location: 'Aurora, IL',
    heat: 'bell',
    results: [
      { place: 1, players: ['Charlie Podgorny', 'Nate Meyer', 'Peter Zurawski'] },
      { place: 2, players: ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist'] },
      { place: 3, players: ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer'], tied: true },
      { place: 3, players: ['David Butler', 'Elijah Scott', 'Owen Randle'], tied: true },
      { place: 5, players: ['Kevin Messer', 'Mark Mir', 'Grant Adler'], tied: true },
      { place: 5, players: ['Matt Muelenickel', 'Jeremiah Aro', 'Charlie Clifford'], tied: true },
      { place: 5, players: ['Mitchell Carrera', 'Connor Jaral', 'Nolan Krygsheld'], tied: true },
      { place: 5, players: ['Joe Watkins', 'Adrian Cebula', 'Eric Tripp'], tied: true },
      { place: 9, players: ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan'], tied: true },
      { place: 9, players: ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman'], tied: true },
      { place: 9, players: ['Grant Veldman', 'Will Mensching', 'Everett Haynes'], tied: true },
      { place: 9, players: ['Kurt Vandenberg', 'Brett Vandenberg', 'Caleb Vandenberg'], tied: true },
    ],
  },
  {
    id: 'grass-launch-2025-05-31',
    event: 'Grass Launch',
    date: 'May 31, 2025',
    location: 'Aurora, IL',
    heat: 'bell',
    results: [
      { place: 1, players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'] },
      { place: 2, players: ['Everett Haynes', 'Will Mensching', 'Grant Veldman'] },
      { place: 3, players: ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer'], tied: true },
      { place: 3, players: ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist'], tied: true },
      { place: 5, players: ['Kevin Messer', 'Mark Mir', 'Grant Adler'], tied: true },
      { place: 5, players: ['David Butler', 'Elijah Scott', 'Owen Randle'], tied: true },
      { place: 5, players: ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan'], tied: true },
      { place: 5, players: ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman'], tied: true },
    ],
  },
]

/** Get all unique player names from tournament results */
export function getAllPlayers(): string[] {
  const players = new Set<string>()
  for (const tournament of tournamentResults) {
    for (const result of tournament.results) {
      for (const player of result.players) {
        players.add(player)
      }
    }
  }
  return Array.from(players).sort()
}

/** Get all unique team compositions as sorted player name arrays */
export function getAllTeams(): { players: string[]; key: string }[] {
  const teamMap = new Map<string, string[]>()
  for (const tournament of tournamentResults) {
    for (const result of tournament.results) {
      const key = [...result.players].sort().join(' | ')
      if (!teamMap.has(key)) {
        teamMap.set(key, result.players)
      }
    }
  }
  return Array.from(teamMap.entries()).map(([key, players]) => ({ key, players }))
}

/** Get player events and placements */
export function getPlayerEvents(playerName: string): { eventId: string; event: string; place: number; teammates: string[] }[] {
  const events: { eventId: string; event: string; place: number; teammates: string[] }[] = []
  for (const tournament of tournamentResults) {
    for (const result of tournament.results) {
      if (result.players.includes(playerName)) {
        events.push({
          eventId: tournament.id,
          event: tournament.event,
          place: result.place,
          teammates: result.players.filter(p => p !== playerName),
        })
      }
    }
  }
  return events
}

/** Compute full stats for a player */
export function getPlayerStats(playerName: string): PlayerStats {
  const events = getPlayerEvents(playerName)
  return {
    name: playerName,
    events: events.length,
    wins: events.filter(e => e.place === 1).length,
    podiums: events.filter(e => e.place <= 3).length,
    bestFinish: events.length > 0 ? Math.min(...events.map(e => e.place)) : 0,
    seasonPoints: events.reduce((sum, e) => sum + getPoints(e.place), 0),
    teams: events.map(e => e.teammates),
    placements: events.map(e => ({ eventId: e.eventId, place: e.place })),
  }
}

/** Get season leaderboard sorted by points, then by best finish */
export function getSeasonLeaderboard(): PlayerStats[] {
  const players = getAllPlayers()
  return players
    .map(getPlayerStats)
    .sort((a, b) => {
      if (b.seasonPoints !== a.seasonPoints) return b.seasonPoints - a.seasonPoints
      if (a.bestFinish !== b.bestFinish) return a.bestFinish - b.bestFinish
      return b.events - a.events
    })
}

export interface RankedLeaderEntry {
  rank: number
  tied: boolean
  name: string
  points: number
  events: number
  /** Tournament wins (1st-place finishes). */
  titles: number
  podiums: number
  bestFinish: number
  trend: 'up' | 'down' | 'steady' | 'new'
}

/**
 * Ranked points-race leaderboard, computed from the curated results.
 * Pass a year to scope to one season (e.g. the 2026 standings page); omit for the
 * all-time series board. Competition ranking — equal (points, best finish) tie.
 *
 * This is the authoritative board until Rally HQ scores the live bracket: the
 * platform has the rosters but not yet the placements, so its board shows the
 * champion at 0. Deriving from results keeps the page correct in the meantime.
 */
export function getRankedLeaderboard(year?: string): RankedLeaderEntry[] {
  const events = year ? tournamentResults.filter(t => t.date.includes(year)) : tournamentResults
  // Merge by normalized name so spelling/hyphen/spacing variants of the same person
  // don't show up as duplicate rows (the rally-hq board's failure mode).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  const acc = new Map<string, { name: string; points: number; events: number; titles: number; podiums: number; bestFinish: number }>()
  for (const t of events) {
    for (const r of t.results) {
      for (const p of r.players) {
        const k = norm(p)
        const e = acc.get(k) ?? { name: p, points: 0, events: 0, titles: 0, podiums: 0, bestFinish: 99 }
        e.points += getPoints(r.place)
        e.events += 1
        if (r.place === 1) e.titles += 1
        if (r.place <= 3) e.podiums += 1
        if (r.place < e.bestFinish) e.bestFinish = r.place
        acc.set(k, e)
      }
    }
  }
  const sorted = Array.from(acc.values()).sort((a, b) =>
    b.points - a.points || a.bestFinish - b.bestFinish || b.titles - a.titles || b.events - a.events)
  const counts: Record<number, number> = {}
  let rank = 0, prevPts: number | null = null, prevBest: number | null = null
  const rows: RankedLeaderEntry[] = sorted.map((s, i) => {
    if (s.points !== prevPts || s.bestFinish !== prevBest) { rank = i + 1; prevPts = s.points; prevBest = s.bestFinish }
    counts[rank] = (counts[rank] ?? 0) + 1
    return { rank, tied: false, name: s.name, points: s.points, events: s.events, titles: s.titles, podiums: s.podiums, bestFinish: s.bestFinish, trend: 'steady' }
  })
  for (const r of rows) r.tied = counts[r.rank] > 1
  return rows
}

/** Get team stats with combined season points */
export function getTeamStats(): { players: string[]; key: string; totalPoints: number; events: number; bestFinish: number; wins: number; podiums: number }[] {
  const teams = getAllTeams()
  return teams.map(team => {
    let totalPoints = 0
    let events = 0
    let bestFinish = Infinity
    let wins = 0
    let podiums = 0
    for (const tournament of tournamentResults) {
      for (const result of tournament.results) {
        const sortedResult = [...result.players].sort().join(' | ')
        if (sortedResult === team.key) {
          totalPoints += getPoints(result.place)
          events++
          if (result.place < bestFinish) bestFinish = result.place
          if (result.place === 1) wins++
          if (result.place <= 3) podiums++
        }
      }
    }
    return {
      ...team,
      totalPoints,
      events,
      bestFinish: bestFinish === Infinity ? 0 : bestFinish,
      wins,
      podiums,
    }
  }).sort((a, b) => b.totalPoints - a.totalPoints)
}
