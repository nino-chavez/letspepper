/**
 * Match result for a college gallery-announce caption, looked up on The Rotation
 * (therotation.tv), which builds its college hubs from official NCAA/school feeds.
 *
 * Nino, 2026-09-26, on whether a college album's announcement may carry the result:
 * "this is college so not minors. and the data can be sourced from therotation.tv which
 * itself sourced from official sources". So the result is allowed for COLLEGE albums
 * only, and only as The Rotation states it. High-school, middle-school and club albums
 * never get one: those subjects are minors, and no sourced result exists for them here.
 *
 * What The Rotation publishes per college match (data.json `cols`): home, away, state
 * ("F" = final) and a match score written HOME-FIRST (volley-watch update.py builds it as
 * f"{home}-{away}"). It carries no set scores, so the caption never states any.
 *
 * Every miss is a reason, never a guess: a non-college album, a fetch failure, an album
 * name without "<team> at|vs <team>" or a date, zero or several matches, or a match that
 * is not final all return { result: null, reason } and the announcement goes out without
 * a result line.
 */

const ROTATION_SITE = 'https://therotation.tv'

/** Album-name standard prefix "College ..." (canonical-album-naming.ts LEVEL_LABELS). */
export function isCollegeAlbum(albumName = '') {
  return /^College\b/.test(albumName.trim())
}

/** The Rotation's hub for the album's division: men's college is /men/, women's is the root. */
export function rotationDataUrl(albumName = '', site = ROTATION_SITE) {
  return /^College\s+Men's\b/i.test(albumName.trim()) ? `${site}/men/data.json` : `${site}/data.json`
}

/** "North Central (IL)" and "north central" compare equal; the state tag is a
 * disambiguator The Rotation adds, not part of the name an album uses. */
export function normalizeTeamName(name = '') {
  return name.replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** "College Women's VB - Millikin at North Central - 09-23-2026" ->
 * { teams: ['Millikin', 'North Central'], isoDate: '2026-09-23' } — album names order a
 * matchup "<away> at <home>" or "<a> vs <b>"; either way both names must match. */
export function parseMatchup(albumName = '') {
  const parts = albumName.split(' - ').map((s) => s.trim())
  const matchup = parts.find((p) => /\s(at|vs\.?)\s/i.test(p))
  const date = albumName.match(/(\d{2})-(\d{2})-(\d{4})\s*$/)
  if (!matchup || !date) return null
  const teams = matchup.split(/\s(?:at|vs\.?)\s/i).map((s) => s.trim())
  if (teams.length !== 2 || teams.some((t) => !t)) return null
  return { teams, isoDate: `${date[3]}-${date[1]}-${date[2]}` }
}

/**
 * Pure lookup against a parsed Rotation data.json. Returns
 * { result: { winner, loser, score, line }, reason: null } or { result: null, reason }.
 * `winner`/`loser` use the ALBUM's own team names, so the caption says "North Central",
 * matching the headline, not The Rotation's "North Central (IL)".
 */
export function findRotationResult(data, albumName) {
  const matchup = parseMatchup(albumName)
  if (!matchup) return { result: null, reason: `album name "${albumName}" has no "<team> at|vs <team>" segment and MM-DD-YYYY date` }
  const cols = data?.cols
  const teams = data?.teams
  if (!Array.isArray(cols) || !Array.isArray(teams) || !Array.isArray(data?.matches)) {
    return { result: null, reason: 'Rotation data.json is missing cols/teams/matches' }
  }
  const col = (name) => cols.indexOf(name)
  const [iDate, iHome, iAway, iState, iScore] = ['date', 'home', 'away', 'state', 'score'].map(col)
  if ([iDate, iHome, iAway, iState, iScore].some((i) => i < 0)) return { result: null, reason: 'Rotation data.json cols changed shape' }

  const wanted = matchup.teams.map(normalizeTeamName)
  const teamName = (idx) => (Array.isArray(teams[idx]) ? teams[idx][0] : teams[idx]?.name) ?? ''
  const hits = data.matches.filter((m) => {
    if (m[iDate] !== matchup.isoDate) return false
    const pair = [normalizeTeamName(teamName(m[iHome])), normalizeTeamName(teamName(m[iAway]))]
    return wanted.every((w) => pair.includes(w)) && pair.every((p) => wanted.includes(p))
  })
  if (hits.length === 0) return { result: null, reason: `no Rotation match for ${matchup.teams.join(' / ')} on ${matchup.isoDate}` }
  if (hits.length > 1) return { result: null, reason: `${hits.length} Rotation matches for ${matchup.teams.join(' / ')} on ${matchup.isoDate} — ambiguous` }

  const m = hits[0]
  if (m[iState] !== 'F') return { result: null, reason: `the Rotation match is not final (state "${m[iState]}")` }
  const score = /^(\d+)-(\d+)$/.exec(m[iScore] || '')
  if (!score) return { result: null, reason: `the Rotation match has no usable score ("${m[iScore]}")` }

  const homeSets = Number(score[1])
  const awaySets = Number(score[2])
  if (homeSets === awaySets) return { result: null, reason: `the Rotation score "${m[iScore]}" has no winner` }
  const albumNameFor = (idx) => matchup.teams[wanted.indexOf(normalizeTeamName(teamName(idx)))]
  const homeWon = homeSets > awaySets
  const winner = albumNameFor(homeWon ? m[iHome] : m[iAway])
  const loser = albumNameFor(homeWon ? m[iAway] : m[iHome])
  const scoreLine = `${Math.max(homeSets, awaySets)}-${Math.min(homeSets, awaySets)}`
  return { result: { winner, loser, score: scoreLine, line: `${winner} won ${scoreLine}.` }, reason: null }
}

/** Network wrapper: college albums only; never throws. */
export async function lookupCollegeResult(albumName, { fetchImpl = fetch, site = ROTATION_SITE } = {}) {
  if (!isCollegeAlbum(albumName)) return { result: null, reason: 'not a college album — results are only stated for college (Nino, 2026-09-26)' }
  const url = rotationDataUrl(albumName, site)
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return { result: null, reason: `${url} returned ${res.status}` }
    return findRotationResult(await res.json(), albumName)
  } catch (e) {
    return { result: null, reason: `could not read ${url}: ${e.message}` }
  }
}
