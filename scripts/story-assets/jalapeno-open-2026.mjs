/**
 * Jalapeño Open 2026 — canonical result data (single source of truth).
 *
 * Mirrors bell-pepper-2026.mjs's shape exactly. Every story-asset renderer
 * (results, standings, highlights, team-social) should import the roster,
 * bracket reseed, and bracket finish from HERE — never re-type it.
 *
 * REAL BRACKET DATA — played July 18, 2026 at Nature Meadows Park, Aurora, IL.
 * Format was 10-team DOUBLE ELIMINATION (not the single-elim reseed the earlier
 * placeholder assumed), so placement is a clean 1-2-3-4-5-5-7-7-9-9 spread —
 * every non-podium round elimination gets its own tier below. Source: the
 * event bracket/pool-play sheet + captain roster, reconciled 2026-07-20.
 * Joe Martens' incomplete signup never fielded a team; Ever Ortega's and Tony
 * Solis's late signups filled the field to 10.
 *
 *   reg   = registration / team number (organizer's intake order)
 *   seed  = bracket seed (from the bracket's own "Seed N" labels, which drove
 *           byes vs. play-in — not the separate pre-event seeding-tab numbers,
 *           which drifted from what was actually run)
 *   place = bracket finish (ties share a place: 5/7/9 are each a losers-bracket
 *           round eliminating two teams at once)
 */

export const EVENT = { year: '2026', date: 'July 18, 2026', loc: 'Aurora, IL', format: 'Grass Triples · 3v3' }

export const TEAMS = [
  { reg: '01', players: ['Nick Maruyama', 'Lincoln Geist', 'Jakobi Lange'], place: 3, seed: 2 },
  { reg: '02', players: ['Manny Campuzano', 'Will Mensching', 'Kevin Messer'], place: 5, seed: 5 },
  { reg: '03', players: ['Jeremiah Aro', 'Jt Snider', 'Aaron Dennie'], place: 7, seed: 9 },
  { reg: '04', players: ['Nate Meyer', 'Charlie Podgorny', 'Ethan Carroll'], place: 1, seed: 1 },
  { reg: '05', players: ['Noah Konopack', 'Connor Jaral', 'Nolan Krygsheld'], place: 4, seed: 6 },
  { reg: '06', players: ['Nathen Toth', 'Christian Teresi', 'Andrew Flores'], place: 2, seed: 3 },
  { reg: '07', players: ['Nathaniel Cossyleon', 'Alec Donald', 'Kenyon Haynes'], place: 9, seed: 10 },
  { reg: '08', players: ['Quinn Bozarth', 'David Hill', 'Charlie Clifford'], place: 5, seed: 4 },
  { reg: '09', players: ['Ever Ortega', 'Danny Ortega', 'Edwin Rojas'], place: 7, seed: 7 },
  { reg: '10', players: ['Tony Solis', 'Danny Overlin', 'Brayden Tejeda'], place: 9, seed: 8 },
].map(t => ({ ...t, surnames: t.players.map(p => p.split(' ').slice(-1)[0].toUpperCase()).join(' · '),
  slug: t.players[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '') }))

// Captain → Instagram handle, sourced from the team-signup response sheet
// (2026-07-20). Only captains who supplied a handle appear here — match by
// team slug (first player). Feed-post captions can @mention these; Stories
// can't carry a functional IG tag via the Graph API, so these never render
// as on-card text — feed posts only (see render-jalapeno-standings.mjs).
export const CAPTAIN_IG = {
  'manny-campuzano': 'manny_camp',
  'jeremiah-aro': 'jeremiaharo',
  'nate-meyer': 'Nate__meyer',
  'noah-konopack': 'nkonopack',
  'nathen-toth': 'Nate.toth23',
  'ever-ortega': '_everortega_',
  'tony-solis': 'tonyy.solis',
  // Nathaniel Cossyleon's sheet entry ("ffffffffffffffffff_ffff") reads as a
  // junk/placeholder value, not a real handle — deliberately omitted.
  // Nick Maruyama and Quinn Bozarth didn't supply a handle.
}

/* ─────────────────────────  placement tiers  ───────────────────────── */
// No prize money on public assets — some competitors are college players (NCAA
// eligibility). Accolades only, never a purse.
export const GOLD = '#facc15', ORANGE = '#f97316', PALE = '#fed7aa', NEUT = 'rgba(245,245,240,0.82)'
export const TIER = {
  1: { place: '1st Place',  short: '1st',   label: 'CHAMPIONS',   accent: GOLD,   glow: 'rgba(250,204,21,0.55)', note: '' },
  2: { place: '2nd Place',  short: '2nd',   label: 'RUNNER-UP',   accent: ORANGE, glow: 'rgba(249,115,22,0.5)',  note: 'Grand Final' },
  3: { place: '3rd Place',  short: '3rd',   label: 'THIRD',       accent: ORANGE, glow: 'rgba(249,115,22,0.45)', note: 'Losers Final' },
  4: { place: '4th Place',  short: '4th',   label: 'FOURTH',      accent: ORANGE, glow: 'rgba(249,115,22,0.4)',  note: '' },
  5: { place: 'Tied · 5th', short: 'T-5th', label: 'FIFTH',       accent: PALE,   glow: 'rgba(249,115,22,0.32)', note: '' },
  7: { place: 'Tied · 7th', short: 'T-7th', label: 'SEVENTH',     accent: PALE,   glow: 'rgba(249,115,22,0.26)', note: '' },
  9: { place: 'Tied · 9th', short: 'T-9th', label: 'NINTH',       accent: NEUT,   glow: 'rgba(255,255,255,0.18)', note: 'Play-In' },
}

/* ─────────────────────────  helpers  ───────────────────────── */
// English ordinal: 1→1st, 2→2nd, 3→3rd, 5→5th, 9→9th, 17→17th.
export const ordinal = (n) => { const v = n % 100; return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] || ['th', 'st', 'nd', 'rd'][v] || 'th'}` }
// Finish order: place ascending, then bracket reseed ascending within a tie.
export const byFinish = (a, b) => a.place - b.place || a.seed - b.seed
