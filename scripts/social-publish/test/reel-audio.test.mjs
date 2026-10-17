import assert from 'node:assert/strict'
import test from 'node:test'
import { audioConfiguration, audioFromArgs, audioParams } from '../reel-audio.mjs'
import { audioGet, searchAudio, getAudio, checkAudioAccess } from '../instagram-audio.mjs'
import { digestOf, hasReceipt, makeReceipt } from '../route-gate.mjs'

const config = { audio_id: '1579921342191993', audio_volume: 60, video_volume: 35 }
const reel = { id: 'reel', account: '630', media_type: 'REELS', video_url: 'https://media.invalid/reel.mp4', audio_configuration: config }

test('serializes only supported Reel audio fields and preserves the old no-audio path', () => {
  assert.deepEqual(audioParams({ media_type: 'REELS' }), {})
  assert.deepEqual(JSON.parse(audioParams(reel).audio_configuration), config)
  assert.deepEqual(audioFromArgs({ 'audio-id': config.audio_id, 'audio-volume': '60', 'video-volume': '35' }, 'REELS'), config)
})

test('bad audio is refused rather than dropped or clamped', () => {
  for (const audio of [null, {}, { audio_id: 123 }, { audio_id: 'x' }, { ...config, start_time: 3 },
    { ...config, audio_volume: 0 }, { ...config, video_volume: 101 }, { ...config, audio_volume: 1.5 }]) {
    assert.throws(() => audioParams({ ...reel, audio_configuration: audio }))
  }
  for (const media_type of ['IMAGE', 'STORIES', 'CAROUSEL']) assert.throws(() => audioParams({ ...reel, media_type }), /REELS only/)
  assert.throws(() => audioParams({ ...reel, channels: ['instagram', 'facebook'] }), /separate Facebook item/)
  for (const args of [{ 'audio-id': true }, { 'audio-volume': '50' }, { 'audio-id': '123', 'audio-volume': true }]) assert.throws(() => audioFromArgs(args, 'REELS'))
})

test('track and volume changes invalidate approval; equivalent key order does not', () => {
  const now = new Date()
  const item = { ...reel, route: makeReceipt('Nino said use the Graph API', 'test', now, digestOf(reel)) }
  assert.equal(hasReceipt(item, now), true)
  for (const audio_configuration of [undefined, { ...config, audio_id: '999' }, { ...config, audio_volume: 61 }, { ...config, video_volume: 34 }]) {
    assert.equal(hasReceipt({ ...item, audio_configuration }, now), false)
  }
  assert.equal(digestOf({ ...reel, audio_configuration: { video_volume: 35, audio_id: config.audio_id, audio_volume: 60 } }), digestOf(reel))
})

test('search is GET-only, scoped to the IG ID, with bearer auth outside its URL', async () => {
  const seen = []
  const tracks = [{ audio_id: '123', title: 'Instrumental' }]
  const client = { fetchImpl: async (url, init) => {
    seen.push({ url: new URL(url), init })
    return Response.json({ audio: tracks })
  } }
  assert.deepEqual(await searchAudio('private-token', '456', { query: 'upbeat instrumental', ...client }), tracks)
  const { url, init } = seen[0]
  assert.equal(url.pathname, '/v25.0/ig_audio')
  assert.equal(url.searchParams.get('user_id'), '456')
  assert.equal(url.searchParams.get('search_query'), 'upbeat instrumental')
  assert.equal(url.searchParams.get('audio_type'), 'music')
  assert.equal(url.searchParams.has('access_token'), false)
  assert.equal(init.headers.Authorization, 'Bearer private-token')
  assert.equal(init.method, undefined)
  await assert.rejects(() => searchAudio('x', '456', { type: 'bogus', ...client }), /Audio type/)
  await assert.rejects(() => getAudio('x', '456', '../media_publish', client), /Numeric/)
})

test('Graph errors at HTTP 200 still fail; credentials never appear in errors', async () => {
  const client = { fetchImpl: async () => Response.json({ error: { message: 'bad private-token', code: 190 } }) }
  await assert.rejects(() => audioGet('private-token', 'ig_audio', {}, client), error => error.code === 190 && !error.message.includes('private-token'))
  await assert.rejects(() => searchAudio('x', '123', { fetchImpl: async () => Response.json({ data: [] }) }), /missing audio array/)
})

test('access report distinguishes correct identity from music permission and wrong account', async () => {
  const account = { handle: 'club', ig_user_id: '123', page_id: '456' }
  const fetchImpl = async url => {
    const path = new URL(url).pathname
    if (path.endsWith('/debug_token')) return Response.json({ data: { is_valid: true, type: 'PAGE', access_token: 'must-not-return' } })
    if (path.endsWith('/123')) return Response.json({ id: '123', username: 'club' })
    if (path.endsWith('/456')) return Response.json({ id: '456', instagram_business_account: { id: '123' } })
    return Response.json({ error: { code: 200, message: 'permission denied' } })
  }
  const report = await checkAudioAccess('token', account, { fetchImpl })
  assert.equal(report.identity_verified, true)
  assert.equal(report.audio.accessible, false)
  assert.equal(report.ready_to_search, false)
  assert.equal(JSON.stringify(report).includes('must-not-return'), false)
  const wrong = await checkAudioAccess('token', { ...account, handle: 'wrong' }, { fetchImpl })
  assert.equal(wrong.identity_verified, false)
})
