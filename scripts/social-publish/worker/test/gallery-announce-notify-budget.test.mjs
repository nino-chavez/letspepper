/**
 * Worker tests for the gallery-announce phone notifications (POSTED/FAILED) and the
 * per-invocation subrequest budget + carousel resume. Split from gallery-announce.test.mjs
 * because these need ACTIVE_EVENTS to be the LITERAL event slug 'gallery-announce' — that
 * file uses 'gallery-announce-worker-test' on purpose (a namespaced test event), and
 * notifiable() in src/index.js gates notifications on the literal 'gallery-announce' slug
 * so the legacy reels drip and other test fixtures never notify.
 */
import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import worker, { _resetPageTokenCacheForTests } from '../src/index.js'

beforeEach(() => _resetPageTokenCacheForTests())

const EVENT = 'gallery-announce'
const ROUTE = { reason: 'test fixture: gallery-announce standing route', approved: '2026-09-25', accounts: ['ninophoto'] }
const NTFY_TOPIC = 'test-topic-do-not-use'

function imageQueue(overrides = {}) {
  return {
    event: EVENT,
    meta: { route: { ...ROUTE } },
    items: [
      {
        id: 'Re7kho-gallery-announce', album_key: 'Re7kho', album_name: 'HS Girls VB - JCA at ACC',
        account: 'ninophoto', channels: ['instagram', 'facebook'], media_type: 'IMAGE',
        image_url: 'https://cdn.example.test/re7kho/01.jpg', caption: 'caption', facebook_caption: 'caption',
        scheduledAt: '2026-09-25T00:00:00.000Z', status: 'pending', facebook_status: 'pending',
        ...overrides,
      },
    ],
  }
}

function carouselQueue({ count = 3 } = {}) {
  return {
    event: EVENT,
    meta: { route: { ...ROUTE } },
    items: [{
      id: 'Re7kho-gallery-announce', album_key: 'Re7kho', album_name: 'HS Girls VB - JCA at ACC',
      account: 'ninophoto', channels: ['instagram'], media_type: 'CAROUSEL',
      children: Array.from({ length: count }, (_, i) => ({ media_type: 'IMAGE', image_url: `https://cdn.example.test/re7kho/0${i + 1}.jpg`, alt_text: `alt ${i}` })),
      caption: 'caption', scheduledAt: '2026-09-25T00:00:00.000Z', status: 'pending', facebook_status: 'pending',
    }],
  }
}

function fakeKv(queue) {
  const values = new Map([[EVENT, JSON.stringify(queue)]])
  return { async get(key) { return values.get(key) ?? null }, async put(key, value) { values.set(key, value) } }
}

async function runQueue(queue, fetchImpl, envOverrides = {}) {
  const originalFetch = globalThis.fetch
  const kv = fakeKv(queue)
  globalThis.fetch = fetchImpl
  try {
    const response = await worker.fetch(
      new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', FB_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger',
        ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0', NTFY_TOPIC, ...envOverrides },
    )
    assert.equal(response.status, 200)
    return JSON.parse(await kv.get(EVENT))
  } finally { globalThis.fetch = originalFetch }
}

// ------------------------------------------------------ POSTED / FAILED notifications

function imageFetch({ igOk = true, fbOk = true } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    if (url.hostname === 'ntfy.sh') return new Response('ok', { status: 200 })
    if (method === 'POST' && url.pathname.endsWith('/17841401886738878/media')) {
      if (!igOk) return Response.json({ error: { message: 'IG failure' } }, { status: 400 })
      return Response.json({ id: 'ig-container-1' })
    }
    if (method === 'POST' && url.pathname.endsWith('/media_publish')) return Response.json({ id: 'ig-media-1' })
    if (method === 'GET' && url.pathname.endsWith('/ig-media-1')) return Response.json({ permalink: 'https://instagram.com/p/abc123/' })
    if (method === 'GET' && url.pathname.endsWith('/739564079232058')) return Response.json({ access_token: 'ninophoto-page-token' })
    if (method === 'POST' && url.pathname.endsWith('/739564079232058/photos')) {
      if (!fbOk) return Response.json({ error: { message: 'FB failure' } }, { status: 400 })
      return Response.json({ post_id: '739564079232058_999', id: '739564079232058_999' })
    }
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
}

test('a successful Instagram publish sends a POSTED notification to ntfy.sh with the permalink as click target', async () => {
  const ntfyCalls = []
  const base = imageFetch()
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.hostname === 'ntfy.sh') ntfyCalls.push({ url: String(input), headers: init.headers, body: init.body })
    return base(input, init)
  }
  const queue = await runQueue(imageQueue({ channels: ['instagram'] }), fetchImpl)
  assert.equal(queue.items[0].status, 'posted')
  assert.equal(ntfyCalls.length, 1)
  assert.equal(ntfyCalls[0].url, `https://ntfy.sh/${NTFY_TOPIC}`)
  assert.equal(ntfyCalls[0].headers['X-Click'], 'https://instagram.com/p/abc123/')
  assert.equal(ntfyCalls[0].headers['X-Title'], 'Posted: JCA at ACC')
  assert.match(ntfyCalls[0].headers['X-Actions'], /^view, View on Instagram, https:\/\/instagram\.com\/p\/abc123\/$/)
})

test('a successful Facebook publish sends its own POSTED notification, independent of Instagram', async () => {
  const ntfyCalls = []
  const base = imageFetch()
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.hostname === 'ntfy.sh') ntfyCalls.push({ headers: init.headers })
    return base(input, init)
  }
  const queue = await runQueue(imageQueue(), fetchImpl)
  assert.equal(queue.items[0].facebook_status, 'posted')
  // Both destinations share the same "Posted: <album>" title now (2026-09-26 — the channel
  // dropped out of the title), so a Facebook notification is picked out by its click target.
  const fbNotif = ntfyCalls.find((c) => c.headers['X-Click'] === 'https://www.facebook.com/739564079232058_999')
  assert.ok(fbNotif, 'expected a Facebook POSTED notification')
  assert.equal(fbNotif.headers['X-Title'], 'Posted: JCA at ACC')
  assert.match(fbNotif.headers['X-Actions'], /^view, View on Facebook, https:\/\/www\.facebook\.com\/739564079232058_999$/)
})

test('a terminal Instagram error sends a high-priority FAILED notification instead of POSTED', async () => {
  const ntfyCalls = []
  const base = imageFetch({ igOk: false })
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.hostname === 'ntfy.sh') ntfyCalls.push({ headers: init.headers, body: init.body })
    return base(input, init)
  }
  const queue = await runQueue(imageQueue({ channels: ['instagram'] }), fetchImpl)
  assert.equal(queue.items[0].status, 'error')
  assert.equal(ntfyCalls.length, 1)
  assert.equal(ntfyCalls[0].headers['X-Title'], "Didn't post: JCA at ACC")
  assert.equal(ntfyCalls[0].headers['X-Priority'], 'high')
  assert.match(ntfyCalls[0].body, /Instagram didn't post: IG failure/)
})

test('a notify failure (ntfy.sh unreachable) never turns a successful publish into an error', async () => {
  const base = imageFetch()
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.hostname === 'ntfy.sh') throw new Error('network unreachable')
    return base(input, init)
  }
  const queue = await runQueue(imageQueue({ channels: ['instagram'] }), fetchImpl)
  assert.equal(queue.items[0].status, 'posted', 'the publish must succeed even though the notification could not be sent')
})

test('other events on this shared Worker never notify, even on success', async () => {
  const ntfyCalls = []
  const base = imageFetch()
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input))
    if (url.hostname === 'ntfy.sh') ntfyCalls.push(1)
    return base(input, init)
  }
  const kv = fakeKv({ event: 'cutting-board-announce', meta: { route: { reason: 'r', approved: '2026-09-25', accounts: ['ninophoto'] } },
    items: [{ id: 'x', account: 'ninophoto', channels: ['instagram'], media_type: 'IMAGE', image_url: 'https://cdn.example.test/x.jpg', caption: 'c', status: 'pending', scheduledAt: '2026-01-01T00:00:00Z' }] })
  const originalFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    await worker.fetch(new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: 'cutting-board-announce', ALLOWED_HOURS_UTC: '0', NTFY_TOPIC })
  } finally { globalThis.fetch = originalFetch }
  assert.equal(ntfyCalls.length, 0)
})

// --------------------------------------------------------- subrequest budget + resume

// Every Graph call this fetchImpl sees is recorded by path, so a test can assert an
// image_url was only ever sent to /media once across two separate runQueue() ticks.
function budgetedCarouselFetch(captured) {
  let childSeq = 0
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    if (url.hostname === 'ntfy.sh') return new Response('ok', { status: 200 })
    captured.push({ method, path: url.pathname, body: init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null })
    if (method === 'POST' && url.pathname.endsWith('/17841401886738878/media') && !url.searchParams) { /* unreachable, kept for clarity */ }
    if (method === 'POST' && url.pathname.endsWith('/17841401886738878/media')) {
      const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {}
      if (body.media_type === 'CAROUSEL') return Response.json({ id: 'ig-parent-1' })
      childSeq++
      return Response.json({ id: `ig-child-${childSeq}` })
    }
    if (method === 'POST' && url.pathname.endsWith('/media_publish')) return Response.json({ id: 'ig-media-1' })
    if (method === 'GET' && url.pathname.endsWith('/ig-media-1')) return Response.json({ permalink: 'https://instagram.com/p/xyz/' })
    // CAROUSEL is not an IMAGE, so publishInstagramItem polls the parent container's own
    // status_code before publishing — any other container GET (child or parent) finishes
    // immediately, matching a real image carousel's near-instant processing.
    if (method === 'GET' && /\/ig-(child|parent)-\d+$/.test(url.pathname)) return Response.json({ status_code: 'FINISHED' })
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
}

test('a carousel build that exceeds its subrequest budget defers, persisting every child id created so far', async () => {
  const captured = []
  const queue = await runQueue(carouselQueue({ count: 3 }), budgetedCarouselFetch(captured), { SUBREQUEST_BUDGET: '2' })
  const item = queue.items[0]
  // Budget 2: the first two children are created and persisted; the third (and the
  // parent) never happen this tick.
  assert.deepEqual(item.ig_child_container_ids, ['ig-child-1', 'ig-child-2'])
  assert.equal(item.ig_container_id, undefined, 'the parent container must not exist yet')
  assert.notEqual(item.status, 'error', 'a budget deferral must never be a terminal error')
  assert.notEqual(item.status, 'posted')
})

test('the next tick resumes from the deferred children instead of re-creating them, and finishes', async () => {
  const captured = []
  const queue1 = await runQueue(carouselQueue({ count: 3 }), budgetedCarouselFetch(captured), { SUBREQUEST_BUDGET: '2' })
  assert.deepEqual(queue1.items[0].ig_child_container_ids, ['ig-child-1', 'ig-child-2'])

  // Second tick: same queue state (as if read fresh from KV), fresh budget, fresh capture list.
  const captured2 = []
  const queue2 = await runQueue(queue1, budgetedCarouselFetch(captured2), { SUBREQUEST_BUDGET: '40' })
  const item = queue2.items[0]
  assert.equal(item.status, 'posted')
  assert.equal(item.ig_child_container_ids.length, 3)
  // Only ONE more child (the third) should have been created this tick, plus the parent
  // and the publish call — never the first two again.
  const childCreateCalls = captured2.filter((c) => c.path.endsWith('/media') && c.body?.is_carousel_item === 'true')
  assert.equal(childCreateCalls.length, 1, 'the two already-created children must not be recreated')
})

// ---------------------------------------------------------------------- /status held/pending

test('/status counts an item whose holdUntil has already passed as pending, not held', async () => {
  const kv = fakeKv({
    event: EVENT, meta: { route: { ...ROUTE } },
    items: [
      { id: 'still-held', status: 'held', facebook_status: 'held', holdUntil: new Date(Date.now() + 3600_000).toISOString() },
      { id: 'elapsed-hold', status: 'held', facebook_status: 'held', holdUntil: new Date(Date.now() - 1000).toISOString() },
    ],
  })
  const res = await worker.fetch(
    new Request('https://worker.example.test/status?key=trigger'),
    { QUEUE: kv, TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0' },
  )
  const body = await res.json()
  const ev = body.events[EVENT]
  assert.equal(ev.held, 1, 'only the still-in-the-future hold counts as held')
  assert.equal(ev.pending, 1, 'the elapsed hold counts as pending, since the next tick would publish it')
  assert.deepEqual(ev.heldItems.map((h) => h.id), ['still-held'])
})
