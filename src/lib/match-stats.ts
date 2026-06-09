/**
 * Let's Pepper — match-level "stat leader" boards for the 2026 Bell Pepper Open.
 *
 * The series leaderboard is placement-based; these four are the flavor boards that
 * need match data (pool set scores, bracket outcomes, seeds) — now that we have it:
 *   - Giant Killers   — bracket wins over a higher (better) seed.
 *   - Cinderella      — finished above registration seed (seed − placement).
 *   - Dominance       — pool set differential.
 *   - Clutch          — deuce sets won (winner reached 22+).
 *
 * 2026-only: this is the one event with full match data captured.
 */

export interface StatEntry { team: string; players: string[]; value: number; detail: string }
export interface StatBoard { key: string; title: string; blurb: string; unit: string; entries: StatEntry[] }

interface Team2026 { name: string; players: string[]; initialSeed: number; reseed: number; place: number }

// name = team label (captain surname); initialSeed = registration seed (1–19);
// reseed = post-pool seed; place = bracket finish.
const TEAMS: Team2026[] = [
  { name: 'Merk', players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'], initialSeed: 2, reseed: 1, place: 1 },
  { name: 'Meyer', players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'], initialSeed: 1, reseed: 2, place: 2 },
  { name: 'Maruyama', players: ['Nick Maruyama', 'Braydon Savitski-Lynde', 'Lincoln Geist'], initialSeed: 3, reseed: 3, place: 5 },
  { name: 'Carrera', players: ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer'], initialSeed: 14, reseed: 4, place: 5 },
  { name: 'Skutt', players: ['Elijah Skutt', 'Owen Randel', 'Ian'], initialSeed: 11, reseed: 5, place: 9 },
  { name: 'Patel', players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'], initialSeed: 8, reseed: 6, place: 3 },
  { name: 'Haynes', players: ['Everett Haynes', 'Will Mensching', 'Blayr Young'], initialSeed: 6, reseed: 7, place: 5 },
  { name: 'Donovan', players: ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney'], initialSeed: 4, reseed: 8, place: 5 },
  { name: 'Kirschbaum', players: ['Erik Kirschbaum', 'Mike Hallman', 'Joe Glatz'], initialSeed: 5, reseed: 9, place: 9 },
  { name: 'Konopack', players: ['Noah Konopack', 'Josh Bloom', 'Ray Driver'], initialSeed: 19, reseed: 10, place: 9 },
  { name: 'Paasch', players: ['Pat Paasch', 'Joel Paasch'], initialSeed: 15, reseed: 11, place: 9 },
  { name: 'Hill', players: ['David Hill', 'Quinn Bozarth', 'Braxton Francis'], initialSeed: 7, reseed: 12, place: 3 },
  { name: 'Sundareswaram', players: ['Sriram Sundareswaram', 'Cedric', 'Shane'], initialSeed: 16, reseed: 13, place: 9 },
  { name: 'Arrowood', players: ['Justin Arrowood', 'Ben Boron', 'Bella Thompson'], initialSeed: 9, reseed: 14, place: 17 },
  { name: 'Swarens', players: ['Kyle Swarens', 'Carter Geiger', 'Tony Solis'], initialSeed: 17, reseed: 15, place: 9 },
  { name: 'Hornstein', players: ['Brad Hornstein', 'Cooper Hansen', 'Mason Kolar'], initialSeed: 18, reseed: 16, place: 17 },
  { name: 'Blankschein', players: ['Tom Blankschein', 'Rolando', 'Jack Huizinga'], initialSeed: 12, reseed: 17, place: 9 },
  { name: 'Johnson', players: ['David Johnson', 'Tam', 'Kenyon Hayes'], initialSeed: 13, reseed: 18, place: 17 },
  { name: 'Stolzer', players: ['Jack Stolzer', 'Will Elias', 'Ty Steponaitus'], initialSeed: 10, reseed: 19, place: 9 },
]
const byName = new Map(TEAMS.map((t) => [t.name, t]))

// Pool matches — [t1, t2, sets] (set scores from t1's perspective).
const POOL: [string, string, [number, number][]][] = [
  ['Meyer', 'Skutt', [[21, 23], [21, 15], [21, 19]]], ['Stolzer', 'Skutt', [[8, 21], [14, 21], [14, 21]]], ['Meyer', 'Stolzer', [[21, 15], [21, 10], [21, 11]]],
  ['Merk', 'Blankschein', [[21, 8], [21, 15]]], ['Arrowood', 'Konopack', [[16, 21], [21, 18]]], ['Merk', 'Konopack', [[21, 10], [21, 19]]],
  ['Arrowood', 'Blankschein', [[17, 21], [21, 18]]], ['Blankschein', 'Konopack', [[18, 21], [18, 21]]], ['Merk', 'Arrowood', [[21, 15], [21, 19]]],
  ['Maruyama', 'Johnson', [[21, 14], [21, 14]]], ['Patel', 'Hornstein', [[21, 11], [21, 16]]], ['Maruyama', 'Hornstein', [[17, 21], [21, 15]]],
  ['Patel', 'Johnson', [[21, 14], [21, 14]]], ['Johnson', 'Hornstein', [[21, 17], [23, 25]]], ['Maruyama', 'Patel', [[21, 18], [21, 15]]],
  ['Donovan', 'Carrera', [[21, 19], [17, 21]]], ['Hill', 'Swarens', [[21, 13], [21, 15]]], ['Donovan', 'Swarens', [[23, 25], [23, 25]]],
  ['Hill', 'Carrera', [[17, 21], [21, 23]]], ['Carrera', 'Swarens', [[22, 20], [21, 19]]], ['Donovan', 'Hill', [[21, 19], [21, 16]]],
  ['Kirschbaum', 'Paasch', [[21, 16], [16, 21]]], ['Haynes', 'Sundareswaram', [[21, 17], [21, 17]]], ['Kirschbaum', 'Sundareswaram', [[21, 18], [15, 21]]],
  ['Haynes', 'Paasch', [[19, 21], [21, 13]]], ['Paasch', 'Sundareswaram', [[21, 17], [19, 21]]], ['Kirschbaum', 'Haynes', [[21, 15], [17, 21]]],
]

// Bracket matches — [winner, loser]. Upset = winner's reseed is worse (higher number).
const BRACKET: [string, string][] = [
  ['Blankschein', 'Hornstein'], ['Stolzer', 'Arrowood'], ['Swarens', 'Johnson'],
  ['Merk', 'Blankschein'], ['Donovan', 'Kirschbaum'], ['Hill', 'Skutt'], ['Carrera', 'Sundareswaram'],
  ['Maruyama', 'Stolzer'], ['Patel', 'Paasch'], ['Haynes', 'Konopack'], ['Meyer', 'Swarens'],
  ['Merk', 'Donovan'], ['Hill', 'Carrera'], ['Patel', 'Maruyama'], ['Meyer', 'Haynes'],
  ['Merk', 'Hill'], ['Meyer', 'Patel'], ['Merk', 'Meyer'],
]

const entry = (name: string, value: number, detail: string): StatEntry => {
  const t = byName.get(name)!
  return { team: name, players: t.players, value, detail }
}
const rankTop = (rows: StatEntry[], n = 5) =>
  rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, n)

export function getStatLeaders(): StatBoard[] {
  // Giant Killers — bracket wins over a better seed (+ who they beat).
  const upsets = new Map<string, string[]>()
  for (const [w, l] of BRACKET) {
    const wt = byName.get(w)!, lt = byName.get(l)!
    if (wt.reseed > lt.reseed) {
      const arr = upsets.get(w) ?? []
      arr.push(l)
      upsets.set(w, arr)
    }
  }
  const giantKillers = rankTop(Array.from(upsets).map(([name, beat]) =>
    entry(name, beat.length, `beat ${beat.map((b: string) => `#${byName.get(b)!.reseed} ${b}`).join(', ')}`)))

  // Cinderella — finished above registration seed.
  const cinderella = rankTop(TEAMS.map((t) =>
    entry(t.name, t.initialSeed - placeRank(t.place), `seed #${t.initialSeed} → ${ordinal(t.place)}`)))

  // Dominance + Clutch — from pool sets.
  const setDiff = new Map<string, number>()
  const clutch = new Map<string, number>()
  for (const [t1, t2, sets] of POOL) {
    for (const [a, b] of sets) {
      const w = a > b ? t1 : t2, l = a > b ? t2 : t1
      setDiff.set(w, (setDiff.get(w) ?? 0) + 1); setDiff.set(l, (setDiff.get(l) ?? 0) - 1)
      if (Math.max(a, b) >= 22) clutch.set(w, (clutch.get(w) ?? 0) + 1) // reached deuce
    }
  }
  const dominance = rankTop(Array.from(setDiff).map(([name, d]) => entry(name, d, `${d > 0 ? '+' : ''}${d} pool set diff`)))
  const clutchBoard = rankTop(Array.from(clutch).map(([name, c]) => entry(name, c, `${c} deuce set${c === 1 ? '' : 's'} won`)))

  return [
    { key: 'giant-killers', title: 'Giant Killers', blurb: 'Bracket wins over a higher seed', unit: 'upsets', entries: giantKillers },
    { key: 'cinderella', title: 'Cinderella', blurb: 'Finished furthest above their seed', unit: 'spots', entries: cinderella },
    { key: 'dominance', title: 'Dominance', blurb: 'Best pool set differential', unit: 'set diff', entries: dominance },
    { key: 'clutch', title: 'Clutch', blurb: 'Most deuce (22+) sets won', unit: 'sets', entries: clutchBoard },
  ]
}

// Placement tiers map to a rank for the seed-vs-finish delta (5th = 5, 9th = 9, etc.).
function placeRank(place: number): number { return place }
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
