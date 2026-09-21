import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.js'
import { seedPayload, lostState, revive } from '../../seed-kv.mjs'

const EVENT = 'test-event'

// A complete standing entry, as seed-kv.mjs copies it from graph-routes.json.
const ROUTE = {
  reason: 'Nino approved this test campaign for the Graph API',
  approved: '2026-09-21',
  accounts: ['letspepper'],
}

function queueWithItem() {
  return {
    event: EVENT,
    meta: { route: { ...ROUTE } },
    items: [
      {
        id: 'dual-image',
        account: 'letspepper',
        channels: ['instagram', 'facebook'],
        media_type: 'IMAGE',
        image_url: 'https://cdn.example.test/poblano.png',
        caption: 'Poblano Open · Saturday, August 1.',
        scheduledAt: '2026-07-25T12:00:00.000Z',
        status: 'pending',
        facebook_status: 'pending',
      },
    ],
  }
}

function queueWithReel() {
  return {
    event: EVENT,
    meta: { route: { ...ROUTE } },
    items: [
      {
        id: 'facebook-reel',
        account: 'letspepper',
        channels: ['facebook'],
        media_type: 'REELS',
        video_url: 'https://cdn.example.test/poblano.mp4',
        caption: 'Poblano Open · Saturday, August 1.',
        collaborators: ['flickday.media', 'nino.chavez.photo'],
        scheduledAt: '2026-07-25T12:00:00.000Z',
        status: 'pending',
        facebook_status: 'pending',
      },
    ],
  }
}

function fakeKv(queue) {
  const values = new Map([[EVENT, JSON.stringify(queue)]])
  return {
    async get(key) {
      return values.get(key) ?? null
    },
    async put(key, value) {
      values.set(key, value)
    },
  }
}

function graphFetch({ failFacebook = false, expectedPageBaseToken = 'system-token' } = {}) {
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'

    if (method === 'GET' && url.pathname.endsWith('/1121553257697663')) {
      assert.equal(url.searchParams.get('access_token'), expectedPageBaseToken)
      return Response.json({ access_token: 'page-token' })
    }
    if (method === 'POST' && url.pathname.endsWith('/17841475435692331/media')) {
      return Response.json({ id: 'ig-container' })
    }
    if (method === 'POST' && url.pathname.endsWith('/17841475435692331/media_publish')) {
      return Response.json({ id: 'ig-media' })
    }
    if (method === 'POST' && url.pathname.endsWith('/1121553257697663/photos')) {
      if (failFacebook) {
        return Response.json(
          { error: { message: 'Missing pages_manage_posts permission' } },
          { status: 403 },
        )
      }
      return Response.json({ id: 'fb-photo', post_id: 'fb-post' })
    }

    throw new Error(`Unexpected Graph request: ${method} ${url}`)
  }
}

function reelsFetch() {
  return async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'
    const body = init.body instanceof URLSearchParams ? init.body : new URLSearchParams()

    if (method === 'GET' && url.pathname.endsWith('/1121553257697663')) {
      return Response.json({ access_token: 'page-token' })
    }
    if (method === 'POST' && url.pathname.endsWith('/1121553257697663/video_reels')) {
      if (body.get('upload_phase') === 'start') {
        return Response.json({
          video_id: 'fb-video',
          upload_url: 'https://rupload.facebook.com/video-upload/v25.0/fb-video',
        })
      }
      assert.equal(body.get('upload_phase'), 'finish')
      assert.equal(body.get('video_state'), 'PUBLISHED')
      return Response.json({ success: true })
    }
    if (method === 'POST' && url.hostname === 'rupload.facebook.com') {
      assert.equal(init.headers.file_url, 'https://cdn.example.test/poblano.mp4')
      return Response.json({ success: true })
    }
    if (method === 'POST' && url.pathname.endsWith('/fb-video/collaborators')) {
      return Response.json({
        success: true,
        invitation_link: `https://facebook.example.test/invite/${body.get('target_id')}`,
      })
    }

    throw new Error(`Unexpected Graph request: ${method} ${url}`)
  }
}

async function runQueue(queue, fetchImpl, envOverrides = {}) {
  const originalFetch = globalThis.fetch
  const kv = fakeKv(queue)
  globalThis.fetch = fetchImpl

  try {
    const response = await worker.fetch(
      new Request('https://worker.example.test/run?key=trigger&force=1'),
      {
        QUEUE: kv,
        IG_ACCESS_TOKEN: 'system-token',
        TRIGGER_KEY: 'trigger',
        ACTIVE_EVENTS: EVENT,
        ALLOWED_HOURS_UTC: '0',
        ...envOverrides,
      },
    )
    assert.equal(response.status, 200)
    return JSON.parse(await kv.get(EVENT))
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('records Instagram and Facebook success independently', async () => {
  const queue = await runQueue(
    queueWithItem(),
    graphFetch({ expectedPageBaseToken: 'facebook-system-token' }),
    { FB_ACCESS_TOKEN: 'facebook-system-token' },
  )
  const item = queue.items[0]

  assert.equal(item.status, 'posted')
  assert.equal(item.ig_media_id, 'ig-media')
  assert.equal(item.facebook_status, 'posted')
  assert.equal(item.facebook_post_id, 'fb-post')
})

test('keeps legacy queue items Instagram-only', async () => {
  const original = queueWithItem()
  delete original.items[0].channels
  delete original.items[0].facebook_status

  const queue = await runQueue(original, async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method || 'GET'

    if (method === 'POST' && url.pathname.endsWith('/17841475435692331/media')) {
      return Response.json({ id: 'ig-container' })
    }
    if (method === 'POST' && url.pathname.endsWith('/17841475435692331/media_publish')) {
      return Response.json({ id: 'ig-media' })
    }

    throw new Error(`Legacy item attempted an unexpected request: ${method} ${url}`)
  })
  const item = queue.items[0]

  assert.equal(item.status, 'posted')
  assert.equal(item.ig_media_id, 'ig-media')
  assert.equal(item.facebook_status, undefined)
  assert.equal(item.facebook_post_id, undefined)
})

test('keeps Instagram posted when Facebook publishing fails', async () => {
  const queue = await runQueue(queueWithItem(), graphFetch({ failFacebook: true }))
  const item = queue.items[0]

  assert.equal(item.status, 'posted')
  assert.equal(item.ig_media_id, 'ig-media')
  assert.equal(item.facebook_status, 'error')
  assert.match(item.facebook_error, /pages_manage_posts/)
})

test('uploads a hosted Facebook Reel and records Page collaborator invitations', async () => {
  const queue = await runQueue(queueWithReel(), reelsFetch())
  const item = queue.items[0]

  assert.equal(item.status, 'pending')
  assert.equal(item.facebook_status, 'posted')
  assert.equal(item.facebook_post_id, 'fb-video')
  assert.equal(item.facebook_uploaded, true)
  assert.deepEqual(
    item.facebook_collaborator_invites.map(({ target_id, status }) => ({ target_id, status })),
    [
      { target_id: '1083438888196332', status: 'invited' },
      { target_id: '739564079232058', status: 'invited' },
    ],
  )
})

// ---------------------------------------------------------------- route gate
// Every refusal case counts Graph requests and must see zero. The first case
// runs the same queue WITH a route through the same recorder and sees the
// publish, so a zero below means the gate held and not that the recorder was blind.

function recording(inner = graphFetch()) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    calls.push(`${init.method || 'GET'} ${input}`)
    return inner(input, init)
  }
  return { calls, fetchImpl }
}

const ymd = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)

function withRoute(queue, route) {
  if (route === undefined) delete queue.meta
  else queue.meta = { route }
  return queue
}

async function assertRefused(queue, pattern) {
  const { calls, fetchImpl } = recording()
  const after = await runQueue(queue, fetchImpl)
  const item = after.items[0]
  assert.deepEqual(calls, [], 'a refused item must not reach the Graph API')
  assert.equal(item.status, 'error')
  assert.equal(item.facebook_status, 'error')
  assert.match(item.route_error, pattern)
  assert.equal(item.error, item.route_error)
  assert.equal(item.facebook_error, item.route_error)
  assert.equal(item.ig_media_id, undefined)
  return after
}

test('control: the recorder sees the publish when the route holds', async () => {
  const { calls, fetchImpl } = recording()
  const item = (await runQueue(queueWithItem(), fetchImpl)).items[0]
  assert.ok(calls.some((c) => c.includes('/media_publish')))
  assert.equal(item.status, 'posted')
  assert.equal(item.route_error, undefined)
})

test('refuses a queue written to KV with no meta.route', async () => {
  await assertRefused(withRoute(queueWithItem(), undefined), /carries no meta\.route/)
})

test('refuses an incomplete route: no approval date', async () => {
  const { approved, ...route } = ROUTE
  await assertRefused(withRoute(queueWithItem(), route), /incomplete/)
})

test('refuses an incomplete route: a malformed date, empty accounts, a blank reason', async () => {
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, approved: 'yesterday' }), /incomplete/)
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, accounts: [] }), /incomplete/)
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, reason: '  ' }), /incomplete/)
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, expires: 'soon' }), /incomplete/)
})

test('refuses an item whose account the route does not list', async () => {
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, accounts: ['flickday'] }), /does not list account "letspepper"/)
})

test('refuses once the route has expired, and honours its last day', async () => {
  await assertRefused(withRoute(queueWithItem(), { ...ROUTE, expires: ymd(-2) }), /expired/)
  const item = (await runQueue(withRoute(queueWithItem(), { ...ROUTE, expires: ymd(0) }), graphFetch())).items[0]
  assert.equal(item.status, 'posted')
})

test('refuses an in-flight container with no route: the resume path cannot reach media_publish', async () => {
  const queue = withRoute(queueWithItem(), undefined)
  Object.assign(queue.items[0], { status: 'building', ig_container_id: 'ig-container', channels: ['instagram'] })
  delete queue.items[0].facebook_status
  const { calls, fetchImpl } = recording()
  const item = (await runQueue(queue, fetchImpl)).items[0]
  assert.deepEqual(calls, [])
  assert.equal(item.status, 'error')
  assert.match(item.route_error, /carries no meta\.route/)
})

test('refuses a Facebook-only Reel without touching Instagram state', async () => {
  const { calls, fetchImpl } = recording(reelsFetch())
  const item = (await runQueue(withRoute(queueWithReel(), undefined), fetchImpl)).items[0]
  assert.deepEqual(calls, [])
  assert.equal(item.status, 'pending') // never an Instagram destination
  assert.equal(item.facebook_status, 'error')
  assert.match(item.facebook_error, /no meta\.route/)
})

test('a refused item stays refused when a route is added later', async () => {
  const refused = await assertRefused(withRoute(queueWithItem(), undefined), /no meta\.route/)
  refused.meta = { route: { ...ROUTE } }
  const { calls, fetchImpl } = recording()
  const item = (await runQueue(refused, fetchImpl)).items[0]
  assert.deepEqual(calls, [], 'a terminal error is re-opened with seed-kv --revive, not by the next seed')
  assert.equal(item.status, 'error')
})

test('/status reports each event route and how many items it refused', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = recording().fetchImpl
  try {
    const env = { QUEUE: fakeKv(withRoute(queueWithItem(), undefined)), IG_ACCESS_TOKEN: 'system-token',
      TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: EVENT, ALLOWED_HOURS_UTC: '0' }
    const status = async () => (await worker.fetch(new Request('https://worker.example.test/status?key=trigger'), env)).json()
    assert.equal((await status()).events[EVENT].route, 'none')
    await worker.fetch(new Request('https://worker.example.test/run?key=trigger&force=1'), env)
    const after = (await status()).events[EVENT]
    assert.equal(after.route_refused, 1)
    const q = JSON.parse(await env.QUEUE.get(EVENT))
    q.meta = { route: { ...ROUTE } }
    await env.QUEUE.put(EVENT, JSON.stringify(q))
    assert.deepEqual((await status()).events[EVENT].route, { approved: ROUTE.approved, accounts: ROUTE.accounts, expires: null })
  } finally {
    globalThis.fetch = originalFetch
  }
})

// ------------------------------------------------------------------ seed-kv
// The seeding step copies the tracked entry; it never invents one.

const routesWith = (entry) => ({ events: { [EVENT]: entry } })

test('seed-kv copies the graph-routes.json entry into meta.route, and the Worker accepts it', async () => {
  const bare = withRoute(queueWithItem(), undefined)
  const { payload, refused } = seedPayload(bare, EVENT, routesWith({ ...ROUTE, note: 'not part of the shape' }))
  assert.equal(refused, undefined)
  assert.deepEqual(payload.meta.route, ROUTE)
  assert.equal(bare.meta, undefined, 'the source queue is not mutated')
  const item = (await runQueue(payload, graphFetch())).items[0]
  assert.equal(item.status, 'posted')
})

test('seed-kv refuses without a complete, current entry naming every account', () => {
  const q = withRoute(queueWithItem(), undefined)
  assert.match(seedPayload(q, EVENT, { events: {} }).refused, /no complete entry/)
  assert.match(seedPayload(q, EVENT, routesWith({ ...ROUTE, approved: undefined })).refused, /no complete entry/)
  assert.match(seedPayload(q, EVENT, routesWith({ ...ROUTE, expires: ymd(-2) })).refused, /expired/)
  assert.match(seedPayload(q, EVENT, routesWith({ ...ROUTE, accounts: ['flickday'] })).refused, /does not list "letspepper"/)
  assert.equal(seedPayload(q, 'adhoc', { events: { adhoc: ROUTE } }).payload, undefined, 'the adhoc ledger never gets a standing route')
})

test('seed-kv --replace is refused when the local copy would forget what the Worker published', () => {
  const live = queueWithItem()
  Object.assign(live.items[0], { status: 'posted', ig_media_id: 'ig-media', facebook_status: 'posted', facebook_post_id: 'fb-post' })
  const extra = { ...queueWithItem().items[0], id: 'not-started' }
  live.items.push(extra)
  assert.deepEqual(lostState(live, queueWithItem()), ['dual-image'], 'a stale local "pending" loses the posted state')
  assert.deepEqual(lostState(live, { items: [] }), ['dual-image'], 'dropping a posted item loses it too')
  assert.deepEqual(lostState(live, structuredClone(live)), [], 'a local copy that carries the state is fine')
  assert.deepEqual(lostState({ items: [extra] }, { items: [] }), [], 'an item the Worker never started carries nothing to lose')
})

test('seed-kv --revive re-opens a route refusal, and the Worker then publishes it', async () => {
  const refused = await assertRefused(withRoute(queueWithItem(), undefined), /no meta\.route/)
  assert.match(revive(refused, ['nope']).refused, /not route-refused/)
  const { queue } = revive(refused, ['dual-image'])
  assert.equal(refused.items[0].status, 'error', 'the input is not mutated')
  assert.equal(queue.items[0].status, 'pending')
  assert.equal(queue.items[0].facebook_status, 'pending')
  assert.equal(queue.items[0].route_error, undefined)
  const item = (await runQueue(seedPayload(queue, EVENT, routesWith(ROUTE)).payload, graphFetch())).items[0]
  assert.equal(item.status, 'posted')
  assert.equal(item.facebook_status, 'posted')
})

test('seed-kv --revive leaves a Graph error terminal', () => {
  const q = queueWithItem()
  Object.assign(q.items[0], { status: 'error', error: 'container ERROR', facebook_status: 'error', facebook_error: 'no route: x', route_error: 'no route: x' })
  const item = revive(q, ['dual-image']).queue.items[0]
  assert.equal(item.status, 'error')
  assert.equal(item.facebook_status, 'pending')
})

test('an Instagram-less item left building is not resumed through Instagram', async () => {
  const q = queueWithItem()
  Object.assign(q.items[0], { channels: ['facebook'], status: 'building', ig_container_id: 'stray', facebook_status: 'posted' })
  const { calls, fetchImpl } = recording()
  const item = (await runQueue(q, fetchImpl)).items[0]
  assert.deepEqual(calls, [])
  assert.equal(item.route_error, undefined)
})

test('a saved container whose status check is throttled goes terminal, never rebuilt', async () => {
  // Graph returns throttles as HTTP 400. The Worker reuses ig_container_id and has
  // no rebuild path: any status-check failure must end the item, not build a second container.
  const q = queueWithReel()
  Object.assign(q.items[0], { channels: ['instagram'], status: 'building', ig_container_id: 'saved-container' })
  delete q.items[0].facebook_status
  const { calls, fetchImpl } = recording(async () =>
    Response.json({ error: { message: 'Application request limit reached', code: 4 } }, { status: 400 }))
  const item = (await runQueue(q, fetchImpl)).items[0]
  assert.equal(calls.length, 1, 'one status check, then stop')
  assert.match(calls[0], /^GET .*\/saved-container\?/)
  assert.ok(!calls.some((c) => c.includes('/media')), 'no new container, no publish')
  assert.equal(item.ig_container_id, 'saved-container')
  assert.equal(item.status, 'error')
  assert.match(item.error, /request limit/)
})
