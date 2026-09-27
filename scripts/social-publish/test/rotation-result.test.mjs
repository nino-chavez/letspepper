import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isCollegeAlbum, rotationDataUrl, normalizeTeamName, parseMatchup, findRotationResult, lookupCollegeResult,
} from '../rotation-result.mjs'
import { buildGalleryAnnounceCaption } from '../gallery-announce-caption.mjs'
import { seriesForAccount, accountForSeries } from '../build-gallery-announce.mjs'

const DWDCET = "College Women's VB - Millikin at North Central - 09-23-2026"
const COLS = ['id', 'div', 'date', 'epoch', 'home', 'away', 'tv', 'state', 'score', 'tier', 'pts', 'why', 'neutral', 'venue', 'loc', 'wurl', 'tourn', 'kind']

// Shaped like therotation.tv/data.json, with the real 2026-09-23 row (id 6635142) and the
// real team entries: North Central (IL) at index 1, Millikin at 0, North Central (MN) at 2.
function rotation(matches) {
  return {
    cols: COLS,
    teams: [['Millikin', 61, 0, 0, '8-7'], ['North Central (IL)', 61, 0, 0, '5-4'], ['North Central (MN)', 94, 0, 0, '4-5'], ['Ripon', 61]],
    matches: matches.map((m) => COLS.map((c) => m[c] ?? '')),
  }
}
const REAL = { id: 6635142, date: '2026-09-23', home: 1, away: 0, state: 'F', score: '3-0' }

test('isCollegeAlbum: only the "College" level prefix counts', () => {
  assert.equal(isCollegeAlbum(DWDCET), true)
  assert.equal(isCollegeAlbum('HS Girls VB - JCA at ACC - 09-22-2026'), false)
  assert.equal(isCollegeAlbum('Club VB - A at B - 09-22-2026'), false)
})

test('rotationDataUrl: men\'s college reads /men/, women\'s reads the root hub', () => {
  assert.equal(rotationDataUrl(DWDCET), 'https://therotation.tv/data.json')
  assert.equal(rotationDataUrl("College Men's VB - Lewis at UCLA - 01-10-2027"), 'https://therotation.tv/men/data.json')
})

test('normalizeTeamName drops The Rotation\'s state tag', () => {
  assert.equal(normalizeTeamName('North Central (IL)'), 'north central')
})

test('parseMatchup reads "<away> at <home>" and the date', () => {
  assert.deepEqual(parseMatchup(DWDCET), { teams: ['Millikin', 'North Central'], isoDate: '2026-09-23' })
  assert.equal(parseMatchup("Diggin' for Drakes - 08-09-2026"), null)
})

test('home win: the real Millikin at North Central row reads "North Central won 3-0."', () => {
  const { result, reason } = findRotationResult(rotation([REAL]), DWDCET)
  assert.equal(reason, null)
  assert.deepEqual(result, { winner: 'North Central', loser: 'Millikin', score: '3-0', line: 'North Central won 3-0.' })
})

test('away win: the score is home-first, so 1-3 means the away team won 3-1', () => {
  const { result } = findRotationResult(rotation([{ ...REAL, score: '1-3' }]), DWDCET)
  assert.equal(result.line, 'Millikin won 3-1.')
})

test('no result when the match is not final, missing, ambiguous, or scoreless', () => {
  assert.match(findRotationResult(rotation([{ ...REAL, state: 'P', score: '' }]), DWDCET).reason, /not final/)
  assert.match(findRotationResult(rotation([{ ...REAL, date: '2026-09-24' }]), DWDCET).reason, /no Rotation match/)
  assert.match(findRotationResult(rotation([REAL, { ...REAL, id: 2, home: 2 }]), DWDCET).reason, /ambiguous/)
  assert.match(findRotationResult(rotation([{ ...REAL, score: '' }]), DWDCET).reason, /no usable score/)
})

test('a team that only shares a date does not match (Ripon vs Millikin is not this album)', () => {
  const { result } = findRotationResult(rotation([{ ...REAL, home: 3 }]), DWDCET)
  assert.equal(result, null)
})

test('lookupCollegeResult: never fetches for a non-college album, never throws on a fetch failure', async () => {
  let fetched = false
  const hs = await lookupCollegeResult('HS Girls VB - JCA at ACC - 09-22-2026', { fetchImpl: async () => { fetched = true } })
  assert.equal(hs.result, null)
  assert.equal(fetched, false)
  const down = await lookupCollegeResult(DWDCET, { fetchImpl: async () => { throw new Error('offline') } })
  assert.equal(down.result, null)
  assert.match(down.reason, /offline/)
  const ok = await lookupCollegeResult(DWDCET, { fetchImpl: async () => ({ ok: true, json: async () => rotation([REAL]) }) })
  assert.equal(ok.result.line, 'North Central won 3-0.')
})

test('caption: a college album carries the result line after the venue', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: DWDCET, venue: 'Gregory Arena, Naperville', selectedOf: '10 of 43', series: 'other',
    result: { line: 'North Central won 3-0.' },
  })
  assert.match(caption, /^Millikin at North Central, Sept\. 23, 2026\nGregory Arena, Naperville\nNorth Central won 3-0\.\n\n10 of 43/)
})

test('caption: a high-school album never states a result, even if a caller passes one', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: 'HS Girls VB - JCA at ACC - 09-22-2026', selectedOf: '8 of 120', series: 'other',
    result: { line: 'ACC won 3-0.' },
  })
  assert.doesNotMatch(caption, /won/)
})

test('seriesForAccount keeps its legacy fallback while Flickday is now the standing publishing account', () => {
  assert.equal(accountForSeries('lpo'), 'flickday')
  assert.equal(accountForSeries('other'), 'flickday')
  assert.equal(seriesForAccount('letspepper'), 'lpo')
  assert.equal(seriesForAccount('flickday'), 'other')
})
