/**
 * Worker tests for GET /review and POST /review/cancel — the server-rendered page that
 * answers "where do I go to see what's on hold to post" (Nino, 2026-09-26), and its one-tap
 * cancel, which vetoes through the exact same veto() function seed-kv.mjs --veto uses (see
 * veto-shape.mjs). Mirrors worker/test/index.test.mjs's fakeKv/runQueue shape rather than
 * importing it (that file has no exports for them).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.js'

const EVENT = 'gallery-announce'
const KEY = 'test-review-key'

function heldItem(overrides = {}) {
  return {
    id: 'Re7kho-gallery-announce', album_key: 'Re7kho', album_name: 'HS Girls VB - JCA at ACC - 09-22-2026',
    account: 'ninophoto', channels: ['instagram', 'facebook'], media_type: 'CAROUSEL',
    children: [
      { media_type: 'IMAGE', image_url: 'https://pub-x.r2.dev/gallery-announce-Re7kho/slide-01.jpg', alt_text: 'A player in a blue jersey sets the ball near the net.' },
      { media_type: 'IMAGE', image_url: 'https://pub-x.r2.dev/gallery-announce-Re7kho/slide-02.jpg', alt_text: 'A player in a black jersey digs a low ball on the court.' },
    ],
    caption: 'JCA at ACC, Sept. 22.\n\n10 of 120 from the gallery.',
    facebook_caption: 'JCA at ACC, Sept. 22.\n\n10 of 120 from the gallery. (Facebook)',
    collaborators: ['flickday.media'],
    scheduledAt: '2026-09-27T03:08:00.000Z',
    holdUntil: '2026-09-27T03:08:00.000Z',
    status: 'held', facebook_status: 'held',
    ig_container_id: null, ig_media_id: null, facebook_photo_ids: [], facebook_post_id: null,
    posted_at: null, error: null,
    ...overrides,
  }
}

function queueWith(...items) {
  return { event: EVENT, meta: { route: { reason: 'r', approved: '2026-09-25', accounts: ['ninophoto', 'letspepper'] } }, items }
}

function fakeKv(queue) {
  const values = new Map(queue ? [[EVENT, JSON.stringify(queue)]] : [])
  return {
    async get(key) { return values.get(key) ?? null },
    async put(key, value) { values.set(key, value) },
    _raw: values,
  }
}

function baseEnv(kv, overrides = {}) {
  return { QUEUE: kv, REVIEW_KEY: KEY, TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '17,22', ...overrides }
}

async function get(kv, path, envOverrides = {}) {
  return worker.fetch(new Request(`https://worker.example.test${path}`), baseEnv(kv, envOverrides))
}
async function post(kv, path, { form, envOverrides = {} } = {}) {
  const init = { method: 'POST' }
  if (form) init.body = new URLSearchParams(form)
  return worker.fetch(new Request(`https://worker.example.test${path}`, init), baseEnv(kv, envOverrides))
}

// ------------------------------------------------------------------------------ auth

test('GET /review: 403 with no key', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), '/review')
  assert.equal(res.status, 403)
})

test('GET /review: 403 with the wrong key', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), '/review?key=nope')
  assert.equal(res.status, 403)
})

test('GET /review: 403 when REVIEW_KEY is not configured at all — never "any key matches"', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), '/review?key=', { REVIEW_KEY: undefined })
  assert.equal(res.status, 403)
})

test('GET /review: never Cache-Control anything but no-store, even on a 403', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), '/review')
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

// --------------------------------------------------------------------------- rendering

test('GET /review: renders a held item\'s slides, alt text, and both captions', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), `/review?key=${KEY}`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8')
  const html = await res.text()

  assert.match(html, /https:\/\/pub-x\.r2\.dev\/gallery-announce-Re7kho\/slide-01\.jpg/)
  assert.match(html, /https:\/\/pub-x\.r2\.dev\/gallery-announce-Re7kho\/slide-02\.jpg/)
  assert.match(html, /A player in a blue jersey sets the ball near the net\./)
  assert.match(html, /A player in a black jersey digs a low ball on the court\./)
  assert.match(html, /JCA at ACC, Sept\. 22\./) // Instagram caption
  assert.match(html, /\(Facebook\)/) // the different Facebook caption is shown too
  assert.match(html, /nino\.chavez\.photo/) // account by HANDLE, not the "ninophoto" slug
  assert.doesNotMatch(html, />ninophoto</)
  assert.match(html, /flickday\.media/) // collaborator
  assert.match(html, /Held/) // status label
  assert.match(html, new RegExp(`id="Re7kho-gallery-announce"`))
  assert.match(html, /Cancel this post/)
})

test('GET /review: a pending item (elapsed hold) also shows a Cancel button; a posted item does not', async () => {
  const held = heldItem()
  const pending = heldItem({ id: 'other-gallery-announce', status: 'held', facebook_status: 'held', holdUntil: new Date(Date.now() - 1000).toISOString() })
  const posted = heldItem({ id: 'posted-gallery-announce', status: 'posted', facebook_status: 'posted' })
  const html = await (await get(fakeKv(queueWith(held, pending, posted)), `/review?key=${KEY}`)).text()

  const cancelForms = [...html.matchAll(/<form method="POST" action="\/review\/cancel">[\s\S]*?<\/form>/g)]
  assert.equal(cancelForms.length, 2, 'exactly the held + pending items get a Cancel button')
  assert.ok(cancelForms.every((m) => !m[0].includes('posted-gallery-announce')))
})

test('GET /review: shows hold-until and the next posting slot in America/Chicago time', async () => {
  const html = await (await get(fakeKv(queueWith(heldItem())), `/review?key=${KEY}`)).text()
  // holdUntil 2026-09-27T03:08:00Z = Sat 10:08 PM Central; first ALLOWED_HOURS_UTC (17,22)
  // slot at/after that is 2026-09-27T17:00:00Z = Sun 12:00 PM Central.
  assert.match(html, /Hold until: Sat 10:08 PM Central/)
  assert.match(html, /Next posting slot: Sun 12:00 PM Central/)
})

test('GET /review: escapes caption/alt-text content rather than injecting it as HTML', async () => {
  const item = heldItem({ caption: '<script>alert(1)</script>', children: [{ media_type: 'IMAGE', image_url: 'https://x.test/a.jpg', alt_text: '<b>bold</b>' }] })
  const html = await (await get(fakeKv(queueWith(item)), `/review?key=${KEY}`)).text()
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<b>bold<\/b>/)
})

test('GET /review: recent posted/vetoed/error items are listed collapsed, held/pending are not', async () => {
  const html = await (await get(fakeKv(queueWith(
    heldItem(),
    heldItem({ id: 'posted-1', status: 'posted', facebook_status: 'posted' }),
  )), `/review?key=${KEY}`)).text()
  assert.match(html, /<details>/)
  assert.match(html, /posted-1/)
})

test('GET /review: no queue yet renders a page, not an error', async () => {
  const res = await get(fakeKv(null), `/review?key=${KEY}`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /Nothing held or pending/)
})

// -------------------------------------------------------------------------------- cancel

test('POST /review/cancel: 403 without the key', async () => {
  const kv = fakeKv(queueWith(heldItem()))
  const res = await post(kv, '/review/cancel', { form: { id: 'Re7kho-gallery-announce' } })
  assert.equal(res.status, 403)
  assert.equal(JSON.parse(await kv.get(EVENT)).items[0].status, 'held', 'nothing was vetoed')
})

test('POST /review/cancel: vetoes via the exact seed-kv shape (status+facebook_status -> vetoed, veto_reason set)', async () => {
  const kv = fakeKv(queueWith(heldItem()))
  const res = await post(kv, '/review/cancel', { form: { key: KEY, id: 'Re7kho-gallery-announce', reason: 'wrong series' } })
  assert.equal(res.status, 303)
  assert.equal(res.headers.get('location'), `https://worker.example.test/review?key=${KEY}#Re7kho-gallery-announce`)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.status, 'vetoed')
  assert.equal(item.facebook_status, 'vetoed')
  assert.equal(item.veto_reason, 'wrong series')
})

test('POST /review/cancel: a later tick does not publish a cancelled item, even forced (control run does publish)', async () => {
  const past = new Date(Date.now() - 1000).toISOString()
  const kv = fakeKv(queueWith(heldItem({ holdUntil: past, scheduledAt: past })))
  await post(kv, '/review/cancel', { form: { key: KEY, id: 'Re7kho-gallery-announce' } })

  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => { calls.push(String(input)); throw new Error('should not be called') }
  try {
    const res = await worker.fetch(
      new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0' },
    )
    assert.equal(res.status, 200)
  } finally { globalThis.fetch = originalFetch }
  assert.deepEqual(calls, [], 'a vetoed item must never reach the Graph API')
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.status, 'vetoed')
})

test('control: an un-cancelled elapsed-hold item DOES publish on the next tick', async () => {
  const past = new Date(Date.now() - 1000).toISOString()
  const kv = fakeKv(queueWith(heldItem({ holdUntil: past, scheduledAt: past })))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    if (url.hostname === 'ntfy.sh') return new Response('ok', { status: 200 })
    if (method === 'GET' && url.pathname.endsWith('/739564079232058')) return Response.json({ access_token: 'page-token' })
    if (method === 'POST' && url.pathname.endsWith('/17841401886738878/media')) {
      const body = init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {}
      return Response.json({ id: body.media_type === 'CAROUSEL' ? 'ig-parent' : `ig-child-${url.toString().length}` })
    }
    if (method === 'POST' && url.pathname.endsWith('/media_publish')) return Response.json({ id: 'ig-media' })
    if (method === 'GET' && /\/ig-(child|parent)/.test(url.pathname)) return Response.json({ status_code: 'FINISHED' })
    if (method === 'POST' && url.pathname.endsWith('/739564079232058/photos')) return Response.json({ id: 'fb-photo' })
    if (method === 'POST' && url.pathname.endsWith('/739564079232058/feed')) return Response.json({ id: 'fb-feed' })
    throw new Error(`Unexpected request: ${method} ${url}`)
  }
  try {
    await worker.fetch(new Request('https://worker.example.test/run?key=trigger&force=1'),
      { QUEUE: kv, IG_ACCESS_TOKEN: 'system-token', TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0' })
  } finally { globalThis.fetch = originalFetch }
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.status, 'posted')
})

test('POST /review/cancel: cannot cancel a posted item — refused, item stays posted, no VETOED alert', async () => {
  const kv = fakeKv(queueWith(heldItem({ status: 'posted', facebook_status: 'posted' })))
  const ntfyCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => { if (String(input).includes('ntfy.sh')) ntfyCalls.push(1); throw new Error('unexpected') }
  let res
  try {
    res = await post(kv, '/review/cancel', { form: { key: KEY, id: 'Re7kho-gallery-announce' }, envOverrides: { NTFY_TOPIC: 'topic' } })
  } finally { globalThis.fetch = originalFetch }
  assert.equal(res.status, 400)
  assert.match(await res.text(), /already posted/)
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.status, 'posted')
  assert.equal(ntfyCalls.length, 0)
})

test('POST /review/cancel: refuses when only the Facebook destination has posted (not just Instagram)', async () => {
  const kv = fakeKv(queueWith(heldItem({ status: 'error', facebook_status: 'posted' })))
  const res = await post(kv, '/review/cancel', { form: { key: KEY, id: 'Re7kho-gallery-announce' } })
  assert.equal(res.status, 400)
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.facebook_status, 'posted', 'the Facebook receipt must survive, not get overwritten to vetoed')
})

test('POST /review/cancel: accepts the query-string shape (the ntfy one-tap Cancel action, no form body)', async () => {
  const kv = fakeKv(queueWith(heldItem()))
  const res = await worker.fetch(
    new Request(`https://worker.example.test/review/cancel?key=${KEY}&id=Re7kho-gallery-announce&reason=cancelled+from+alert`, { method: 'POST' }),
    baseEnv(kv),
  )
  assert.equal(res.status, 200, 'the query-string shape gets a fast plain response, not a redirect (no browser to redirect)')
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const item = JSON.parse(await kv.get(EVENT)).items[0]
  assert.equal(item.status, 'vetoed')
  assert.equal(item.veto_reason, 'cancelled from alert')
})

test('POST /review/cancel: idempotent — cancelling an already-vetoed item is a no-op, not a second alert', async () => {
  const kv = fakeKv(queueWith(heldItem({ status: 'vetoed', facebook_status: 'vetoed', veto_reason: 'first cancel' })))
  const ntfyCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => { if (String(input).includes('ntfy.sh')) ntfyCalls.push(1); return new Response('ok') }
  let res
  try {
    res = await worker.fetch(
      new Request(`https://worker.example.test/review/cancel?key=${KEY}&id=Re7kho-gallery-announce`, { method: 'POST' }),
      baseEnv(kv, { NTFY_TOPIC: 'topic' }),
    )
  } finally { globalThis.fetch = originalFetch }
  assert.equal(res.status, 200)
  assert.match(await res.text(), /already cancelled/)
  assert.equal(ntfyCalls.length, 0, 'no second VETOED notification on a repeat cancel')
  assert.equal(JSON.parse(await kv.get(EVENT)).items[0].veto_reason, 'first cancel', 'the original reason is not overwritten')
})

test('POST /review/cancel: fires the VETOED notification, not marked LOCAL ONLY (it reached KV)', async () => {
  const kv = fakeKv(queueWith(heldItem()))
  const ntfyCalls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init = {}) => {
    if (String(input).includes('ntfy.sh')) ntfyCalls.push({ headers: init.headers, body: init.body })
    return new Response('ok', { status: 200 })
  }
  try {
    await post(kv, '/review/cancel', { form: { key: KEY, id: 'Re7kho-gallery-announce', reason: 'wrong series' }, envOverrides: { NTFY_TOPIC: 'topic' } })
  } finally { globalThis.fetch = originalFetch }
  assert.equal(ntfyCalls.length, 1)
  assert.equal(ntfyCalls[0].headers['X-Title'], 'Cancelled: JCA at ACC')
  assert.match(ntfyCalls[0].body, /won't post/i)
  assert.doesNotMatch(ntfyCalls[0].body, /LOCAL ONLY/)
})

test('POST /review/cancel: 400 with a missing id', async () => {
  const res = await post(fakeKv(queueWith(heldItem())), '/review/cancel', { form: { key: KEY } })
  assert.equal(res.status, 400)
})

test('POST /review/cancel: 404 when there is no gallery-announce queue at all', async () => {
  const res = await post(fakeKv(null), '/review/cancel', { form: { key: KEY, id: 'x' } })
  assert.equal(res.status, 404)
})

test('/review/cancel: GET is not allowed', async () => {
  const res = await get(fakeKv(queueWith(heldItem())), `/review/cancel?key=${KEY}&id=Re7kho-gallery-announce`)
  assert.equal(res.status, 405)
})
