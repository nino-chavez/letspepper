import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertHostedBindingShape, assertItemMatchesPackage, assertLocalFiles, assertWorkerBinding, assertWorkerBindingShape,
  contentHash, createReviewPackage, digestOfPackage, makeHostedBinding, validateReviewPackage,
} from '../review-package.mjs'
import { seedPayload } from '../seed-kv.mjs'
import worker from '../worker/src/index.js'

const dir = () => mkdtempSync(join(tmpdir(), 'review-package-'))
const approved = (pkg, intent = 'immediate') => {
  pkg.state = 'reviewed'; pkg.delivery = intent === 'scheduled'
    ? { intent, scheduled_at: '2026-10-20T14:00:00.000Z', missed_after: '2026-10-20T15:00:00.000Z', timezone: 'America/Chicago' } : { intent }
  pkg.digest = digestOfPackage(pkg); pkg.approval = { status: 'approved', evidence: 'Nino selected this exact package in review.', digest: pkg.digest }
  return pkg
}
const itemFor = (pkg, execution = 'immediate') => ({
  id: 'selected-1', account: pkg.account, media_type: pkg.media_type, caption: pkg.caption,
  user_tags: pkg.user_tags, collaborators: pkg.collaborators,
  ...(pkg.audio.representation === 'native' ? { audio_configuration: pkg.audio.configuration } : {}),
  ...(execution === 'scheduled' ? { scheduledAt: pkg.delivery.scheduled_at } : {}),
  review_package: pkg, review_package_digest: pkg.digest, review_binding: { version: 1, package_digest: pkg.digest },
})

test('a generated package is a draft, review-only, and cannot publish merely because a CLI created it', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'approved-picture')
    const pkg = createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, caption: 'Exact caption', source: { reference: 'TPS selected source v2' } })
    assert.equal(pkg.state, 'draft'); assert.equal(pkg.delivery.intent, 'review-only'); assert.throws(() => validateReviewPackage(pkg, { approved: true }), /review-only/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('accepted local package binds caption, account, tags, audio, cover, source bytes, and delivery', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); const source = join(root, 'source.mp4'); const cover = join(root, 'cover.jpg')
    writeFileSync(media, 'picture'); writeFileSync(source, 'source-picture'); writeFileSync(cover, 'cover')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, sourceFile: source, coverFile: cover, caption: 'The current selected caption.', userTags: ['team'], collaborators: ['flickday.media'], audio: { representation: 'native', configuration: { audio_id: '123', audio_volume: 60, video_volume: 35 } }, source: { reference: 'TPS master selected 2026-10-18' }, permittedChanges: ['audio-only'] }))
    const item = itemFor(pkg); assert.doesNotThrow(() => { validateReviewPackage(pkg, { approved: true }); assertLocalFiles(pkg); assertItemMatchesPackage(item, pkg, 'immediate') })
    item.video_url = `https://media.invalid/${pkg.media.content_sha256}.mp4`; item.cover_url = `https://media.invalid/${pkg.cover.content_sha256}.jpg`
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4`, coverUrl: item.cover_url, coverKey: `event/${pkg.cover.content_sha256}.jpg` })
    assert.doesNotThrow(() => assertHostedBindingShape(item, 'immediate'))
    for (const changed of [
      { account: '630' }, { caption: 'Stale caption' }, { user_tags: [] }, { collaborators: [] },
      { audio_configuration: { audio_id: '999', audio_volume: 60, video_volume: 35 } },
    ]) assert.throws(() => assertItemMatchesPackage({ ...item, ...changed }, pkg, 'immediate'))
    writeFileSync(media, 'wrong-picture'); assert.throws(() => assertLocalFiles(pkg), /media bytes changed/)
    writeFileSync(media, 'picture'); writeFileSync(source, 'wrong-source'); assert.throws(() => assertLocalFiles(pkg), /source bytes changed/)
    writeFileSync(source, 'source-picture'); writeFileSync(cover, 'wrong-cover'); assert.throws(() => assertLocalFiles(pkg), /cover bytes changed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('audio-only output must name the selected original video stream, not merely a new file hash', () => {
  const root = dir()
  try {
    const media = join(root, 'with-music.mp4'); writeFileSync(media, 'new-audio-same-picture')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, audio: { representation: 'embedded' }, source: { reference: 'selected original', change: 'audio-only', original_video_stream_sha256: 'a'.repeat(64) } }))
    pkg.media.video_stream_sha256 = 'b'.repeat(64); pkg.digest = digestOfPackage(pkg); pkg.approval.digest = pkg.digest
    assert.throws(() => validateReviewPackage(pkg, { approved: true }), /preserve the selected original video stream/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('scheduled package refuses immediate execution, changed time, and review-only coercion', () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'media')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    const item = itemFor(pkg, 'scheduled'); assert.doesNotThrow(() => assertItemMatchesPackage(item, pkg, 'scheduled'))
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'immediate'), /cannot execute/)
    assert.throws(() => assertItemMatchesPackage({ ...item, scheduledAt: '2026-10-20T15:00:00.000Z' }, pkg, 'scheduled'), /scheduled time/)
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'scheduled', new Date('2026-10-20T16:00:00.000Z')), /missed its approved window/)
    pkg.delivery = { intent: 'review-only' }; pkg.digest = digestOfPackage(pkg); pkg.approval.digest = pkg.digest
    assert.throws(() => assertItemMatchesPackage(item, pkg, 'scheduled'), /review-only/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('worker binding verifies hosted content before a scheduled item can create or retry a container', async () => {
  const root = dir()
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'hosted-media')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    const item = itemFor(pkg, 'scheduled')
    item.video_url = 'https://media.invalid/' + pkg.media.content_sha256 + '.mp4'
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4` })
    item.ig_container_id = 'prepared-container' // a retry still has to re-check bytes.
    assert.doesNotThrow(() => assertWorkerBindingShape(item))
    assert.throws(() => assertHostedBindingShape({ ...item, video_url: 'https://media.invalid/mutable-name.mp4' }, 'scheduled'), /hosted media URL/)
    const routes = { events: { selected: { reason: 'Nino approved this scheduled selected package.', approved: '2026-10-18', accounts: ['letspepper'] } } }
    assert.doesNotThrow(() => seedPayload({ items: [item] }, 'selected', routes))
    assert.throws(() => seedPayload({ items: [{ ...item, caption: 'replacement caption' }] }, 'selected', routes), /caption/)
    await assert.doesNotReject(() => assertWorkerBinding(item, async () => new Response('hosted-media')))
    await assert.rejects(() => assertWorkerBinding(item, async () => new Response('replaced-bytes')), /hosted reviewed media bytes/)
    item.review_binding.media.key = 'event/mutable-name.mp4'; assert.throws(() => assertWorkerBindingShape(item), /content-addressed/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('the Worker refuses changed hosted bytes before any Graph container request', async () => {
  const root = dir(); const originalFetch = globalThis.fetch
  try {
    const media = join(root, 'selected.mp4'); writeFileSync(media, 'reviewed-bytes')
    const pkg = approved(createReviewPackage({ account: 'letspepper', mediaType: 'REELS', mediaFile: media, source: { reference: 'review frame' } }), 'scheduled')
    pkg.delivery.scheduled_at = new Date(Date.now() - 1_000).toISOString(); pkg.delivery.missed_after = new Date(Date.now() + 60_000).toISOString()
    pkg.digest = digestOfPackage(pkg); pkg.approval.digest = pkg.digest
    const item = itemFor(pkg, 'scheduled'); item.status = 'pending'; item.video_url = `https://media.invalid/${pkg.media.content_sha256}.mp4`
    item.review_binding = makeHostedBinding(pkg, { mediaUrl: item.video_url, mediaKey: `event/${pkg.media.content_sha256}.mp4` })
    const values = new Map([['selected', JSON.stringify({ event: 'selected', meta: { route: { reason: 'Nino approved this selected scheduled item.', approved: '2026-10-18', accounts: ['letspepper'] } }, items: [item] })]])
    const kv = { get: async (key) => values.get(key) ?? null, put: async (key, value) => values.set(key, value) }
    let graphCalls = 0
    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://media.invalid/')) return new Response('replaced-bytes')
      graphCalls++; throw new Error('Graph must not be reached')
    }
    const response = await worker.fetch(new Request('https://worker.invalid/run?key=trigger&force=1'), { QUEUE: kv, TRIGGER_KEY: 'trigger', ACTIVE_EVENTS: 'selected', ALLOWED_HOURS_UTC: '0' })
    assert.equal(response.status, 200); assert.equal(graphCalls, 0)
    const saved = JSON.parse(await kv.get('selected')).items[0]
    assert.equal(saved.status, 'error'); assert.match(saved.error, /hosted reviewed media bytes/)
  } finally { globalThis.fetch = originalFetch; rmSync(root, { recursive: true, force: true }) }
})
