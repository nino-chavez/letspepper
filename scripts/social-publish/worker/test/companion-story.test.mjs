/**
 * Worker tests for the gallery-announce companion Story: the media_types route gate (a
 * STORIES item is refused unless the queue's meta.route explicitly lists it) and the
 * buildContainer() STORIES branch now sending user_tags (mentions).
 *
 * Mirrors worker/test/gallery-announce.test.mjs's fixtures/helpers rather than importing them
 * (that file has no exports for them) — same convention that file's own header documents.
 */
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import worker, { _resetPageTokenCacheForTests } from '../src/index.js'

beforeEach(() => _resetPageTokenCacheForTests())

const EVENT = 'gallery-announce-story-worker-test'

function storyItem(overrides = {}) {
  return {
    id: 'DWdCET-gallery-announce-story',
    account: 'ninophoto',
    media_type: 'STORIES',
    channels: ['instagram'],
    linked_item_id: 'DWdCET-gallery-announce',
    image_url: 'https://cdn.example.test/DWdCET/story.png',
    user_tags: [{ username: 'nccwomensvb' }, { username: 'flickday.media' }],
    scheduledAt: '2000-01-01T00:00:00.000Z', // immediately due
    status: 'pending',
    ig_container_id: null,
    ig_media_id: null,
    posted_at: null,
    error: null,
    ...overrides,
  }
}

function queueOf(item, route) {
  return { event: EVENT, meta: { route }, items: [item] }
}

function fakeKv(queue) {
  const values = new Map([[EVENT, JSON.stringify(queue)]])
  return {
    async get(key) { return values.get(key) ?? null },
    async put(key, value) { values.set(key, value) },
  }
}

async function runQueue(queue, fetchImpl) {
  const originalFetch = globalThis.fetch
  const kv = fakeKv(queue)
  globalThis.fetch = fetchImpl
  try {
    const response = await worker.fetch(
      new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0' },
    )
    assert.equal(response.status, 200)
    return JSON.parse(await kv.get(EVENT))
  } finally { globalThis.fetch = originalFetch }
}

const ROUTE_NO_STORIES = { reason: 'test fixture: gallery-announce standing route (carousels only)', approved: '2026-09-25', accounts: ['ninophoto'] }
const ROUTE_WITH_STORIES = { ...ROUTE_NO_STORIES, media_types: ['CAROUSEL', 'STORIES'] }

test('a STORIES item is refused when the queue route carries no media_types field — no Graph request is ever made', async () => {
  const calls = []
  const fetchImpl = async (input) => { calls.push(String(input)); throw new Error('should not be called') }
  const queue = await runQueue(queueOf(storyItem(), ROUTE_NO_STORIES), fetchImpl)
  assert.deepEqual(calls, [])
  const item = queue.items[0]
  assert.equal(item.status, 'error')
  assert.match(item.route_error, /does not cover STORIES/)
  assert.match(item.error, /does not cover STORIES/)
})

test('a STORIES item publishes once its route\'s media_types explicitly lists STORIES', async () => {
  const captured = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams()
    captured.push({ method, path: url.pathname, body: Object.fromEntries(body) })
    if (method === 'POST' && url.pathname.endsWith('/17841401886738878/media')) return Response.json({ id: 'ig-story-container' })
    if (method === 'GET' && url.pathname.endsWith('/ig-story-container')) return Response.json({ status_code: 'FINISHED' })
    if (method === 'POST' && url.pathname.endsWith('/media_publish')) return Response.json({ id: 'ig-story-media' })
    throw new Error(`Unexpected Graph request: ${method} ${url}`)
  }
  const queue = await runQueue(queueOf(storyItem(), ROUTE_WITH_STORIES), fetchImpl)
  assert.equal(queue.items[0].status, 'posted')

  // buildContainer's STORIES branch now sends user_tags (mentions) — corrected 2026-09-26;
  // Meta's IG User /media reference added user_tags support for image/video Stories 2025-07-09.
  const mediaCall = captured.find((c) => c.path.endsWith('/17841401886738878/media'))
  assert.ok(mediaCall, 'no media container request was made')
  assert.equal(mediaCall.body.media_type, 'STORIES')
  assert.deepEqual(JSON.parse(mediaCall.body.user_tags), [{ username: 'nccwomensvb' }, { username: 'flickday.media' }])
  // Stories carry no caption or collaborators, and never did.
  assert.equal(mediaCall.body.caption, undefined)
  assert.equal(mediaCall.body.collaborators, undefined)
})

test('a STORIES item is refused if the route covers the account but the campaign\'s media_types was only ever approved for carousels — the refusal names STORIES, not the account', async () => {
  const queue = await runQueue(queueOf(storyItem(), ROUTE_NO_STORIES), async () => { throw new Error('should not be called') })
  assert.doesNotMatch(queue.items[0].route_error, /does not list account/, 'the account IS listed — only the media type is missing')
})
