import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findMatchupTeamKeys, pickSocialHandle, confirmHandle, schoolTagsForAlbum,
} from '../school-tags.mjs'
import { applySchoolTagsToChildren } from '../build-gallery-announce.mjs'
import { buildGalleryAnnounceCaption } from '../gallery-announce-caption.mjs'

const DWDCET = "College Women's VB - Millikin at North Central - 09-23-2026"
const HS_ALBUM = 'HS Girls VB - JCA at ACC - 09-22-2026'
const COLS = ['id', 'div', 'date', 'epoch', 'home', 'away', 'tv', 'state', 'score', 'tier', 'pts', 'why', 'neutral', 'venue', 'loc', 'wurl', 'tourn', 'kind']

/** Shaped like therotation.tv/data.json, with the real 2026-09-23 row (id 6635142), the real
 * team entries (Millikin at 0, North Central (IL) at 1, North Central (MN) at 2 — a genuine
 * namesake pair, disambiguated only by the match row's own home/away pointers), and a
 * `socials` map keyed by each team's OWN slug (last element of its row — see
 * findMatchupTeamKeys's comment on why that's read positionally, not by a hardcoded index). */
function rotation({ matches, socials = {} } = {}) {
  return {
    cols: COLS,
    teams: [
      ['Millikin', 61, 0, 0, '8-7', 593, 'https://athletics.millikin.edu/x', 141, 'millikin'],
      ['North Central (IL)', 61, 0, 0, '5-4', 685, 'https://northcentralcardinals.com/x', 91, 'north-central-il'],
      ['North Central (MN)', 94, 0, 0, '4-5', 484, 'https://ncurams.com/x', 366, 'north-central-mn'],
    ],
    matches: (matches || [REAL]).map((m) => COLS.map((c) => m[c] ?? '')),
    socials,
  }
}
const REAL = { id: 6635142, date: '2026-09-23', home: 1, away: 0, state: 'F', score: '3-0' }

const GRAPH_VERIFIED = (handle, scope) => ({ platform: 'instagram', handle, url: `https://www.instagram.com/${handle}/`, scope, verified: 'graph' })
const UNVERIFIED = (handle, scope) => ({ platform: 'instagram', handle, url: `https://www.instagram.com/${handle}/`, scope, verified: 'unverified' })

// --- findMatchupTeamKeys: reuses rotation-result.mjs's own match-finding -----------------

test('findMatchupTeamKeys: resolves both teams to their Rotation slug keys, in album order', () => {
  const { teams, reason } = findMatchupTeamKeys(rotation(), DWDCET)
  assert.equal(reason, null)
  assert.deepEqual(teams, [
    { albumTeamName: 'North Central', key: 'north-central-il' },
    { albumTeamName: 'Millikin', key: 'millikin' },
  ])
})

test('findMatchupTeamKeys: a namesake elsewhere in `teams` (North Central (MN)) is never picked — the match row\'s own home/away index decides, not a name scan', () => {
  const { teams } = findMatchupTeamKeys(rotation(), DWDCET)
  assert.ok(teams.every((t) => t.key !== 'north-central-mn'))
})

test('findMatchupTeamKeys: independent of match `state` — an in-progress or scheduled match still resolves team keys', () => {
  const { teams, reason } = findMatchupTeamKeys(rotation({ matches: [{ ...REAL, state: 'P', score: '' }] }), DWDCET)
  assert.equal(reason, null)
  assert.equal(teams.length, 2)
})

test('findMatchupTeamKeys: no matchup, no match, or ambiguous all return null with a reason', () => {
  assert.match(findMatchupTeamKeys(rotation(), "Diggin' for Drakes - 08-09-2026").reason, /no "<team>/)
  assert.match(findMatchupTeamKeys(rotation({ matches: [{ ...REAL, date: '2026-09-24' }] }), DWDCET).reason, /no Rotation match/)
  assert.match(findMatchupTeamKeys(rotation({ matches: [REAL, { ...REAL, id: 2, home: 2 }] }), DWDCET).reason, /ambiguous/)
})

// --- pickSocialHandle: program over athletics, graph-verified only ----------------------

test('pickSocialHandle: prefers scope "program" over "athletics" when both are graph-verified', () => {
  const picked = pickSocialHandle([GRAPH_VERIFIED('ncc_athletics', 'athletics'), GRAPH_VERIFIED('nccwomensvb', 'program')])
  assert.deepEqual(picked, { handle: 'nccwomensvb', scope: 'program' })
})

test('pickSocialHandle: falls back to "athletics" when no "program" entry exists', () => {
  const picked = pickSocialHandle([GRAPH_VERIFIED('mubigblue', 'athletics')])
  assert.deepEqual(picked, { handle: 'mubigblue', scope: 'athletics' })
})

test('pickSocialHandle: an "unverified" entry is never picked, even alone, even scope "program"', () => {
  assert.equal(pickSocialHandle([UNVERIFIED('somehandle', 'program')]), null)
  assert.equal(pickSocialHandle([UNVERIFIED('somehandle', 'program'), { platform: 'x', handle: 'other', verified: 'graph' }]), null)
})

test('pickSocialHandle: no entries, or no instagram platform entries, returns null', () => {
  assert.equal(pickSocialHandle([]), null)
  assert.equal(pickSocialHandle(undefined), null)
  assert.equal(pickSocialHandle([{ platform: 'x', handle: 'somehandle', verified: 'graph' }]), null)
})

// --- confirmHandle: live re-confirmation, never throws -----------------------------------

test('confirmHandle: confirmed when business_discovery echoes the same username', async () => {
  const r = await confirmHandle('nccwomensvb', {
    token: 'tok', fetchImpl: async () => Response.json({ business_discovery: { username: 'nccwomensvb', name: 'NCC' } }),
  })
  assert.deepEqual(r, { confirmed: true, reason: null })
})

test('confirmHandle: no token — never calls fetch, reason says why', async () => {
  let called = false
  const r = await confirmHandle('nccwomensvb', { fetchImpl: async () => { called = true } })
  assert.equal(r.confirmed, false)
  assert.equal(called, false)
  assert.match(r.reason, /no Meta token/)
})

test('confirmHandle: a Graph error, a mismatched username, or a thrown fetch all fail closed, never throw', async () => {
  const errored = await confirmHandle('h', { token: 't', fetchImpl: async () => Response.json({ error: { message: 'bad' } }) })
  assert.equal(errored.confirmed, false)
  const mismatched = await confirmHandle('h', { token: 't', fetchImpl: async () => Response.json({ business_discovery: { username: 'different' } }) })
  assert.equal(mismatched.confirmed, false)
  const thrown = await confirmHandle('h', { token: 't', fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(thrown.confirmed, false)
  assert.match(thrown.reason, /offline/)
})

// --- schoolTagsForAlbum: the full orchestration ------------------------------------------

function stubRotationAndGraph({ data, confirmed = new Set() }) {
  return async (url) => {
    const u = String(url)
    if (u.includes('therotation.tv')) return Response.json(data)
    if (u.includes('graph.facebook.com')) {
      const handle = decodeURIComponent(new URL(u).searchParams.get('fields')).match(/username\(([^)]+)\)/)[1]
      if (!confirmed.has(handle)) return Response.json({ error: { message: 'not found' } })
      return Response.json({ business_discovery: { username: handle, name: 'x' } })
    }
    throw new Error(`stub: unexpected URL ${u}`)
  }
}

test('schoolTagsForAlbum: a high-school album is refused before any network call — never sourced for minors', async () => {
  let called = false
  const r = await schoolTagsForAlbum(HS_ALBUM, { fetchImpl: async () => { called = true }, token: 'tok' })
  assert.deepEqual(r, { tags: [], pending: [], reason: 'not a college album — school tags are only sourced for college (Nino, 2026-09-26)' })
  assert.equal(called, false)
})

test('schoolTagsForAlbum: both schools tagged when both are graph-verified AND live-reconfirmed (the real DWdCET shape)', async () => {
  const data = rotation({ socials: { 'north-central-il': [GRAPH_VERIFIED('nccwomensvb', 'program')], millikin: [GRAPH_VERIFIED('mubigblue', 'athletics')] } })
  const fetchImpl = stubRotationAndGraph({ data, confirmed: new Set(['nccwomensvb', 'mubigblue']) })
  const r = await schoolTagsForAlbum(DWDCET, { fetchImpl, token: 'tok' })
  assert.equal(r.reason, null)
  assert.equal(r.pending.length, 0)
  assert.deepEqual(r.tags, [
    { albumTeamName: 'North Central', key: 'north-central-il', handle: 'nccwomensvb', scope: 'program' },
    { albumTeamName: 'Millikin', key: 'millikin', handle: 'mubigblue', scope: 'athletics' },
  ])
})

test('schoolTagsForAlbum: an unverified-only team goes to pending, never tags, and never even reaches confirmHandle', async () => {
  const data = rotation({ socials: { 'north-central-il': [UNVERIFIED('someoldhandle', 'program')], millikin: [GRAPH_VERIFIED('mubigblue', 'athletics')] } })
  let graphCalls = 0
  const fetchImpl = async (url) => {
    const u = String(url)
    if (u.includes('therotation.tv')) return Response.json(data)
    graphCalls += 1
    return Response.json({ business_discovery: { username: 'mubigblue' } })
  }
  const r = await schoolTagsForAlbum(DWDCET, { fetchImpl, token: 'tok' })
  assert.equal(graphCalls, 1, 'only the graph-verified handle is ever sent to business_discovery')
  assert.deepEqual(r.tags, [{ albumTeamName: 'Millikin', key: 'millikin', handle: 'mubigblue', scope: 'athletics' }])
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].albumTeamName, 'North Central')
  assert.equal(r.pending[0].handle, null)
  assert.match(r.pending[0].reason, /no graph-verified/)
})

test('schoolTagsForAlbum: graph-verified on Rotation but NOT live-reconfirmable (changed since harvest) goes to pending, not tags', async () => {
  const data = rotation({ socials: { 'north-central-il': [GRAPH_VERIFIED('staleHandle', 'program')], millikin: [GRAPH_VERIFIED('mubigblue', 'athletics')] } })
  const fetchImpl = stubRotationAndGraph({ data, confirmed: new Set(['mubigblue']) }) // staleHandle deliberately NOT confirmed
  const r = await schoolTagsForAlbum(DWDCET, { fetchImpl, token: 'tok' })
  assert.deepEqual(r.tags, [{ albumTeamName: 'Millikin', key: 'millikin', handle: 'mubigblue', scope: 'athletics' }])
  assert.equal(r.pending.length, 1)
  assert.equal(r.pending[0].handle, 'staleHandle')
})

test('schoolTagsForAlbum: never throws on a Rotation fetch failure — both arrays empty, a reason instead', async () => {
  const r = await schoolTagsForAlbum(DWDCET, { fetchImpl: async () => { throw new Error('offline') }, token: 'tok' })
  assert.deepEqual(r.tags, [])
  assert.deepEqual(r.pending, [])
  assert.match(r.reason, /offline/)
})

// --- applySchoolTagsToChildren (build-gallery-announce.mjs): placement ------------------

test('applySchoolTagsToChildren: confirmed tags land ONLY on the first slide, with required x/y, never on later slides', () => {
  const children = [{ media_type: 'IMAGE', image_url: 'a' }, { media_type: 'IMAGE', image_url: 'b' }, { media_type: 'IMAGE', image_url: 'c' }]
  const tags = [{ handle: 'nccwomensvb' }, { handle: 'mubigblue' }]
  const out = applySchoolTagsToChildren(children, tags)
  assert.equal(out[1].user_tags, undefined)
  assert.equal(out[2].user_tags, undefined)
  assert.equal(out[0].user_tags.length, 2)
  for (const t of out[0].user_tags) {
    assert.equal(typeof t.username, 'string')
    assert.ok(t.x >= 0 && t.x <= 1, 'x must be within 0.0-1.0 (Meta requires this for an image user_tag)')
    assert.ok(t.y >= 0 && t.y <= 1)
  }
  assert.notEqual(out[0].user_tags[0].x, out[0].user_tags[1].x, 'two tags never share a position')
})

test('applySchoolTagsToChildren: a no-op with no confirmed tags, or no children', () => {
  const children = [{ media_type: 'IMAGE', image_url: 'a' }]
  assert.deepEqual(applySchoolTagsToChildren(children, []), children)
  assert.deepEqual(applySchoolTagsToChildren([], [{ handle: 'x' }]), [])
})

// --- caption mention line: Instagram only, college only, confirmed only ----------------

test('caption: the Instagram mention line lists confirmed school handles; Facebook never gets one', () => {
  const args = { albumName: DWDCET, venue: 'Gregory Arena, Naperville', selectedOf: '10 of 43', series: 'other', schoolTags: [{ handle: 'nccwomensvb' }, { handle: 'mubigblue' }] }
  const ig = buildGalleryAnnounceCaption({ ...args, channel: 'instagram' })
  assert.match(ig, /@nccwomensvb.*@mubigblue/)
  const fb = buildGalleryAnnounceCaption({ ...args, channel: 'facebook' })
  assert.doesNotMatch(fb, /@nccwomensvb/)
  assert.doesNotMatch(fb, /@mubigblue/)
})

test('caption: no mention line when there are no confirmed tags', () => {
  const ig = buildGalleryAnnounceCaption({ albumName: DWDCET, selectedOf: '10 of 43', series: 'other', schoolTags: [] })
  assert.doesNotMatch(ig, /@/)
})

test('caption: a high-school album never gets a mention line, even if a caller passes schoolTags by mistake', () => {
  const ig = buildGalleryAnnounceCaption({ albumName: HS_ALBUM, selectedOf: '8 of 120', series: 'other', schoolTags: [{ handle: 'someschool' }] })
  assert.doesNotMatch(ig, /@someschool/)
})
