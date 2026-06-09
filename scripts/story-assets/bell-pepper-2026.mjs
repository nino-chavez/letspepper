/**
 * Bell Pepper Open 2026 — canonical result data (single source of truth).
 *
 * Every story-asset renderer (results, standings, highlights) imports the roster,
 * bracket reseed, and bracket finish from HERE — never re-types it. Verified
 * 2026-06-08 against BOTH the organizer sheet ("19 Team Playoff" bracket) and the
 * Rally HQ DB (tournament `bell-pepper-open-2026`, 58 matches complete): rosters,
 * `seed` (post-pool bracket reseed == DB bracket_seed), and `place` (bracket finish)
 * all agree across all three sources.
 *
 *   reg   = registration / team number (organizer's intake order)
 *   seed  = post-pool bracket reseed (1 = top seed entering the playoff)
 *   place = bracket finish (ties share a place: 3 = semis, 5 = quarters, 9 = R16, 17 = play-in)
 */

export const EVENT = { year: '2026', date: 'June 7, 2026', loc: 'Aurora, IL', format: 'Grass Triples · 3v3' }

export const TEAMS = [
  { reg: '13', players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'], place: 1, seed: 1 },
  { reg: '02', players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'], place: 2, seed: 2 },
  { reg: '05', players: ['David Hill', 'Quinn Bozarth', 'Braxton Francis'], place: 3, seed: 12 },
  { reg: '07', players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'], place: 3, seed: 6 },
  { reg: '10', players: ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney'], place: 5, seed: 8 },
  { reg: '11', players: ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer'], place: 5, seed: 4 },
  { reg: '01', players: ['Nick Maruyama', 'Braydon Savitski-Lynde', 'Lincoln Geist'], place: 5, seed: 3 },
  { reg: '09', players: ['Everett Haynes', 'Will Mensching', 'Blayr Young'], place: 5, seed: 7 },
  { reg: '08', players: ['Erik Kirschbaum', 'Mike Hallman', 'Joe Glatz'], place: 9, seed: 9 },
  { reg: '04', players: ['Elijah Skutt', 'Owen Randel', 'Ian'], place: 9, seed: 5 },
  { reg: '12', players: ['Sriram Sundareswaram', 'Cedric', 'Shane'], place: 9, seed: 13 },
  { reg: '15', players: ['Pat Paasch', 'Joel Paasch'], place: 9, seed: 11 },
  { reg: '18', players: ['Noah Konopack', 'Josh Bloom', 'Ray Driver'], place: 9, seed: 10 },
  { reg: '16', players: ['Tom Blankschein', 'Rolando', 'Jack Huizinga'], place: 9, seed: 17 },
  { reg: '03', players: ['Jack Stolzer', 'Will Elias', 'Ty Steponaitus'], place: 9, seed: 19 },
  { reg: '19', players: ['Kyle Swarens', 'Carter Geiger', 'Tony Solis'], place: 9, seed: 15 },
  { reg: '06', players: ['Brad Hornstein', 'Cooper Hansen', 'Mason Kolar'], place: 17, seed: 16 },
  { reg: '17', players: ['Justin Arrowood', 'Ben Boron', 'Bella Thompson'], place: 17, seed: 14 },
  { reg: '14', players: ['David Johnson', 'Tam', 'Kenyon Hayes'], place: 17, seed: 18 },
].map(t => ({ ...t, surnames: t.players.map(p => p.split(' ').slice(-1)[0].toUpperCase()).join(' · '),
  slug: t.players[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '') }))

/* ─────────────────────────  placement tiers  ───────────────────────── */
// No prize money on public assets — some competitors are college players (NCAA
// eligibility). Accolades only, never a purse.
export const GOLD = '#facc15', GREEN = '#4ade80', PALE = '#a7f3c0', NEUT = 'rgba(245,245,240,0.82)'
export const TIER = {
  1:  { place: '1st Place',  short: '1st',   label: 'CHAMPIONS',     accent: GOLD,  glow: 'rgba(250,204,21,0.55)', note: '' },
  2:  { place: '2nd Place',  short: '2nd',   label: 'RUNNER-UP',     accent: GREEN, glow: 'rgba(74,222,128,0.5)',  note: 'Finalist' },
  3:  { place: 'Tied · 3rd', short: 'T-3rd', label: 'SEMIFINALS',    accent: GREEN, glow: 'rgba(74,222,128,0.45)', note: 'Final Four' },
  5:  { place: 'Tied · 5th', short: 'T-5th', label: 'QUARTERFINALS', accent: GREEN, glow: 'rgba(74,222,128,0.38)', note: 'Elite Eight' },
  9:  { place: 'Tied · 9th', short: 'T-9th', label: 'ROUND OF 16',   accent: PALE,  glow: 'rgba(74,222,128,0.28)', note: '' },
  17: { place: 'Play-In',    short: '',      label: 'PLAY-IN ROUND', accent: NEUT,  glow: 'rgba(255,255,255,0.18)', note: '' },
}

/* ─────────────────────────  helpers  ───────────────────────── */
// English ordinal: 1→1st, 2→2nd, 3→3rd, 5→5th, 9→9th, 17→17th.
export const ordinal = (n) => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}` }
// Finish order: place ascending, then bracket reseed ascending within a tie.
export const byFinish = (a, b) => a.place - b.place || a.seed - b.seed
