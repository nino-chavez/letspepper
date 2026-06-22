/**
 * Let's Pepper — Standings Data (Rally HQ snapshot + pure derivations)
 *
 * `tournamentResults` is a SNAPSHOT of the tournament truth Rally HQ derives from
 * the live brackets — placements joined with full rosters — captured from
 * GET /api/standings-results (= getSeasonResults). Rally HQ is the source of
 * truth; this snapshot is the OFFLINE / SSR-first-paint fallback. The surfaces in
 * this app fetch RHQ live and pass the result into the derivation functions
 * below; they fall back to this snapshot only when RHQ is unreachable.
 *
 * Keep it honest: `npm run check:rhq-drift` (scripts/check-rhq-drift.mjs) diffs
 * this snapshot against live RHQ. When it reports drift — a new event, a roster
 * correction, a rename — REGENERATE the snapshot from /api/standings-results
 * rather than hand-editing, so the fallback never silently goes partial again
 * (which is the exact failure this snapshot replaced).
 *
 * Every derivation function is PURE: it takes a `results` array that defaults to
 * this snapshot, so the same logic runs over live RHQ data (passed by the caller)
 * or the offline fallback (the default) with no divergent code path.
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

// Point system: 1st=100, 2nd=75, 3rd=50, 5th=25, 9th=10.
// Participation floor: every team that plays scores (play-in/lower), so showing up
// year over year always climbs the all-time board — not just winning.
const POINTS_MAP: Record<number, number> = {
  1: 100,
  2: 75,
  3: 50,
  5: 25,
  9: 10,
}
const PARTICIPATION = 5

function getPoints(place: number): number {
  return POINTS_MAP[place] ?? PARTICIPATION
}

// Snapshot of Rally HQ's derived results (regenerate from /api/standings-results;
// see the file header). IDs are the RHQ tournament slugs. Do not hand-edit rosters
// here — fix them in Rally HQ and re-snapshot, so the harness stays the gate.
export const tournamentResults: TournamentResult[] = [
  {
    id: "bell-pepper-open-2026",
    event: "Bell Pepper Open",
    date: "Jun 7, 2026",
    location: "Aurora, IL",
    heat: "bell",
    results: [
      { place: 1, players: ["Colin Merk", "Dave Wieczorek", "Ryan Merk"] },
      { place: 2, players: ["Nate Meyer", "Charlie Podgorny", "Ian Schuller"] },
      { place: 3, players: ["David Hill", "Braxton Francis", "Quinn Bozarth"], tied: true },
      { place: 3, players: ["Urvil Patel", "Evan Hughes", "Jake Reishus"], tied: true },
      { place: 5, players: ["Tyler Donovan", "Abhi Lakkamsani", "Justin McCartney", "Sammy Atkinson"], tied: true },
      { place: 5, players: ["Mitchell Carrera", "Connor Jaral", "Connor Studer"], tied: true },
      { place: 5, players: ["Everett Haynes", "Blayr Young", "Will Mensching"], tied: true },
      { place: 5, players: ["Nick Maruyama", "Braydon Savitski-Lynde", "Lincoln Geist"], tied: true },
      { place: 9, players: ["Tom Blankschein", "Jack Huizinga", "Rolando"], tied: true },
      { place: 9, players: ["Erik Kirschbaum", "Joe Glatz", "Mike Hallman"], tied: true },
      { place: 9, players: ["Sriram Sundareswaram", "Cedric", "Shane"], tied: true },
      { place: 9, players: ["Elijah Skutt", "Ian", "Owen Randel"], tied: true },
      { place: 9, players: ["Kyle Swarens", "Carter Geiger", "Tony Solis"], tied: true },
      { place: 9, players: ["Noah Konopack", "Josh Bloom", "Ray Driver"], tied: true },
      { place: 9, players: ["Jack Stolzer", "Ty Steponaitus", "Will Elias"], tied: true },
      { place: 9, players: ["Pat Paasch", "Joel Paasch"], tied: true },
      { place: 17, players: ["David Johnson", "Kenyon Hayes", "Tam"], tied: true },
      { place: 17, players: ["Justin Arrowood", "Bella Thompson", "Ben Boron"], tied: true },
      { place: 17, players: ["Brad Hornstein", "Cooper Hansen", "Mason Kolar"], tied: true },
    ],
  },
  {
    id: "grass-clash-2025",
    event: "Bell Pepper Open",
    date: "Jul 19, 2025",
    location: "Aurora, IL",
    heat: "bell",
    results: [
      { place: 1, players: ["Charlie Podgorny", "Nate Meyer", "Peter Zurawski"] },
      { place: 2, players: ["Nick Maruyama", "Lincoln Geist", "Zach Solomon"] },
      { place: 3, players: ["David Butler", "Elijah Scott", "Owen Randle"], tied: true },
      { place: 3, players: ["Casey Maas", "Kaden Sauer", "Kyle Zediker"], tied: true },
      { place: 5, players: ["Joe Watkins", "Adrian Cebula", "Eric Tripp"], tied: true },
      { place: 5, players: ["Erik Kirschbaum", "Kevin Messer", "Mark Mir"], tied: true },
      { place: 5, players: ["Mitchell Carrera", "Connor Jaral", "Nolan Krygsheld"], tied: true },
      { place: 5, players: ["Will Ashum", "Charlie Clifford", "Jeremiah Aro", "Matt Muelenickel"], tied: true },
      { place: 9, players: ["Tyler Johnwick", "Luke Dwyer", "Tyler Walenga"], tied: true },
      { place: 9, players: ["Sam Kharasch", "Alex Pasek", "Tyler Donovan"], tied: true },
      { place: 9, players: ["David Hill", "Justin Arrowood", "Quinn Bozarth"], tied: true },
      { place: 9, players: ["Jake Stolzer", "James Ganzorg", "Will Elias"], tied: true },
      { place: 9, players: ["David Johnson", "Carter Lyons", "Eli Weinrich"], tied: true },
      { place: 9, players: ["Tom Blankschein", "Eric McCarthy", "Mike Hellman"], tied: true },
      { place: 9, players: ["Nathaniel Cosselyeon", "Alec Donald", "Kenyon Haynes"], tied: true },
      { place: 9, players: ["Grant Veldman", "Everett Haynes", "Will Mensching"], tied: true },
      { place: 17, players: ["Nelson Arteta", "Caden Kalinowski", "Lukas Jokinen"], tied: true },
      { place: 17, players: ["Jackson Kern", "Brenden Siegel", "Joel Paasch"], tied: true },
      { place: 17, players: ["Alex Venes", "Logan Warkentien", "Luca Olavarri"], tied: true },
      { place: 17, players: ["Grant Henderson", "Casey Goss", "Richie Johnson"], tied: true },
      { place: 17, players: ["Dain Mason", "Charles Davdison", "Hamza Murrar"], tied: true },
      { place: 17, players: ["Max Barbeau", "Cooper Armstrong", "Matt Molnar"], tied: true },
    ],
  },
  {
    id: "grass-launch-2025",
    event: "Grass Launch",
    date: "May 31, 2025",
    location: "Aurora, IL",
    heat: "bell",
    results: [
      { place: 1, players: ["Nate Meyer", "Charlie Podgorny", "Ian Schuller"] },
      { place: 2, players: ["Everett Haynes", "Grant Veldman", "Will Mensching"] },
      { place: 3, players: ["Erik Kirschbaum", "Szymon Gierut", "Tyler Gaytan"], tied: true },
      { place: 3, players: ["Alex Pasek", "Jake Lauger", "Zach Daniels"], tied: true },
      { place: 5, players: ["David Hill", "Camden Seaver", "Stefan Kins"], tied: true },
      { place: 5, players: ["Nick Maruyama", "Aidan Weltin", "Lincoln Geist"], tied: true },
      { place: 5, players: ["Kyle Sauer", "Casey Maas", "Kaden Sauer"], tied: true },
      { place: 5, players: ["Peter Zurawski", "John Brown", "Quinn Bozarth"], tied: true },
      { place: 9, players: ["Max Barbeau", "Cooper Armstrong", "Ryan Blazevich"], tied: true },
      { place: 9, players: ["Joe Martens", "Ben Prostic", "Sean Becker"], tied: true },
      { place: 9, players: ["Ammar Bhutta", "Joe Watkins", "Nathaniel Cossyleon"], tied: true },
      { place: 9, players: ["Van Gaetto", "Cole Gaetto", "Drew Gaetto"], tied: true },
      { place: 9, players: ["Jason Kougan", "Kyle Wagner", "Nolan Krygsheld"], tied: true },
      { place: 9, players: ["Grant Henderson", "Cooper Hansen", "Richie Johnson"], tied: true },
      { place: 9, players: ["Mason Kolar", "Aidan Cupps", "Nick Kujalowicz"], tied: true },
      { place: 9, players: ["Tyler Johnwick", "Luke Dwyer", "Tyler Walenga"], tied: true },
    ],
  },
]

/** All unique player names across the given results (defaults to the snapshot). */
export function getAllPlayers(results: TournamentResult[] = tournamentResults): string[] {
  const players = new Set<string>()
  for (const tournament of results) {
    for (const result of tournament.results) {
      for (const player of result.players) {
        players.add(player)
      }
    }
  }
  return Array.from(players).sort()
}

/** All unique team compositions as sorted player-name arrays. */
export function getAllTeams(results: TournamentResult[] = tournamentResults): { players: string[]; key: string }[] {
  const teamMap = new Map<string, string[]>()
  for (const tournament of results) {
    for (const result of tournament.results) {
      const key = [...result.players].sort().join(' | ')
      if (!teamMap.has(key)) {
        teamMap.set(key, result.players)
      }
    }
  }
  return Array.from(teamMap.entries()).map(([key, players]) => ({ key, players }))
}

/** A player's events and placements across the given results. */
export function getPlayerEvents(
  playerName: string,
  results: TournamentResult[] = tournamentResults,
): { eventId: string; event: string; place: number; teammates: string[] }[] {
  const events: { eventId: string; event: string; place: number; teammates: string[] }[] = []
  for (const tournament of results) {
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

/** Full stats for a player, derived from the given results. */
export function getPlayerStats(
  playerName: string,
  results: TournamentResult[] = tournamentResults,
): PlayerStats {
  const events = getPlayerEvents(playerName, results)
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

/** Season leaderboard sorted by points, then best finish, then events. */
export function getSeasonLeaderboard(results: TournamentResult[] = tournamentResults): PlayerStats[] {
  return getAllPlayers(results)
    .map((p) => getPlayerStats(p, results))
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
  /** Played in the founding season — earns an "OG" badge. */
  og: boolean
}

/**
 * Ranked points-race leaderboard, computed from the given results.
 * Pass a year to scope to one season (e.g. the 2026 standings page); omit for the
 * all-time series board. Competition ranking — equal (points, best finish) tie.
 */
export function getRankedLeaderboard(
  year?: string,
  results: TournamentResult[] = tournamentResults,
): RankedLeaderEntry[] {
  const events = year ? results.filter(t => t.date.includes(year)) : results
  // Merge by normalized name so spelling/hyphen/spacing variants of the same person
  // don't show up as duplicate rows (the rally-hq board's failure mode).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
  // OG = played in the founding (earliest) season, regardless of the board's year filter.
  const earliest = Array.from(new Set(results.map(t => t.date.match(/\d{4}/)?.[0]).filter(Boolean) as string[])).sort()[0]
  const ogSet = new Set(
    results.filter(t => earliest && t.date.includes(earliest))
      .flatMap(t => t.results.flatMap(r => r.players.map(norm))),
  )
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
  // Canonical points ranking; the client re-sorts/re-ranks for the other columns.
  const sorted = Array.from(acc.values()).sort((a, b) =>
    b.points - a.points || a.bestFinish - b.bestFinish || b.titles - a.titles || b.events - a.events)
  const counts: Record<number, number> = {}
  let rank = 0, prevPts: number | null = null, prevBest: number | null = null
  const rows: RankedLeaderEntry[] = sorted.map((s, i) => {
    if (s.points !== prevPts || s.bestFinish !== prevBest) { rank = i + 1; prevPts = s.points; prevBest = s.bestFinish }
    counts[rank] = (counts[rank] ?? 0) + 1
    return { rank, tied: false, name: s.name, points: s.points, events: s.events, titles: s.titles, podiums: s.podiums, bestFinish: s.bestFinish, trend: 'steady', og: ogSet.has(norm(s.name)) }
  })
  for (const r of rows) r.tied = counts[r.rank] > 1
  return rows
}

/** Team stats (combined season points) across the given results. */
export function getTeamStats(
  results: TournamentResult[] = tournamentResults,
): { players: string[]; key: string; totalPoints: number; events: number; bestFinish: number; wins: number; podiums: number }[] {
  const teams = getAllTeams(results)
  return teams.map(team => {
    let totalPoints = 0
    let events = 0
    let bestFinish = Infinity
    let wins = 0
    let podiums = 0
    for (const tournament of results) {
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
