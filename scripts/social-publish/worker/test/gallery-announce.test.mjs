/**
 * Worker tests specific to the gallery-announce campaign: the Facebook
 * carousel crosspost (unpublished photos + attached_media feed post, alt
 * text, and the explicit refusal when only a System User token is
 * available) and the hold/veto gate applied to both destinations.
 *
 * Mirrors worker/test/index.test.mjs's fixtures and fakeKv/runQueue helpers
 * rather than importing them (that file has no exports for them).
 */
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import worker, { _resetPageTokenCacheForTests } from '../src/index.js'

// A resolved Page token is cached module-wide (a real Worker instance reuses it
// across requests); reset it before each test so tests targeting the SAME
// flickday page_id don't see a token resolved by an earlier test in this file.
beforeEach(() => _resetPageTokenCacheForTests())

const EVENT = 'gallery-announce-worker-test'
const ROUTE = {
  reason: 'test fixture: gallery-announce carousel standing route',
  approved: '2026-09-25',
  accounts: ['flickday'],
}

function carouselQueue(overrides = {}) {
  return {
    event: EVENT,
    meta: { route: { ...ROUTE } },
    items: [
      {
        id: 'gallery-announce-re7kho',
        account: 'flickday',
        channels: ['instagram', 'facebook'],
        media_type: 'CAROUSEL',
        children: [
          { media_type: 'IMAGE', image_url: 'https://cdn.example.test/re7kho/01.jpg', alt_text: 'A player in a blue jersey sets the ball near the net.' },
          { media_type: 'IMAGE', image_url: 'https://cdn.example.test/re7kho/02.jpg', alt_text: 'A player in a black jersey digs a low ball on the court.' },
        ],
        caption: 'HS Girls VB — JCA at ACC, Sept. 22. 120 photos in the gallery.',
        facebook_caption: 'HS Girls VB — JCA at ACC, Sept. 22. 120 photos in the gallery.',
        collaborators: ['nino.chavez.photo'],
        scheduledAt: '2026-09-25T00:00:00.000Z',
        status: 'pending',
        facebook_status: 'pending',
      },
      ...(overrides.items || []),
    ],
  }
}

function fakeKv(queue) {
  const values = new Map([[EVENT, JSON.stringify(queue)]])
  return {
    async get(key) { return values.get(key) ?? null },
    async put(key, value) { values.set(key, value) },
  }
}

async function runQueue(queue, fetchImpl, envOverrides = {}) {
  const originalFetch = globalThis.fetch
  const kv = fakeKv(queue)
  globalThis.fetch = fetchImpl
  try {
    const response = await worker.fetch(
      new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger',
        ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0', ...envOverrides },
    )
    assert.equal(response.status, 200)
    return JSON.parse(await kv.get(EVENT))
  } finally { globalThis.fetch = originalFetch }
}

// A Page token IS resolvable (GET /{page-id} returns access_token), so the carousel
// crosspost is allowed to proceed.
function carouselFetch({ photoIds = ['fb-photo-1', 'fb-photo-2'], feedId = 'fb-feed-post', captured = [] } = {}) {
  let photoCall = 0
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams()
    captured.push({ method, path: url.pathname, body: Object.fromEntries(body) })

    if (method === 'GET' && url.pathname.endsWith('/1083438888196332')) {
      return Response.json({ access_token: 'flickday-page-token' })
    }
    if (method === 'POST' && url.pathname.endsWith('/17841474039989310/media')) {
      return Response.json({ id: `ig-child-${captured.length}` })
    }
    if (method === 'POST' && url.pathname.endsWith('/17841474039989310/media_publish')) {
      return Response.json({ id: 'ig-media' })
    }
    if (method === 'GET' && /\/(ig-child|stub)/.test(url.pathname)) {
      return Response.json({ status_code: 'FINISHED' })
    }
    if (method === 'POST' && url.pathname.endsWith('/1083438888196332/photos')) {
      const id = photoIds[photoCall++]
      return Response.json({ id })
    }
    if (method === 'POST' && url.pathname.endsWith('/1083438888196332/feed')) {
      return Response.json({ id: feedId })
    }
    throw new Error(`Unexpected Graph request: ${method} ${url}`)
  }
}

test('Facebook carousel crosspost: uploads each child unpublished with alt text, then attaches them to one feed post', async () => {
  const captured = []
  const queue = await runQueue(carouselQueue(), carouselFetch({ captured }))
  const item = queue.items[0]

  assert.equal(item.facebook_status, 'posted')
  assert.equal(item.facebook_post_id, 'fb-feed-post')
  assert.deepEqual(item.facebook_photo_ids, ['fb-photo-1', 'fb-photo-2'])

  const photoCalls = captured.filter((c) => c.path.endsWith('/1083438888196332/photos'))
  assert.equal(photoCalls.length, 2)
  assert.equal(photoCalls[0].body.published, 'false')
  assert.equal(photoCalls[0].body.alt_text_custom, 'A player in a blue jersey sets the ball near the net.')
  assert.equal(photoCalls[1].body.alt_text_custom, 'A player in a black jersey digs a low ball on the court.')

  const feedCall = captured.find((c) => c.path.endsWith('/1083438888196332/feed'))
  assert.deepEqual(JSON.parse(feedCall.body['attached_media[0]']), { media_fbid: 'fb-photo-1' })
  assert.deepEqual(JSON.parse(feedCall.body['attached_media[1]']), { media_fbid: 'fb-photo-2' })
  assert.match(feedCall.body.message, /HS Girls VB/)
})

test('Instagram carousel children carry alt_text on their own containers', async () => {
  const captured = []
  const queue = await runQueue(carouselQueue(), carouselFetch({ captured }))
  const igMediaCalls = captured.filter((c) => c.path.endsWith('/17841474039989310/media') && c.body.is_carousel_item === 'true')
  assert.equal(igMediaCalls.length, 2)
  assert.equal(igMediaCalls[0].body.alt_text, 'A player in a blue jersey sets the ball near the net.')
  assert.equal(igMediaCalls[1].body.alt_text, 'A player in a black jersey digs a low ball on the court.')
  assert.equal(queue.items[0].status, 'posted')
})

test('a resumed carousel upload continues from the photo it already has, not from zero', async () => {
  const queue = carouselQueue()
  queue.items[0].facebook_status = 'building'
  queue.items[0].facebook_photo_ids = ['fb-photo-1'] // first child already uploaded by a prior run
  queue.items[0].status = 'posted' // Instagram side already done
  delete queue.items[0].channels
  queue.items[0].channels = ['facebook']

  const captured = []
  const result = await runQueue(queue, carouselFetch({ photoIds: ['fb-photo-2'], captured }))
  const photoCalls = captured.filter((c) => c.path.endsWith('/photos'))
  assert.equal(photoCalls.length, 1, 'only the missing second child should be uploaded')
  assert.deepEqual(result.items[0].facebook_photo_ids, ['fb-photo-1', 'fb-photo-2'])
  assert.equal(result.items[0].facebook_status, 'posted')
})

test('refuses the carousel crosspost outright when only the System User token is available, before uploading anything', async () => {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    calls.push(`${init.method || 'GET'} ${url.pathname}`)
    // Neither the direct Page lookup nor /me/accounts resolves a Page token —
    // pageAccessToken() falls back to the System User token.
    if (url.pathname.endsWith('/1083438888196332')) return Response.json({ error: { message: 'no field' } }, { status: 400 })
    if (url.pathname.endsWith('/me/accounts')) return Response.json({ data: [] })
    if ((init.method || 'GET') === 'POST' && url.pathname.endsWith('/17841474039989310/media')) return Response.json({ id: 'ig-child' })
    if (url.pathname.endsWith('/17841474039989310/media_publish')) return Response.json({ id: 'ig-media' })
    if ((init.method || 'GET') === 'GET' && url.pathname.endsWith('/ig-child')) return Response.json({ status_code: 'FINISHED' })
    throw new Error(`Unexpected Graph request that should never have been reached: ${url}`)
  }
  const queue = await runQueue(carouselQueue(), fetchImpl)
  const item = queue.items[0]
  assert.equal(item.facebook_status, 'error')
  assert.match(item.facebook_error, /needs a Page access token/)
  assert.ok(!calls.some((c) => c.includes('/photos')), 'no photo was uploaded once the fallback was detected')
  assert.equal(item.status, 'posted', 'Instagram still succeeds independently')
})

// --------------------------------------------------------------- hold/veto

test('a held gallery-announce item posts to neither Instagram nor Facebook before holdUntil, even forced', async () => {
  const queue = carouselQueue()
  queue.items[0].status = 'held'
  queue.items[0].facebook_status = 'held'
  queue.items[0].holdUntil = new Date(Date.now() + 3600_000).toISOString()
  const calls = []
  const fetchImpl = async (input) => { calls.push(String(input)); throw new Error('should not be called') }
  const result = await runQueue(queue, fetchImpl)
  assert.deepEqual(calls, [])
  assert.equal(result.items[0].status, 'held')
  assert.equal(result.items[0].facebook_status, 'held')
})

test('a held item posts once holdUntil has passed', async () => {
  const queue = carouselQueue()
  queue.items[0].status = 'held'
  queue.items[0].facebook_status = 'held'
  queue.items[0].holdUntil = new Date(Date.now() - 1000).toISOString()
  const result = await runQueue(queue, carouselFetch())
  assert.equal(result.items[0].status, 'posted')
  assert.equal(result.items[0].facebook_status, 'posted')
})

test('a vetoed item never posts to either destination, even after holdUntil and even forced', async () => {
  const queue = carouselQueue()
  queue.items[0].status = 'vetoed'
  queue.items[0].facebook_status = 'vetoed'
  queue.items[0].holdUntil = new Date(Date.now() - 1000).toISOString()
  const calls = []
  const fetchImpl = async (input) => { calls.push(String(input)); throw new Error('should not be called') }
  const result = await runQueue(queue, fetchImpl)
  assert.deepEqual(calls, [])
  assert.equal(result.items[0].status, 'vetoed')
  assert.equal(result.items[0].facebook_status, 'vetoed')
})

test('a vetoed in-flight (building) item is not resumed', async () => {
  const queue = carouselQueue()
  queue.items[0].status = 'vetoed'
  queue.items[0].ig_container_id = 'stray-container'
  queue.items[0].facebook_status = 'vetoed'
  const calls = []
  const fetchImpl = async (input) => { calls.push(String(input)); throw new Error('should not be called') }
  const result = await runQueue(queue, fetchImpl)
  assert.deepEqual(calls, [])
  assert.equal(result.items[0].ig_container_id, 'stray-container', 'left untouched, not rebuilt or published')
})
