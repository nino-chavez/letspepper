import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asciiHeaderValue, buildNtfyRequest, buildActionsHeader, notify,
  chicagoLabel, nextAllowedSlot, reviewUrlFor, reviewCancelUrlFor,
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
  assert.equal(req.headers['X-Actions'], undefined)
  assert.equal(req.headers['X-Priority'], 'default') // default param
})

test('buildNtfyRequest: sets X-Actions from the actions array', () => {
  const req = buildNtfyRequest({
    topic: 't', message: 'm',
    actions: [{ action: 'view', label: 'Review', url: 'https://example.test/review' }],
  })
  assert.equal(req.headers['X-Actions'], 'view, Review, https://example.test/review')
})

// --- buildActionsHeader: the exact short-format syntax docs.ntfy.sh/publish/#action-buttons
// documents (fetched 2026-09-26, not guessed) --------------------------------------------

test('buildActionsHeader: a view action, with and without clear', () => {
  assert.equal(
    buildActionsHeader([{ action: 'view', label: 'Review', url: 'https://x.test/review' }]),
    'view, Review, https://x.test/review',
  )
  assert.equal(
    buildActionsHeader([{ action: 'view', label: 'Review', url: 'https://x.test/review', clear: true }]),
    'view, Review, https://x.test/review, clear=true',
  )
})

test('buildActionsHeader: an http action defaults to no explicit method (POST is ntfy\'s default)', () => {
  assert.equal(
    buildActionsHeader([{ action: 'http', label: 'Cancel post', url: 'https://x.test/cancel', clear: true }]),
    'http, Cancel post, https://x.test/cancel, clear=true',
  )
})

test('buildActionsHeader: joins multiple actions with "; "', () => {
  const header = buildActionsHeader([
    { action: 'view', label: 'Review', url: 'https://x.test/review' },
    { action: 'http', label: 'Cancel post', url: 'https://x.test/cancel', clear: true },
  ])
  assert.equal(header, 'view, Review, https://x.test/review; http, Cancel post, https://x.test/cancel, clear=true')
})

test('buildActionsHeader: quotes a field that carries a comma or semicolon', () => {
  assert.equal(
    buildActionsHeader([{ action: 'view', label: 'Cancel, or not', url: 'https://x.test/a;b' }]),
    'view, "Cancel, or not", "https://x.test/a;b"',
  )
})

test('buildActionsHeader: refuses an action type it does not implement', () => {
  assert.throws(() => buildActionsHeader([{ action: 'broadcast' }]), /unknown action type/)
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

// --- chicagoLabel / nextAllowedSlot / reviewUrlFor / reviewCancelUrlFor -------

test('chicagoLabel: a plain "<weekday> <time> Central" label, never a timezone abbreviation', () => {
  // 2026-09-27T03:08:00Z is 2026-09-26 10:08 PM in America/Chicago (CDT, UTC-5 in September).
  assert.equal(chicagoLabel('2026-09-27T03:08:00.000Z'), 'Sat 10:08 PM Central')
  assert.doesNotMatch(chicagoLabel('2026-09-27T03:08:00.000Z'), /CDT|CST/)
})

test('chicagoLabel: null for a missing or invalid input, never "Invalid Date"', () => {
  assert.equal(chicagoLabel(undefined), null)
  assert.equal(chicagoLabel('not a date'), null)
})

test('nextAllowedSlot: rolls forward to the next same-day slot', () => {
  // 2026-09-26T15:00Z (10 AM Central) is before both 17 and 22 UTC — same-day 17:00Z slot.
  assert.equal(nextAllowedSlot('2026-09-26T15:00:00.000Z', [17, 22]), '2026-09-26T17:00:00.000Z')
})

test('nextAllowedSlot: rolls to the next day\'s first slot once every slot for the (UTC) day has passed', () => {
  // 2026-09-26T23:30Z is after both 17:00Z and 22:00Z on its own UTC day (the 26th).
  assert.equal(nextAllowedSlot('2026-09-26T23:30:00.000Z', [17, 22]), '2026-09-27T17:00:00.000Z')
})

test('reviewUrlFor: the review page link, key and id both URL-encoded, id as the fragment', () => {
  assert.equal(
    reviewUrlFor('sek ret', 'Re7kho-gallery-announce'),
    'https://letspepper-reels-worker.biq.workers.dev/review?key=sek%20ret#Re7kho-gallery-announce',
  )
})

test('reviewUrlFor: undefined without a key or an id', () => {
  assert.equal(reviewUrlFor(undefined, 'x'), undefined)
  assert.equal(reviewUrlFor('k', undefined), undefined)
})

test('reviewCancelUrlFor: key and id both ride the query string (no form body)', () => {
  assert.equal(
    reviewCancelUrlFor('sek ret', 'Re7kho-gallery-announce'),
    'https://letspepper-reels-worker.biq.workers.dev/review/cancel?key=sek%20ret&id=Re7kho-gallery-announce',
  )
})

// --- event builders: pure, no network, no topic -------------------------------
// Rewritten 2026-09-26: Nino read the live HELD alert and said "i'm confused on what i'm
// supposed to do... hard to distinguish info from action." The rule now: outcome first, no
// terminal commands in the body, the one action behind a button.

test('heldNotification: leads with when it posts and how many photos, no account/tags/commands', () => {
  const n = heldNotification({
    shortName: 'JCA at ACC', photoCount: 10,
    holdUntilIso: '2026-09-27T03:08:00.000Z', // Sat 10:08 PM Central
    nextSlotIso: '2026-09-27T17:00:00.000Z', // Sun 12:00 PM Central (first ALLOWED_HOURS_UTC slot at/after holdUntil)
    reviewUrl: 'https://letspepper-reels-worker.biq.workers.dev/review?key=k#i',
    reviewCancelUrl: 'https://letspepper-reels-worker.biq.workers.dev/review/cancel?key=k&id=i',
  })
  assert.equal(n.title, 'Posts Sun 12:00 PM Central: JCA at ACC (10 photos)')
  assert.equal(n.message, "Nothing to do. Cancel before Sat 10:08 PM Central if you don't want it.")
  assert.equal(n.click, 'https://letspepper-reels-worker.biq.workers.dev/review?key=k#i')
  assert.equal(n.tags, undefined, 'HELD drops Tags entirely — they render as a visible "Tags: ..." line')
  assert.deepEqual(n.actions, [
    { action: 'view', label: 'Review', url: 'https://letspepper-reels-worker.biq.workers.dev/review?key=k#i' },
    { action: 'http', label: 'Cancel post', url: 'https://letspepper-reels-worker.biq.workers.dev/review/cancel?key=k&id=i', clear: true },
  ])
  assert.doesNotMatch(n.message, /\.mjs|--/, 'no terminal command anywhere in the body')
})

test('heldNotification: no REVIEW_KEY -> no click, no actions, and a different one-liner (never a fallback command)', () => {
  const n = heldNotification({
    shortName: 'JCA at ACC', photoCount: 10,
    holdUntilIso: '2026-09-27T03:08:00.000Z', nextSlotIso: '2026-09-27T17:00:00.000Z',
  })
  assert.equal(n.message, 'Nothing to do. It posts on its own.')
  assert.equal(n.click, undefined)
  assert.deepEqual(n.actions, [])
  assert.doesNotMatch(n.message, /\.mjs|--/)
})

test('heldNotification: singular "photo" for a one-slide carousel', () => {
  const n = heldNotification({ shortName: 'x', photoCount: 1, holdUntilIso: '2026-09-27T03:08:00.000Z', nextSlotIso: '2026-09-27T17:00:00.000Z' })
  assert.match(n.title, /\(1 photo\)$/)
})

test('postedNotification: outcome-first title, a View-on-<channel> button, no account slug', () => {
  const n = postedNotification({ albumName: 'JCA at ACC', channel: 'instagram', permalink: 'https://instagram.com/p/abc', collaborator: 'flickday.media' })
  assert.equal(n.title, 'Posted: JCA at ACC')
  assert.equal(n.click, 'https://instagram.com/p/abc')
  assert.deepEqual(n.actions, [{ action: 'view', label: 'View on Instagram', url: 'https://instagram.com/p/abc' }])
  assert.match(n.message, /Collab/)
  assert.match(n.message, /flickday\.media/)
  assert.doesNotMatch(n.title, /ninophoto|letspepper\b/) // account slug, never shown
})

test('postedNotification: no Collab reminder on the Facebook destination (no Collab there at all)', () => {
  const n = postedNotification({ albumName: 'JCA at ACC', channel: 'facebook', permalink: 'https://facebook.com/123', collaborator: 'flickday.media' })
  assert.doesNotMatch(n.message, /Collab/)
  assert.deepEqual(n.actions, [{ action: 'view', label: 'View on Facebook', url: 'https://facebook.com/123' }])
})

test('postedNotification: no permalink still produces a sendable notification, with no dead button', () => {
  const n = postedNotification({ albumName: 'JCA at ACC', channel: 'facebook', permalink: null })
  assert.equal(n.click, undefined)
  assert.deepEqual(n.actions, [])
  assert.match(n.message, /no permalink/i)
})

test('failedNotification: outcome-first title, high priority, a Review button', () => {
  const n = failedNotification({
    albumName: 'JCA at ACC', channel: 'facebook', error: '(#200) some error',
    reviewUrl: 'https://letspepper-reels-worker.biq.workers.dev/review?key=k#i',
  })
  assert.equal(n.title, "Didn't post: JCA at ACC")
  assert.equal(n.priority, 'high')
  assert.match(n.message, /Facebook.*\(#200\) some error/)
  assert.deepEqual(n.actions, [{ action: 'view', label: 'Review', url: 'https://letspepper-reels-worker.biq.workers.dev/review?key=k#i' }])
})

test('failedNotification: no Review button without a reviewUrl', () => {
  const n = failedNotification({ albumName: 'x', channel: 'instagram', error: 'e' })
  assert.deepEqual(n.actions, [])
  assert.equal(n.click, undefined)
})

test('vetoedNotification: outcome-first title, says LOCAL ONLY when it has not reached the Worker', () => {
  const n = vetoedNotification({ albumName: 'JCA at ACC', reason: 'wrong scope', localOnly: true })
  assert.equal(n.title, 'Cancelled: JCA at ACC')
  assert.match(n.message, /won't post/i)
  assert.match(n.message, /LOCAL ONLY/)
  assert.match(n.message, /wrong scope/)
})

test('vetoedNotification: does not claim LOCAL ONLY once it has reached the Worker', () => {
  const n = vetoedNotification({ albumName: 'JCA at ACC', reason: 'wrong scope', localOnly: false })
  assert.doesNotMatch(n.message, /LOCAL ONLY/)
})

// --- none of the tags used anywhere match a known ntfy emoji short code ------

test('every tag used by the event builders is a plain word, not an emoji short code', () => {
  const KNOWN_EMOJI_SHORTCODES = new Set([
    'warning', 'rotating_light', 'triangular_flag_on_post', 'skull', 'tada', 'partying_face',
    'heavy_check_mark', 'loudspeaker', '+1', '-1', 'facepalm', 'no_entry', 'no_entry_sign', 'cd', 'computer',
  ])
  const all = [
    ...postedNotification({ albumName: 'x', channel: 'instagram', permalink: 'x' }).tags,
    ...postedNotification({ albumName: 'x', channel: 'facebook', permalink: 'x' }).tags,
    ...failedNotification({ albumName: 'x', channel: 'instagram', error: 'x' }).tags,
    ...vetoedNotification({ albumName: 'x', reason: 'x', localOnly: true }).tags,
  ]
  for (const tag of all) assert.ok(!KNOWN_EMOJI_SHORTCODES.has(tag), `tag "${tag}" matches a known ntfy emoji short code`)
})
