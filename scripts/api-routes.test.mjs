/**
 * API route input handling (src/app/api, src/lib/rally-hq.ts, src/lib/gallery.ts).
 *
 * Each route handler runs as-is. Every outgoing request goes to a recording
 * stub: Supabase and Rally HQ point at stub hosts, and globalThis.fetch answers
 * from memory. No real key and no network. All ids and names are invented.
 *
 * Run: pnpm test:api
 */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'

process.env.SUPABASE_URL = 'https://supabase.stub'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-key'
process.env.RALLY_HQ_API_KEY = 'stub-rhq-key'
process.env.RALLY_HQ_API_URL = 'https://rhq.stub'

const route = (path) => import(`../src/app/api/${path}/route.ts`)
const LP_ALBUM = 'LpAlb1'
const OTHER_ALBUM = 'Other1'
const DEVICE = '22222222-2222-4222-8222-222222222222'
const OWN_IMAGE = 'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/LpAlb1-DSC0001/public'

let sent
let votes
let upstreamType
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  sent = []
  votes = []
  upstreamType = 'image/jpeg'
  delete process.env.ZIP_SIGNING_SECRET
})

globalThis.fetch = async (input, init = {}) => {
  const req = new Request(input, init)
  const u = new URL(req.url)
  sent.push({ method: req.method, host: u.host, path: u.pathname, search: u.search })
  if (u.host === 'supabase.stub') {
    const table = u.pathname.split('/').pop()
    const single = (req.headers.get('accept') || '').includes('vnd.pgrst.object')
    if (table === 'album_settings') {
      const key = (u.searchParams.get('album_key') || '').replace(/^eq\./, '')
      return json(key === LP_ALBUM ? [{ album_key: key }] : [])
    }
    if (table === 'photo_metadata' && single) {
      const id = (u.searchParams.get('photo_id') || '').replace(/^eq\./, '')
      const album = id === 'photo-in-lp' ? LP_ALBUM : OTHER_ALBUM
      return json({ photo_id: id, image_key: id, cf_image_id: `${album}-DSC0001`, album_key: album, album_name: 'Invented' })
    }
    if (table === 'lp_votes' && req.method === 'POST') {
      votes.push(JSON.parse(String(init.body)))
      return new Response(null, { status: 201 })
    }
    if (table === 'lp_votes') return json(votes)
    return json([])
  }
  if (u.host === 'rhq.stub') {
    if (u.pathname === '/api/v1/fans') return json({ data: { fanToken: '11111111-1111-4111-8111-111111111111' } })
    return json({ data: [] })
  }
  if (u.host === 'imagedelivery.net') {
    return new Response('img', { status: 200, headers: { 'content-type': upstreamType } })
  }
  return new Response('outside', { status: 200, headers: { 'content-type': 'application/octet-stream' } })
}

const rhqCalls = () => sent.filter((s) => s.host === 'rhq.stub')

test('an event-page read for a listed event reaches its Rally HQ path', async () => {
  const { GET } = await route('rhq/teams')
  const res = await GET(new NextRequest('https://lp.test/api/rhq/teams?slug=poblano-open-2026'))
  assert.equal(res.status, 200)
  assert.deepEqual(rhqCalls().map((s) => s.path), ['/api/public/v1/tournaments/poblano-open-2026/teams'])
})

test('an event-page read for any other slug is refused before Rally HQ is called', async () => {
  for (const path of ['rhq/teams', 'rhq/pools', 'rhq/schedule', 'rhq/bracket', 'rhq/summary', 'rhq/matches']) {
    const { GET } = await route(path)
    for (const slug of ['poblano-open-2099', '../poblano-open-2026', 'poblano-open-2026/../x', '']) {
      const res = await GET(new NextRequest(`https://lp.test/api/${path}?slug=${encodeURIComponent(slug)}`))
      assert.equal(res.status, 400, `${path} ${slug}`)
    }
  }
  assert.equal(rhqCalls().length, 0)
})

test('the Rally HQ client sends each value as one encoded path segment', async () => {
  const { getRoster } = await import('../src/lib/rally-hq.ts')
  await getRoster('a/../b?c')
  assert.equal(rhqCalls()[0].path, '/api/public/v1/tournaments/a%2F..%2Fb%3Fc/teams')
  assert.equal(rhqCalls()[0].search, '')
})

test('champion picks accept only listed events', async () => {
  const { GET, POST } = await route('champion')
  assert.equal((await GET(new NextRequest('https://lp.test/api/champion?tournament=elsewhere-2026'))).status, 400)
  const post = await POST(new Request('https://lp.test/api/champion', { method: 'POST', body: JSON.stringify({ device_id: DEVICE, tournament: 'elsewhere-2026', predicted_team_id: 'x' }) }))
  assert.equal(post.status, 400)
  assert.equal(rhqCalls().length, 0)
  const listed = await GET(new NextRequest('https://lp.test/api/champion?tournament=jalapeno-open-2026'))
  assert.equal(listed.status, 200)
  assert.equal(rhqCalls()[0].path, '/api/v1/tournaments/jalapeno-open-2026/teams')
})

test('the download route serves this account\'s images with a safe filename', async () => {
  const { GET } = await route('download')
  const res = await GET(new NextRequest(`https://lp.test/api/download?url=${encodeURIComponent(OWN_IMAGE)}&filename=${encodeURIComponent('LpAlb1 "DSC".jpg')}`))
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="LpAlb1DSC.jpg"')
  assert.equal(sent[0].host, 'imagedelivery.net')
})

test('the download route refuses every other URL without fetching it', async () => {
  const { GET } = await route('download')
  const refused = [
    'https://outside.example/file?imagedelivery.net',
    'https://imagedelivery.net.outside.example/wg34HB28-JkySWVm5fW4kA/a/public',
    'http://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/a/public',
    'https://imagedelivery.net/another-account/a/public',
    'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/a/public?x=1',
    'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/a/b/public',
    'https://imagedelivery.net/wg34HB28-JkySWVm5fW4kA/a/w=640',
    'https://user@imagedelivery.net/wg34HB28-JkySWVm5fW4kA/a/public',
  ]
  for (const url of refused) {
    const res = await GET(new NextRequest(`https://lp.test/api/download?url=${encodeURIComponent(url)}`))
    assert.equal(res.status, 400, url)
  }
  assert.equal(sent.length, 0)
})

test('the download route keeps only image filenames and image responses', async () => {
  const { GET } = await route('download')
  const res = await GET(new NextRequest(`https://lp.test/api/download?url=${encodeURIComponent(OWN_IMAGE)}&filename=invoice.exe`))
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="download.jpg"')
  upstreamType = 'text/html'
  const notImage = await GET(new NextRequest(`https://lp.test/api/download?url=${encodeURIComponent(OWN_IMAGE)}`))
  assert.equal(notImage.status, 502)
})

test('vote scopes must be kind:id, and stored names never reach Object.prototype', async () => {
  const { GET, POST } = await route('votes')
  const cast = (scope) => POST(new Request('https://lp.test/api/votes', { method: 'POST', body: JSON.stringify({ device_id: DEVICE, scope, choice: 'lpTestMarker' }) }))
  assert.equal((await cast('__proto__')).status, 400)
  assert.equal((await cast('photo:season-2026')).status, 200)
  // A row stored before the scope check existed, or written by another path.
  votes.push({ scope: '__proto__', choice: 'lpTestMarker' })
  const res = await GET(new NextRequest('https://lp.test/api/votes?scopes=__proto__,photo:season-2026'))
  const body = await res.json()
  assert.equal(({}).lpTestMarker, undefined)
  assert.deepEqual(body.tallies['photo:season-2026'], { lpTestMarker: 1 })
  assert.deepEqual(body.tallies.__proto__, { lpTestMarker: 1 })
})

test('engagement points accept only their own listed sources', async () => {
  const { POST } = await route('engagement')
  for (const source of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    const res = await POST(new Request('https://lp.test/api/engagement', { method: 'POST', body: JSON.stringify({ device_id: DEVICE, source, ref: 'r1' }) }))
    assert.equal(res.status, 400, source)
  }
  assert.equal(rhqCalls().length, 0)
})

test('album ZIP links are signed with the ZIP secret, only for this site\'s albums', async () => {
  const { GET } = await route('zip-url')
  const ask = (albumKey, quality = 'large') => GET(new NextRequest(`https://lp.test/api/zip-url?albumKey=${encodeURIComponent(albumKey)}&quality=${encodeURIComponent(quality)}`))
  assert.equal((await ask(LP_ALBUM)).status, 503, 'fails closed without the secret')
  process.env.ZIP_SIGNING_SECRET = 'invented-zip-secret'
  const ok = await ask(LP_ALBUM)
  assert.equal(ok.status, 200)
  const url = new URL((await ok.json()).url)
  const ts = url.searchParams.get('ts')
  const expected = createHmac('sha256', 'invented-zip-secret').update(`${LP_ALBUM}:large:${ts}`).digest('hex')
  assert.equal(url.searchParams.get('sig'), expected)
  assert.equal(url.pathname, `/zip/${LP_ALBUM}`)
  assert.equal((await ask(OTHER_ALBUM)).status, 400, 'another site\'s album')
  assert.equal((await ask('a:b')).status, 400, 'malformed key')
  assert.equal((await ask(LP_ALBUM, 'original')).status, 400, 'unsupported quality')
})

test('single-album and single-photo reads return nothing outside this site\'s albums', async () => {
  const { fetchAlbumPhotos, fetchAlbumVideos, fetchPhoto } = await import('../src/lib/gallery.ts')
  assert.deepEqual(await fetchAlbumPhotos({ albumKey: OTHER_ALBUM }), { photos: [], totalCount: 0 })
  assert.deepEqual(await fetchAlbumVideos(OTHER_ALBUM), [])
  assert.equal(await fetchPhoto('photo-elsewhere'), null)
  const own = await fetchPhoto('photo-in-lp')
  assert.equal(own?.albumKey, LP_ALBUM)
  assert.equal(sent.filter((s) => s.path.endsWith('/photo_metadata') && s.search.includes(OTHER_ALBUM)).length, 0)
})
