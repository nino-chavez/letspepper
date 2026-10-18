/**
 * Selected-publication package. This is deliberately separate from route-gate:
 * a Graph route says which publisher may be used; this package says exactly
 * what a person reviewed. Packages made here are always draft/review-only.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, extname, resolve } from 'node:path'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export const contentHash = (file) => sha256(readFileSync(file))
export const digestOfPackage = (pkg) => sha256(stable(Object.fromEntries(Object.entries(pkg).filter(([key]) => !['digest', 'approval'].includes(key))))).slice(0, 32)

export function createReviewPackage({ account, mediaType, mediaFile, sourceFile = null, caption = '', coverFile = null, userTags = [], collaborators = [], audio = { representation: 'none' }, source = {}, permittedChanges = [] }) {
  if (!account || !mediaType || !mediaFile) throw new Error('account, mediaType and mediaFile are required')
  if (typeof source.reference !== 'string' || !source.reference.trim()) throw new Error('a selected publication package needs its reviewed source reference')
  const media = resolve(mediaFile)
  const selectedSource = sourceFile ? resolve(sourceFile) : media
  const pkg = {
    schema: 'selected-publication/v1', state: 'draft', account, media_type: mediaType,
    media: { file: media, filename: basename(media), content_sha256: contentHash(media) },
    cover: coverFile ? { file: resolve(coverFile), filename: basename(coverFile), content_sha256: contentHash(resolve(coverFile)) } : null,
    caption, user_tags: [...userTags], collaborators: [...collaborators], audio,
    // A build command cannot turn an invocation into approval or delivery permission.
    delivery: { intent: 'review-only' }, source: { ...source, file: selectedSource, content_sha256: source.content_sha256 || contentHash(selectedSource) }, permitted_changes: [...permittedChanges],
  }
  pkg.digest = digestOfPackage(pkg)
  return pkg
}

const isHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
const same = (a, b) => stable(a) === stable(b)
export function validateReviewPackage(pkg, { approved = false } = {}) {
  if (!pkg || pkg.schema !== 'selected-publication/v1') throw new Error('invalid selected-publication package schema')
  if (!pkg.account || !pkg.media_type || !isHash(pkg.media?.content_sha256) || !isHash(pkg.source?.content_sha256) || typeof pkg.source?.reference !== 'string' || !pkg.source.reference.trim()) throw new Error('package lacks account, media type, source/output content hash, or source reference')
  if (pkg.cover && !isHash(pkg.cover.content_sha256)) throw new Error('package cover lacks content hash')
  if (!['none', 'native', 'embedded'].includes(pkg.audio?.representation)) throw new Error('package audio representation must be none, native, or embedded')
  if (pkg.source?.change === 'audio-only' && (!isHash(pkg.media?.video_stream_sha256) || !isHash(pkg.source?.original_video_stream_sha256) || pkg.media.video_stream_sha256 !== pkg.source.original_video_stream_sha256)) throw new Error('audio-only package does not preserve the selected original video stream')
  const delivery = pkg.delivery || {}
  if (!['review-only', 'immediate', 'scheduled'].includes(delivery.intent)) throw new Error('package has invalid delivery intent')
  if (delivery.intent === 'scheduled' && (!/^\d{4}-\d\d-\d\dT/.test(delivery.scheduled_at || '') || !/^\d{4}-\d\d-\d\dT/.test(delivery.missed_after || '') || !delivery.timezone)) throw new Error('scheduled package needs exact ISO time, missed-window end, and IANA timezone')
  if (delivery.intent !== 'scheduled' && (delivery.scheduled_at || delivery.timezone)) throw new Error('only scheduled packages may carry delivery time or timezone')
  if (pkg.digest !== digestOfPackage(pkg)) throw new Error('package digest does not match selected publication')
  if (approved) {
    if (delivery.intent === 'review-only') throw new Error('review-only package cannot publish')
    if (pkg.approval?.status !== 'approved' || typeof pkg.approval.evidence !== 'string' || !pkg.approval.evidence.trim() || pkg.approval.digest !== pkg.digest) throw new Error('package lacks matching human approval evidence')
  }
  return pkg
}

export function assertLocalFiles(pkg) {
  if (contentHash(pkg.media.file) !== pkg.media.content_sha256) throw new Error('selected media bytes changed after review')
  if (pkg.source.file && contentHash(pkg.source.file) !== pkg.source.content_sha256) throw new Error('selected source bytes changed after review')
  if (pkg.cover && contentHash(pkg.cover.file) !== pkg.cover.content_sha256) throw new Error('selected cover bytes changed after review')
  return true
}

export function assertItemMatchesPackage(item, pkg, execution, now = new Date()) {
  validateReviewPackage(pkg, { approved: true })
  if (item.account !== pkg.account || item.media_type !== pkg.media_type) throw new Error('queue account or media type differs from reviewed package')
  if ((item.caption || '') !== (pkg.caption || '') || !same(item.user_tags || [], pkg.user_tags || []) || !same(item.collaborators || [], pkg.collaborators || [])) throw new Error('queue caption, tags, or collaborators differ from reviewed package')
  const itemAudio = item.audio_configuration ? { representation: 'native', configuration: item.audio_configuration } : { representation: 'none' }
  if (!same(itemAudio, pkg.audio || { representation: 'none' })) throw new Error('queue audio differs from reviewed package')
  if (pkg.delivery.intent !== execution) throw new Error(`reviewed ${pkg.delivery.intent} delivery cannot execute as ${execution}`)
  if (execution === 'scheduled' && item.scheduledAt !== pkg.delivery.scheduled_at) throw new Error('queue scheduled time differs from reviewed package')
  if (execution === 'scheduled' && new Date(pkg.delivery.missed_after).getTime() < now.getTime()) throw new Error('reviewed scheduled delivery missed its approved window')
  if (!item.review_binding || item.review_binding.package_digest !== pkg.digest) throw new Error('queue item lacks matching reviewed-package binding')
  return true
}

export function makeHostedBinding(pkg, { mediaUrl, mediaKey, coverUrl = null, coverKey = null }) {
  if (!mediaUrl || !mediaKey) throw new Error('hosted media URL and content-addressed key are required')
  return { version: 1, package_digest: pkg.digest, media: { url: mediaUrl, key: mediaKey, sha256: pkg.media.content_sha256 },
    ...(pkg.cover ? { cover: { url: coverUrl, key: coverKey, sha256: pkg.cover.content_sha256 } } : {}) }
}

export function assertHostedBindingShape(item, execution, now = new Date()) {
  const pkg = item.review_package
  if (!pkg) return null // legacy queues remain unchanged; reviewed entries are opt-in.
  assertItemMatchesPackage(item, pkg, execution, now)
  const binding = item.review_binding
  if (!binding?.media || !isHash(binding.media.sha256) || binding.media.sha256 !== pkg.media.content_sha256 || !binding.media.key.includes(binding.media.sha256)) throw new Error('reviewed media binding is not content-addressed')
  if ((item.video_url || item.image_url) !== binding.media.url) throw new Error('queue hosted media URL differs from reviewed content binding')
  if (pkg.cover && (!binding.cover || binding.cover.sha256 !== pkg.cover.content_sha256 || !binding.cover.key.includes(binding.cover.sha256))) throw new Error('reviewed cover binding is not content-addressed')
  if (pkg.cover && item.cover_url !== binding.cover.url) throw new Error('queue hosted cover URL differs from reviewed content binding')
  return binding
}

export const assertWorkerBindingShape = (item, now = new Date()) => assertHostedBindingShape(item, 'scheduled', now)

async function fetchedHash(fetchImpl, url) {
  const response = await fetchImpl(url)
  if (!response.ok) throw new Error(`hosted reviewed media unavailable (${response.status})`)
  const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
export async function assertWorkerBinding(item, fetchImpl = fetch) {
  const binding = assertWorkerBindingShape(item)
  if (!binding) return true
  if (await fetchedHash(fetchImpl, binding.media.url) !== binding.media.sha256) throw new Error('hosted reviewed media bytes differ from approved content hash')
  if (binding.cover && await fetchedHash(fetchImpl, binding.cover.url) !== binding.cover.sha256) throw new Error('hosted reviewed cover bytes differ from approved content hash')
  return true
}

function argsOf(argv) { return Object.fromEntries(argv.reduce((out, value, i, all) => value.startsWith('--') ? [...out, [value.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1]]] : out, [])) }
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  const args = argsOf(process.argv.slice(2))
  if (args.create && args.account && args['media-type'] && args.media && args.out) {
    const pkg = createReviewPackage({ account: args.account, mediaType: args['media-type'], mediaFile: args.media,
      caption: args['caption-file'] ? readFileSync(args['caption-file'], 'utf8') : '', coverFile: args.cover || null,
      userTags: typeof args.tags === 'string' ? args.tags.split(',').filter(Boolean) : [], collaborators: typeof args.collaborators === 'string' ? args.collaborators.split(',').filter(Boolean) : [], sourceFile: args['source-file'] || null, source: { reference: args.source } })
    const { writeFileSync } = await import('node:fs'); writeFileSync(args.out, `${JSON.stringify(pkg, null, 2)}\n`); console.log(`Draft review-only package ${pkg.digest} → ${args.out}`)
  } else { console.error('Usage: review-package.mjs --create --account <slug> --media-type <REELS|IMAGE> --media <file> --source <reviewed-source> --out <package.json> [--source-file original] [--caption-file file] [--cover file]'); process.exitCode = 1 }
}
