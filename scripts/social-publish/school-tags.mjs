/**
 * Instagram handles to @-tag for a college gallery-announce album's two schools.
 *
 * Nino, 2026-09-26 (on the college result line, same authority this reuses): "this is
 * college so not minors. and the data can be sourced from therotation.tv which itself
 * sourced from official sources". So, like the result line, a school tag is sourced only
 * from The Rotation's own `socials` map — never scraped fresh from a school's website here
 * — and never for a high-school, middle-school, or club album (those subjects are minors).
 *
 * Two independent gates before a handle is ever tagged:
 *   1. The Rotation must carry it with `verified: 'graph'` (their own harvest already
 *      confirmed it through Instagram's business_discovery lookup — see their data.json
 *      header). An `unverified` entry (sourced from a school's own site, never confirmed)
 *      is never tagged.
 *   2. This module re-confirms it AGAIN, live, at build time (`confirmHandle`) — the same
 *      business_discovery lookup, so a handle that changed since The Rotation's harvest is
 *      caught rather than tagged stale.
 * A handle that fails either gate goes to `pending` — "for Nino to add by hand" — never to
 * `tags`. Never invents a handle: every value in `tags` traces to one `socials` array entry
 * this module read from The Rotation, re-confirmed itself.
 */
import { isCollegeAlbum, rotationDataUrl, findMatchupRow, normalizeTeamName } from './rotation-result.mjs'

// flickday.media's own ig_user_id — business_discovery requires the caller to look up a
// public account THROUGH one of its own owned Business accounts; which owned account makes
// the call is otherwise irrelevant. This is the same token/account this repo's Instagram
// publisher already uses (accounts.json).
const BUSINESS_DISCOVERY_ID = '17841474039989310'
const GRAPH = 'https://graph.facebook.com/v21.0'

/**
 * The album's two teams, independent of match `state` — reuses rotation-result.mjs's own
 * row-finding (`findMatchupRow`), so this can never disagree with the result line about
 * which match, or which team is which (the namesake case — "North Central (IL)" vs "North
 * Central (MN)" — is resolved by the match row's own home/away pointers there, not by name).
 * Returns `{ teams: [{ albumTeamName, key }, { albumTeamName, key }], reason: null }` or
 * `{ teams: null, reason }`.
 */
export function findMatchupTeamKeys(data, albumName) {
  const found = findMatchupRow(data, albumName, ['date', 'home', 'away'])
  if (!found.row) return { teams: null, reason: found.reason }
  const { row: m, teams, matchup, wanted, teamName, iHome, iAway } = found
  // Team rows have no published header of their own (unlike `matches`, which has `cols`) —
  // confirmed live against therotation.tv/data.json 2026-09-26: every row is a fixed
  // 9-element array with the team's slug key last. Reading the LAST element (not a bare
  // literal `8`) is what "confirm the index from the data rather than hardcoding it
  // blindly" means here: it keeps working if a column is ever inserted before it.
  const keyFor = (idx) => { const row = teams[idx]; return Array.isArray(row) ? row[row.length - 1] : row?.key }
  const albumNameFor = (idx) => matchup.teams[wanted.indexOf(normalizeTeamName(teamName(idx)))]
  return {
    teams: [
      { albumTeamName: albumNameFor(m[iHome]), key: keyFor(m[iHome]) },
      { albumTeamName: albumNameFor(m[iAway]), key: keyFor(m[iAway]) },
    ],
    reason: null,
  }
}

/**
 * From one team's `socials` entries: the Instagram handle, preferring `scope: 'program'`
 * (the volleyball program's own account) over `scope: 'athletics'` (the department's), and
 * `verified: 'graph'` only — an `unverified` entry (sourced from the school's own site, never
 * confirmed against Instagram) is never returned. Returns `{ handle, scope }` or null.
 */
export function pickSocialHandle(socialEntries = []) {
  const confirmed = (socialEntries || []).filter((s) => s?.platform === 'instagram' && s?.verified === 'graph')
  if (!confirmed.length) return null
  const picked = confirmed.find((s) => s.scope === 'program') || confirmed.find((s) => s.scope === 'athletics') || confirmed[0]
  return { handle: picked.handle, scope: picked.scope }
}

/**
 * Live re-confirmation of one handle via Instagram's business_discovery lookup — the exact
 * call the orchestrator verified live (2026-09-26): any public Business/Creator account is
 * discoverable through an owned Business account's token. Never throws: a network failure,
 * an API error, or a returned username that doesn't match is all treated the same as "not
 * confirmable right now" — the caller sends the handle to `pending`, never to `tags`.
 */
export async function confirmHandle(handle, { fetchImpl = fetch, token } = {}) {
  if (!handle) return { confirmed: false, reason: 'no handle to confirm' }
  if (!token) return { confirmed: false, reason: 'no Meta token available to confirm this handle' }
  try {
    const fields = `business_discovery.username(${handle}){username,name}`
    const url = `${GRAPH}/${BUSINESS_DISCOVERY_ID}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`
    const res = await fetchImpl(url)
    const json = await res.json()
    if (!res.ok || json.error) return { confirmed: false, reason: json.error?.message || `business_discovery returned ${res.status}` }
    const found = json.business_discovery?.username
    if (!found || found.toLowerCase() !== handle.toLowerCase()) {
      return { confirmed: false, reason: `business_discovery did not confirm @${handle}` }
    }
    return { confirmed: true, reason: null }
  } catch (e) {
    return { confirmed: false, reason: `could not confirm @${handle}: ${e.message}` }
  }
}

/**
 * Orchestrates the above for one gallery-announce album. Never throws — every failure mode
 * (not college, fetch failure, no matchup, ambiguous, cols changed shape, no verified handle,
 * confirmation failure) degrades to an empty/partial result with a reason, so a school-tag
 * problem never blocks the album's announcement.
 *
 * Returns:
 *   tags:    [{ albumTeamName, key, handle, scope }]  — confirmed; safe to @-tag/@-mention.
 *   pending: [{ albumTeamName, key, handle, reason }] — "for Nino to add by hand"; handle is
 *            null when The Rotation had no graph-verified Instagram entry at all for that team.
 *   reason:  set only when NEITHER team could be looked up at all (both arrays empty then).
 */
export async function schoolTagsForAlbum(albumName, { fetchImpl = fetch, token, site } = {}) {
  if (!isCollegeAlbum(albumName)) {
    return { tags: [], pending: [], reason: 'not a college album — school tags are only sourced for college (Nino, 2026-09-26)' }
  }
  const url = rotationDataUrl(albumName, site)
  let data
  try {
    const res = await fetchImpl(url)
    if (!res.ok) return { tags: [], pending: [], reason: `${url} returned ${res.status}` }
    data = await res.json()
  } catch (e) {
    return { tags: [], pending: [], reason: `could not read ${url}: ${e.message}` }
  }

  const { teams, reason } = findMatchupTeamKeys(data, albumName)
  if (!teams) return { tags: [], pending: [], reason }

  const tags = []
  const pending = []
  for (const t of teams) {
    const picked = pickSocialHandle(data.socials?.[t.key])
    if (!picked) {
      pending.push({ albumTeamName: t.albumTeamName, key: t.key, handle: null, reason: 'no graph-verified Instagram handle on The Rotation for this team' })
      continue
    }
    const { confirmed, reason: confirmReason } = await confirmHandle(picked.handle, { fetchImpl, token })
    if (!confirmed) {
      pending.push({ albumTeamName: t.albumTeamName, key: t.key, handle: picked.handle, reason: confirmReason })
      continue
    }
    tags.push({ albumTeamName: t.albumTeamName, key: t.key, handle: picked.handle, scope: picked.scope })
  }
  return { tags, pending, reason: null }
}
