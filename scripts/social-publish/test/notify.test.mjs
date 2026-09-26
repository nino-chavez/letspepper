import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asciiHeaderValue, buildNtfyRequest, notify,
  heldNotification, postedNotification, failedNotification, vetoedNotification,
} from '../notify.mjs'

// --- asciiHeaderValue --------------------------------------------------------

test('asciiHeaderValue: strips accents rather than dropping the whole value', () => {
  assert.equal(asciiHeaderValue('Jalapeño Open'), 'Jalapeno Open')
})

test('asciiHeaderValue: normalizes em/en dashes and curly quotes to ASCII', () => {
  assert.equal(asciiHeaderValue('HS Girls VB — JCA at ACC'), 'HS Girls VB - JCA at ACC')
  assert.equal(asciiHeaderValue('it’s a “test”'), "it's a \"test\"")
})

test('asciiHeaderValue: drops anything still outside printable ASCII rather than throwing', () => {
  assert.equal(asciiHeaderValue('emoji \u{1F389} party'), 'emoji  party')
})

// --- buildNtfyRequest ---------------------------------------------------------

test('buildNtfyRequest: builds the exact header shape ntfy.sh/publish/ documents', () => {
  const req = buildNtfyRequest({
    topic: 'sekret-topic', title: 'Gallery post held: Re7kho', message: 'body text',
    priority: 'high', tags: ['gallery-announce', 'held'], click: 'https://example.test/album',
  })
  assert.equal(req.url, 'https://ntfy.sh/sekret-topic')
  assert.equal(req.headers['X-Title'], 'Gallery post held: Re7kho')
  assert.equal(req.headers['X-Priority'], 'high')
  assert.equal(req.headers['X-Tags'], 'gallery-announce,held')
  assert.equal(req.headers['X-Click'], 'https://example.test/album')
  assert.equal(req.body, 'body text')
})

test('buildNtfyRequest: refuses without a topic', () => {
  assert.throws(() => buildNtfyRequest({ title: 'x', message: 'y' }), /no topic/)
})

test('buildNtfyRequest: omits optional headers when not given', () => {
  const req = buildNtfyRequest({ topic: 't', message: 'm' })
  assert.equal(req.headers['X-Title'], undefined)
  assert.equal(req.headers['X-Tags'], undefined)
  assert.equal(req.headers['X-Click'], undefined)
  assert.equal(req.headers['X-Priority'], 'default') // default param
})

// --- notify: never throws, never logs the topic/URL --------------------------

test('notify: skips and reports ok:false when no topic is configured, without touching fetch', async () => {
  let called = false
  const result = await notify({ title: 't', message: 'm', fetchImpl: async () => { called = true } })
  assert.equal(result.ok, false)
  assert.equal(called, false)
})

test('notify: resolves ok:true on a 2xx response', async () => {
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return new Response('ok', { status: 200 }) }
  const result = await notify({ topic: 'topic-x', title: 'Hi', message: 'body', fetchImpl })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://ntfy.sh/topic-x')
})

test('notify: a non-2xx response resolves ok:false rather than throwing', async () => {
  const fetchImpl = async () => new Response('nope', { status: 403 })
  const result = await notify({ topic: 't', message: 'm', fetchImpl })
  assert.equal(result.ok, false)
  assert.match(result.error, /403/)
})

test('notify: a thrown network error resolves ok:false rather than propagating', async () => {
  const fetchImpl = async () => { throw new Error('network unreachable') }
  const result = await notify({ topic: 't', message: 'm', fetchImpl })
  assert.equal(result.ok, false)
  assert.match(result.error, /network unreachable/)
})

test('notify: console.error never prints the topic or the ntfy.sh URL on failure', async () => {
  const originalError = console.error
  const lines = []
  console.error = (...args) => lines.push(args.join(' '))
  try {
    await notify({ topic: 'super-secret-topic-name', message: 'm', fetchImpl: async () => { throw new Error('boom') } })
  } finally { console.error = originalError }
  assert.ok(lines.length > 0)
  assert.ok(!lines.some((l) => l.includes('super-secret-topic-name')), `a log line leaked the topic: ${lines.join(' | ')}`)
  assert.ok(!lines.some((l) => l.includes('ntfy.sh/')), `a log line leaked the ntfy.sh URL: ${lines.join(' | ')}`)
})

// --- event builders: pure, no network, no topic -------------------------------

test('heldNotification: carries both the local and the live veto command', () => {
  const n = heldNotification({
    albumKey: 'Re7kho', albumName: 'HS Girls VB - JCA at ACC', selectedOf: '10 of 120',
    account: 'nino.chavez.photo', collaborator: 'flickday.media',
    holdUntilChicago: '2026-09-26 8:00 AM', galleryUrl: 'https://ninochavez.co/photography/albums/x-Re7kho',
  })
  assert.match(n.title, /Re7kho|HS Girls VB/)
  assert.match(n.message, /veto-announce\.mjs --album-key Re7kho/)
  assert.match(n.message, /seed-kv\.mjs --event gallery-announce --veto Re7kho-gallery-announce/)
  assert.match(n.message, /10 of 120/)
  assert.match(n.message, /flickday\.media/)
  assert.equal(n.click, 'https://ninochavez.co/photography/albums/x-Re7kho')
  assert.deepEqual(n.tags, ['gallery-announce', 'held'])
})

test('postedNotification: click is the permalink', () => {
  const n = postedNotification({ albumName: 'Re7kho', channel: 'instagram', permalink: 'https://instagram.com/p/abc' })
  assert.equal(n.click, 'https://instagram.com/p/abc')
  assert.match(n.title, /Posted to instagram/)
})

test('postedNotification: no permalink still produces a sendable notification', () => {
  const n = postedNotification({ albumName: 'Re7kho', channel: 'facebook', permalink: null })
  assert.equal(n.click, null)
  assert.match(n.message, /no permalink/)
})

test('failedNotification: high priority, names the channel and the error', () => {
  const n = failedNotification({ albumName: 'Re7kho', channel: 'facebook', error: '(#200) some error' })
  assert.equal(n.priority, 'high')
  assert.match(n.message, /facebook: \(#200\) some error/)
})

test('vetoedNotification: says LOCAL ONLY when it has not reached the Worker', () => {
  const n = vetoedNotification({ albumName: 'Re7kho', reason: 'wrong scope', localOnly: true })
  assert.match(n.message, /LOCAL ONLY/)
  assert.match(n.message, /wrong scope/)
})

test('vetoedNotification: does not claim LOCAL ONLY once it has reached the Worker', () => {
  const n = vetoedNotification({ albumName: 'Re7kho', reason: 'wrong scope', localOnly: false })
  assert.doesNotMatch(n.message, /LOCAL ONLY/)
})

// --- none of the tags used anywhere match a known ntfy emoji short code ------

test('every tag used by the event builders is a plain word, not an emoji short code', () => {
  const KNOWN_EMOJI_SHORTCODES = new Set([
    'warning', 'rotating_light', 'triangular_flag_on_post', 'skull', 'tada', 'partying_face',
    'heavy_check_mark', 'loudspeaker', '+1', '-1', 'facepalm', 'no_entry', 'no_entry_sign', 'cd', 'computer',
  ])
  const all = [
    ...heldNotification({ albumKey: 'x', albumName: 'x', selectedOf: '1 of 1', account: 'a', holdUntilChicago: 'x', galleryUrl: 'x' }).tags,
    ...postedNotification({ albumName: 'x', channel: 'instagram', permalink: 'x' }).tags,
    ...postedNotification({ albumName: 'x', channel: 'facebook', permalink: 'x' }).tags,
    ...failedNotification({ albumName: 'x', channel: 'instagram', error: 'x' }).tags,
    ...vetoedNotification({ albumName: 'x', reason: 'x', localOnly: true }).tags,
  ]
  for (const tag of all) assert.ok(!KNOWN_EMOJI_SHORTCODES.has(tag), `tag "${tag}" matches a known ntfy emoji short code`)
})
