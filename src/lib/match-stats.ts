/**
 * Let's Pepper — match-level "stat leader" boards for the series' latest
 * completed tournament (Giant Killers / Cinderella / Dominance / Clutch).
 *
 * Pure computation over normalized team + match data. The RHQ fetch (which
 * tournament is "latest", teams with roster/bracket_seed, full match list with
 * per-set scores) lives in rally-hq.ts's getMatchStatLeaders — this module has
 * no network dependency, so it stays unit-testable.
 *
 *   - Giant Killers — bracket wins over a higher (better) reseed.
 *   - Cinderella    — finished above registration seed (seed − placement).
 *   - Dominance     — pool set differential.
 *   - Clutch        — deuce sets won (winner reached 22+).
 */

export interface StatEntry { team: string; players: string[]; value: number; detail: string }
export interface StatBoard { key: string; title: string; blurb: string; unit: string; entries: StatEntry[] }

/** One team, normalized for stat computation. `reseed` = post-pool bracket_seed;
 *  `initialSeed` = registration seed; `placement` = final bracket finish. Any of
 *  the three may be null (single-elim tournaments skip reseed; an unresolved
 *  bracket has no placement) — boards that need a missing field skip that team. */
export interface MatchStatsTeam {
  id: string
  name: string
  players: string[]
  initialSeed: number | null
  reseed: number | null
  placement: number | null
}

/** One match, normalized for stat computation. `sets` is null for matches with
 *  no per-set scoreline recorded. */
export interface MatchStatsMatch {
  round: string | null
  team1Id: string | null
  team2Id: string | null
  winnerId: string | null
  status: string
  sets: { team1: number; team2: number }[] | null
}

const isPoolRound = (round: string | null) => (round ?? '').toLowerCase().startsWith('pool')

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function computeStatLeaders(teams: MatchStatsTeam[], matches: MatchStatsMatch[]): StatBoard[] {
  const byId = new Map(teams.map((t) => [t.id, t]))

  const entry = (id: string, value: number, detail: string): StatEntry | null => {
    const t = byId.get(id)
    return t ? { team: t.name, players: t.players, value, detail } : null
  }
  const rankTop = (rows: (StatEntry | null)[], n = 5) =>
    rows.filter((r): r is StatEntry => r !== null && r.value > 0).sort((a, b) => b.value - a.value).slice(0, n)

  const poolMatches = matches.filter((m) => isPoolRound(m.round) && m.sets && m.sets.length > 0)
  const bracketMatches = matches.filter((m) => !isPoolRound(m.round) && m.status === 'complete' && m.winnerId)

  // Giant Killers — bracket win where the winner's reseed is worse (numerically
  // higher) than the loser's. Needs both teams' reseed; skips single-elim fields
  // (or any team never reseeded) rather than mislabeling a same-seed win.
  const upsets = new Map<string, string[]>()
  for (const m of bracketMatches) {
    const winnerId = m.winnerId!
    const loserId = winnerId === m.team1Id ? m.team2Id : m.team1Id
    if (!loserId) continue
    const wt = byId.get(winnerId), lt = byId.get(loserId)
    if (wt?.reseed == null || lt?.reseed == null) continue
    if (wt.reseed > lt.reseed) {
      const arr = upsets.get(winnerId) ?? []
      arr.push(loserId)
      upsets.set(winnerId, arr)
    }
  }
  const giantKillers = rankTop(Array.from(upsets).map(([id, beatIds]) =>
    entry(id, beatIds.length, `beat ${beatIds.map((bid) => `#${byId.get(bid)!.reseed} ${byId.get(bid)!.name}`).join(', ')}`)))

  // Cinderella — finished above registration seed.
  const cinderella = rankTop(teams
    .filter((t) => t.initialSeed != null && t.placement != null)
    .map((t) => entry(t.id, t.initialSeed! - t.placement!, `seed #${t.initialSeed} → ${ordinal(t.placement!)}`)))

  // Dominance + Clutch — from pool set scores.
  const setDiff = new Map<string, number>()
  const clutch = new Map<string, number>()
  for (const m of poolMatches) {
    if (!m.team1Id || !m.team2Id) continue
    for (const s of m.sets!) {
      const winnerId = s.team1 > s.team2 ? m.team1Id : m.team2Id
      const loserId = s.team1 > s.team2 ? m.team2Id : m.team1Id
      setDiff.set(winnerId, (setDiff.get(winnerId) ?? 0) + 1)
      setDiff.set(loserId, (setDiff.get(loserId) ?? 0) - 1)
      if (Math.max(s.team1, s.team2) >= 22) clutch.set(winnerId, (clutch.get(winnerId) ?? 0) + 1)
    }
  }
  const dominance = rankTop(Array.from(setDiff).map(([id, d]) => entry(id, d, `${d > 0 ? '+' : ''}${d} pool set diff`)))
  const clutchBoard = rankTop(Array.from(clutch).map(([id, c]) => entry(id, c, `${c} deuce set${c === 1 ? '' : 's'} won`)))

  return [
    { key: 'giant-killers', title: 'Giant Killers', blurb: 'Bracket wins over a higher seed', unit: 'upsets', entries: giantKillers },
    { key: 'cinderella', title: 'Cinderella', blurb: 'Finished furthest above their seed', unit: 'spots', entries: cinderella },
    { key: 'dominance', title: 'Dominance', blurb: 'Best pool set differential', unit: 'set diff', entries: dominance },
    { key: 'clutch', title: 'Clutch', blurb: 'Most deuce (22+) sets won', unit: 'sets', entries: clutchBoard },
  ]
}
