import assert from 'node:assert/strict'
import test from 'node:test'
import worker from '../src/index.js'

const EVENT = 'test-event'

function queueWithItem() {
  return {
    event: EVENT,
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
