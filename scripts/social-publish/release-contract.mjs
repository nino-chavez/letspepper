/**
 * Release contract — one frozen package per post, reviewed from the file and published from it.
 *
 * WHY THIS EXISTS (2026-10-18): the TPS day-one Reel went live with four release mistakes in one
 * post. It was rendered from a 41.3 s prepared derivative instead of the selected 53.87 s CapCut
 * export (the instruction had been audio-only); it carried an older caption file instead of the
 * selected one; the @nick_maruyama and @chellechavez_ tags were missing; and it went out at once
 * when Sunday 7am CT was wanted. Every check that ran passed, because each compared a file against
 * itself or against whichever file it had been handed. The route gate's digest names media by its
 * hosted URL, which does not exist at review time, and it never hashed the delivery time;
 * post-now.mjs defaulted scheduledAt to "now" without saying so.
 *
 * So: what Nino is shown is a release.json, one per post, saved beside the media. `review`
 * measures the media on disk (sha256 of the bytes; for a video, the md5 of its video stream, so
 * an audio-only remux can be told from a re-render), checks the caption carries every listed
 * mention, and records a review digest plus a per-field digest. `post-now.mjs --release` builds the
 * queue item from that file alone — content flags are refused beside it — measures the media
 * again, and refuses before any side effect when anything differs from the record, naming the
 * field. post-reels.mjs re-checks the ledger item against the same record when it publishes,
 * because a scheduled run is hours later and the ledger is a file — and it fetches the hosted
 * object it is about to hand Meta and hashes it against the reviewed hash, because a ledger can
 * point its URL anywhere and only the bytes at that URL say what will go out.
 *
 * Delivery is checked against the clock too. A scheduled time already past is refused at review
 * (it is a typo or a missed window, and nothing should be queued against it) and refused at
 * publish once it is more than LATE_GRACE_MS behind (a run a few minutes after 7am is 7am; a run
 * three hours late is a new decision). "Scheduled" never quietly becomes "now".
 *
 * The review digest is digestOf() from route-gate.mjs — the same formula a route receipt and a
 * saved container are bound by — over the item with its id and hosted URLs blanked and the event
 * label "release". digestOf() hashes the release block (media hashes, cover hash, mentions,
 * delivery) only when an item carries one, so legacy items, receipts and containers are untouched.
 *
 * release.json:
 *   {
 *     "account": "630",                       accounts.json slug — the destination
 *     "media_type": "REELS",                  REELS | IMAGE | STORIES
 *     "source": { "file": "export.mp4" },     path, absolute or relative to this file; review adds
 *                                             "sha256" (file bytes) and "video_md5" (video stream, or null)
 *     "caption": "...",                       the caption text itself, inline — never a path to a caption file
 *     "mentions": ["nick_maruyama"],          handles the caption must contain as @handle; [] means none
 *     "user_tags": ["nick_maruyama"],         people tags (Story mentions go here); [] means none
 *     "collaborators": [],                    Collab co-author invites; [] means none
 *     "audio_configuration": null,            {"audio_id": "<numeric>", "audio_volume"?, "video_volume"?} or null
 *     "cover": null,                          REELS only: {"file": "cover.jpg"} (review adds "sha256") or null
 *     "alt_text": "...",                      IMAGE only, optional
 *     "delivery": { "immediate": true },      or {"scheduled_at": "2026-10-19T07:00", "timezone": "America/Chicago"}
 *     "notes": "...",                         optional free text for the reviewer; not checked
 *     "review": { ... }                       written by `review`; digest, per-field digests, reviewed_at
 *   }
 *   Every array is required, so an empty list is a decision and a missing one is a refusal.
 *   Unknown keys are refused rather than dropped.
 *
 *   node scripts/social-publish/release-contract.mjs review <release.json>   measure, record, print what will go out
 *   node scripts/social-publish/release-contract.mjs check  <release.json>   what post-now --release would decide (exit 4 on mismatch)
 *   node scripts/social-publish/post-now.mjs --release <release.json> --graph-route "<Nino's words>"
 *
 * Exit codes: 1 for a package that cannot be read (shape, missing file, no ffmpeg); REFUSED_RELEASE (4)
 * when the package or the media no longer matches its review record. The route gate's 3 is separate:
 * this file binds content, not routing.
 */
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, resolve, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestOf } from './route-gate.mjs'
import { audioConfiguration } from './reel-audio.mjs'

export const REFUSED_RELEASE = 4
/** How late a scheduled publish may run and still count as on time. Past this, the delivery is re-decided. */
export const LATE_GRACE_MS = 15 * 60_000
/** The fields the review record binds, in the order a refusal lists them. */
export const CONTRACT_FIELDS = ['account', 'media_type', 'source.sha256', 'source.video_md5', 'cover.sha256', 'caption', 'mentions', 'user_tags', 'collaborators', 'audio_configuration', 'alt_text', 'delivery']
const DIGEST_EVENT = 'release' // the event label the review digest is computed under; the item's account is in the hash

const HERE = dirname(fileURLToPath(import.meta.url))
const TOP_KEYS = ['account', 'media_type', 'source', 'caption', 'mentions', 'user_tags', 'collaborators', 'audio_configuration', 'cover', 'alt_text', 'delivery', 'notes', 'review']
const MEDIA_TYPES = ['REELS', 'IMAGE', 'STORIES']
const VIDEO_EXT = ['.mp4', '.mov']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png']
const HANDLE = /^[A-Za-z0-9_.]{1,30}$/
const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const DELIVERY_HOW = '{"immediate": true} or {"scheduled_at": "YYYY-MM-DDTHH:mm", "timezone": "<IANA zone, e.g. America/Chicago>"}'

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
const problem = (field, message) => ({ field, message })
const short = (hex) => (typeof hex === 'string' && hex.length > 16 ? `${hex.slice(0, 12)}…` : String(hex))

/** A refusal or an unreadable package: `problems` is [{field, message}], `exitCode` says which. */
export class ReleaseError extends Error {
  constructor(path, problems, { exitCode = 1, stage = 'review' } = {}) {
    super(refusalText(path, problems, stage))
    this.name = 'ReleaseError'; this.path = path; this.problems = problems; this.exitCode = exitCode
  }
}

export function refusalText(path, problems, stage = 'publish') {
  const lines = problems.map((p) => `  ${p.field}: ${p.message}`)
  if (stage === 'review') return [`Not reviewed — ${path}`, ...lines, 'Fix the package, then run the review again.'].join('\n')
  return [
    `REFUSED — release contract: ${path}`,
    ...lines,
    'What was reviewed is not what would be published. Nothing was queued, uploaded or published.',
    `Fix the media or the package, review it again (node scripts/social-publish/release-contract.mjs review ${path}),`,
    'and publish from the reviewed file. A ledger item that drifted from its record is queued again from the package, not edited back.',
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------------------------

function handleProblems(arr, field) {
  if (!Array.isArray(arr)) return [`${field}: must be an array — [] when there are none, so an empty list is a decision and a missing one is not`]
  const out = []
  for (const h of arr) {
    const name = isObj(h) ? h.username : h
    if (typeof name !== 'string' || !HANDLE.test(name)) out.push(`${field}: ${JSON.stringify(name)} is not an Instagram handle written without the @ (letters, digits, _ and .)`)
  }
  return out
}

function deliveryProblems(d) {
  if (!isObj(d)) return [`delivery: required — ${DELIVERY_HOW}`]
  const keys = Object.keys(d).sort().join(',')
  if (keys === 'immediate') return d.immediate === true ? [] : [`delivery: "immediate" is true or the delivery is scheduled — ${DELIVERY_HOW}`]
  if (keys === 'scheduled_at,timezone') {
    try { instantOf(d.scheduled_at, d.timezone); return [] } catch (e) { return [`delivery: ${e.message}`] }
  }
  return [`delivery: exactly one of the two shapes — ${DELIVERY_HOW}`]
}

/** Shape problems as "field: why" strings; [] when the package is well formed. Reads nothing from disk. */
export function validateRelease(release) {
  if (!isObj(release)) return ['release: must be a JSON object']
  const p = []
  for (const k of Object.keys(release)) if (!TOP_KEYS.includes(k)) p.push(`${k}: unknown field — the publisher would drop it silently, so it is refused instead`)
  if (typeof release.account !== 'string' || !release.account.trim()) p.push('account: the destination account slug (accounts.json) is required')
  const type = release.media_type
  if (!MEDIA_TYPES.includes(type)) p.push(`media_type: one of ${MEDIA_TYPES.join(', ')}`)
  const file = release.source?.file
  if (!isObj(release.source) || typeof file !== 'string' || !file.trim()) p.push('source.file: the path of the media file is required')
  else {
    const ext = extname(file).toLowerCase()
    const video = VIDEO_EXT.includes(ext), image = IMAGE_EXT.includes(ext)
    if (!video && !image) p.push(`source.file: unsupported extension "${ext}" — use jpg/jpeg/png/mp4/mov`)
    else if (type === 'REELS' && !video) p.push(`media_type: REELS needs a video file; source.file is ${ext}`)
    else if (type === 'IMAGE' && !image) p.push(`media_type: IMAGE needs an image file; source.file is ${ext}`)
  }
  if (isObj(release.source)) {
    for (const k of Object.keys(release.source)) if (!['file', 'sha256', 'video_md5'].includes(k)) p.push(`source.${k}: unknown field`)
    if (release.source.sha256 != null && !/^[0-9a-f]{64}$/.test(release.source.sha256)) p.push('source.sha256: not a sha256 hex digest — leave it out and let `review` measure it')
    if (release.source.video_md5 != null && !/^[0-9a-f]{32}$/.test(release.source.video_md5)) p.push('source.video_md5: not an md5 hex digest — leave it out and let `review` measure it')
  }
  if (typeof release.caption !== 'string') p.push('caption: the caption text itself, inline — not a path to a caption file')
  else if (type === 'STORIES' && release.caption) p.push('caption: a Story shows no caption and the publisher would drop it; leave it "" and render the text into the media')
  p.push(...handleProblems(release.mentions, 'mentions'), ...handleProblems(release.user_tags, 'user_tags'), ...handleProblems(release.collaborators, 'collaborators'))
  if (type === 'STORIES') {
    if (Array.isArray(release.mentions) && release.mentions.length) p.push('mentions: a Story has no caption to mention anyone in — a Story mention is a user_tags entry')
    if (Array.isArray(release.collaborators) && release.collaborators.length) p.push('collaborators: a Story cannot carry collaborators')
  }
  if (release.audio_configuration === undefined) p.push('audio_configuration: required — {"audio_id": "<numeric>", "audio_volume"?, "video_volume"?} or null for none')
  else if (release.audio_configuration !== null) {
    try { audioConfiguration({ media_type: type, audio_configuration: release.audio_configuration }) } catch (e) { p.push(`audio_configuration: ${e.message}`) }
  }
  if (release.cover != null) {
    if (!isObj(release.cover) || typeof release.cover.file !== 'string' || !release.cover.file.trim()) p.push('cover: {"file": "<jpeg>"} or null')
    else if (type !== 'REELS') p.push('cover: applies to a Reel only')
    else if (!/\.jpe?g$/i.test(release.cover.file)) p.push('cover.file: must be a JPEG')
    if (isObj(release.cover) && release.cover.sha256 != null && !/^[0-9a-f]{64}$/.test(release.cover.sha256)) p.push('cover.sha256: not a sha256 hex digest')
  }
  if (release.alt_text !== undefined) {
    if (typeof release.alt_text !== 'string') p.push('alt_text: must be a string')
    else if (type !== 'IMAGE') p.push(`alt_text: Meta has alt text on a feed image only, not ${type}`)
  }
  p.push(...deliveryProblems(release.delivery))
  if (release.notes !== undefined && typeof release.notes !== 'string') p.push('notes: free text, a string')
  if (release.review !== undefined && !isObj(release.review)) p.push('review: written by `release-contract.mjs review`, not by hand')
  return p
}

/** Read and validate a package. Throws ReleaseError (exit 1) when it cannot be used. */
export function loadRelease(path) {
  if (!existsSync(path)) throw new ReleaseError(path, [problem('release', 'file not found')])
  let release
  try { release = JSON.parse(readFileSync(path, 'utf8')) } catch (e) { throw new ReleaseError(path, [problem('release', `not valid JSON (${e.message})`)]) }
  const problems = validateRelease(release)
  if (problems.length) throw new ReleaseError(path, problems.map(fromString))
  return { release, dir: dirname(path) }
}
const fromString = (s) => { const i = s.indexOf(': '); return problem(s.slice(0, i), s.slice(i + 2)) }

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/** Local wall time in a named zone → the UTC instant. Two passes, so a time near a DST change resolves. */
export function instantOf(localIso, timeZone) {
  const m = typeof localIso === 'string' && LOCAL_ISO.exec(localIso)
  if (!m) throw new Error(`scheduled_at must be local wall time "YYYY-MM-DDTHH:mm[:ss]" with no offset, got ${JSON.stringify(localIso)}`)
  let fmt
  try {
    if (typeof timeZone !== 'string') throw new Error()
    fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { throw new Error(`timezone ${JSON.stringify(timeZone)} is not an IANA zone name (e.g. America/Chicago)`) }
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0))
  const wall = Date.UTC(y, mo - 1, d, h, mi, s)
  const offsetAt = (t) => {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]))
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t
  }
  let t = wall - offsetAt(wall)
  t = wall - offsetAt(t)
  return new Date(t)
}

/** When a delivery instruction says the post goes out. `now` is the publish moment for an immediate one. */
export function deliveryInstant(delivery, now = new Date()) {
  return delivery?.immediate === true ? now : instantOf(delivery.scheduled_at, delivery.timezone)
}

export const describeDelivery = (d) => (d?.immediate === true ? 'immediate' : `${d?.scheduled_at} ${d?.timezone}`)

const humanDuration = (ms) => {
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m} min`
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ${m % 60} min`
  return `${Math.round(m / (24 * 60))} days`
}

/**
 * A scheduled delivery against the clock. At review (grace 0) a past time is refused outright. At
 * publish, a time more than `grace` behind is refused: the reviewed instruction no longer
 * describes what would happen, so it is decided again rather than silently becoming "now".
 */
export function lateProblems(delivery, now = new Date(), grace = LATE_GRACE_MS, { stage = 'publish' } = {}) {
  if (!delivery?.scheduled_at) return []
  let at
  try { at = instantOf(delivery.scheduled_at, delivery.timezone) } catch (e) { return [problem('delivery', e.message)] }
  const late = now.getTime() - at.getTime()
  if (late <= grace) return []
  const when = `scheduled for ${describeDelivery(delivery)} (${at.toISOString()}), which was ${humanDuration(late)} ago`
  return [problem('delivery', stage === 'review'
    ? `${when} — already past at review time. Pick a future time, or {"immediate": true}`
    : `${when}, past the ${grace / 60_000}-minute grace — the reviewed delivery time has passed and "scheduled" does not quietly become "now". Review again with a new time, or {"immediate": true}`)]
}

// ---------------------------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------------------------

export const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/** md5 of the video stream's packets alone, so a re-mux with new audio reads as the same picture. */
export function videoStreamMd5(path, { ffmpeg = 'ffmpeg' } = {}) {
  let out
  try {
    out = execFileSync(ffmpeg, ['-v', 'error', '-nostdin', '-i', path, '-map', '0:v:0', '-c', 'copy', '-f', 'md5', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`ffmpeg is required to hash the video stream of ${path} and was not found on PATH`)
    throw new Error(`ffmpeg could not read the video stream of ${path}: ${String(e.stderr || e.message).trim()}`)
  }
  const m = /MD5=([0-9a-f]{32})/.exec(out)
  if (!m) throw new Error(`ffmpeg returned no MD5 for ${path}`)
  return m[1]
}

/** Duration in seconds via ffprobe, for the reviewer's eyes only; null when ffprobe is absent. */
function durationOf(path) {
  try {
    const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return Number.isFinite(Number(s)) ? Number(s) : null
  } catch { return null }
}

/** Hash what is on disk right now. Throws ReleaseError (exit 1) when a named file is missing or unreadable. */
export function measure(release, dir, { ffmpeg, path = join(dir, 'release.json') } = {}) {
  const file = resolve(dir, release.source.file)
  if (!existsSync(file)) throw new ReleaseError(path, [problem('source.file', `${file} does not exist`)])
  const video = VIDEO_EXT.includes(extname(file).toLowerCase())
  const measured = { file, sha256: sha256File(file), video_md5: null, cover_file: null, cover_sha256: null }
  if (video) {
    try { measured.video_md5 = videoStreamMd5(file, { ffmpeg }) } catch (e) { throw new ReleaseError(path, [problem('source.video_md5', e.message)]) }
  }
  if (release.cover) {
    measured.cover_file = resolve(dir, release.cover.file)
    if (!existsSync(measured.cover_file)) throw new ReleaseError(path, [problem('cover.file', `${measured.cover_file} does not exist`)])
    measured.cover_sha256 = sha256File(measured.cover_file)
  }
  return measured
}

// ---------------------------------------------------------------------------------------------
// The item, its fields, its digest
// ---------------------------------------------------------------------------------------------

/** The queue item post-now.mjs would write from this package — the same shape its flags produce, plus `release`. */
export function releaseItem(release, measured, { id = null, now = new Date(), path = null } = {}) {
  const type = release.media_type
  const audio = release.audio_configuration ? audioConfiguration({ media_type: type, audio_configuration: release.audio_configuration }) : undefined
  return {
    id,
    account: release.account,
    media_type: type,
    file: measured.file,
    ...(measured.cover_file ? { cover_file: measured.cover_file, cover_url: null } : {}),
    caption: type === 'STORIES' ? '' : release.caption,
    ...(release.alt_text ? { alt_text: release.alt_text } : {}),
    ...(audio ? { audio_configuration: audio } : {}),
    video_url: null,
    image_url: null,
    user_tags: release.user_tags,
    collaborators: release.collaborators,
    scheduledAt: deliveryInstant(release.delivery, now).toISOString(),
    status: 'pending',
    release: {
      ...(path ? { path } : {}),
      source: { file: measured.file, sha256: measured.sha256, video_md5: measured.video_md5 },
      cover_sha256: measured.cover_sha256,
      mentions: release.mentions,
      delivery: release.delivery,
      ...(release.review ? { review: release.review } : {}),
    },
  }
}

/** The bound fields of an item (from a package or from the ledger), keyed as CONTRACT_FIELDS. */
export function contractFields(item) {
  const r = isObj(item?.release) ? item.release : {}
  return {
    account: item?.account ?? null,
    media_type: item?.media_type || 'REELS',
    'source.sha256': r.source?.sha256 ?? null,
    'source.video_md5': r.source?.video_md5 ?? null,
    'cover.sha256': r.cover_sha256 ?? null,
    caption: item?.caption ?? '',
    mentions: Array.isArray(r.mentions) ? r.mentions : [],
    user_tags: item?.user_tags ?? [],
    collaborators: item?.collaborators ?? [],
    audio_configuration: item?.audio_configuration ? audioConfiguration(item) : null,
    alt_text: item?.alt_text ?? null,
    delivery: r.delivery ?? null,
  }
}

const hash16 = (value) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16)
export const fieldDigests = (fields) => Object.fromEntries(CONTRACT_FIELDS.map((f) => [f, hash16(fields[f])]))

/** digestOf() over the item as reviewed: no id, no hosted URLs (there are none at review time), a fixed event label. */
export function contractDigest(item) {
  return digestOf({ ...item, id: null, video_url: null, image_url: null, cover_url: null }, undefined, DIGEST_EVENT)
}

export function reviewOf(item, now = new Date()) {
  return { digest: contractDigest(item), fields: fieldDigests(contractFields(item)), reviewed_at: now.toISOString() }
}

const describe = (v) => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string') return JSON.stringify(v.length > 90 ? `${v.slice(0, 90)}…` : v)
  return JSON.stringify(v)
}

/** Every listed mention has to appear in the caption as @handle. */
export function mentionProblems(release) {
  if (release.media_type === 'STORIES' || !Array.isArray(release.mentions)) return []
  const caption = typeof release.caption === 'string' ? release.caption : ''
  const missing = release.mentions.filter((h) => typeof h === 'string' && !new RegExp(`(^|[^A-Za-z0-9_.])@${h.replace(/\./g, '\\.')}(?![A-Za-z0-9_.])`).test(caption))
  return missing.length ? [problem('mentions', `the caption does not mention ${missing.map((h) => `@${h}`).join(', ')} — add them to the caption or take them off the list`)] : []
}

/**
 * The item against its own review record: the check post-reels.mjs runs on a ledger item, with no
 * disk. Names every field whose digest moved; a changed formula is named last, as review.digest.
 */
export function compareReview(item) {
  const review = item?.release?.review
  if (!isObj(review) || typeof review.digest !== 'string' || !isObj(review.fields)) {
    return [problem('review', 'this post has no review record — run `release-contract.mjs review <release.json>` and publish from that file')]
  }
  const fields = contractFields(item), digests = fieldDigests(fields)
  const problems = []
  for (const f of CONTRACT_FIELDS) {
    if (review.fields[f] === undefined) problems.push(problem(f, 'not in the review record (it predates this field) — review again'))
    else if (review.fields[f] !== digests[f]) problems.push(problem(f, `now ${describe(fields[f])}, which is not what was reviewed`))
  }
  if (!problems.length && review.digest !== contractDigest(item)) problems.push(problem('review.digest', 'every field matches its record but the digest formula changed since the review — review again'))
  return problems
}

async function sha256Url(url, fetchImpl) {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const h = createHash('sha256')
  for await (const chunk of res.body) h.update(chunk)
  return h.digest('hex')
}

/**
 * The hosted object against the review record: what Meta will fetch, hashed, against what was
 * reviewed. This is the one check a ledger edit cannot pass — video_url, image_url and cover_url
 * can be pointed anywhere, and the record would still agree with itself. Runs in post-reels.mjs
 * before any Graph call, on --dry-run too; it costs one download of the media. A URL that cannot
 * be fetched is a refusal, not a pass: bytes that cannot be checked are not published.
 */
export async function hostedProblems(item, { fetchImpl = globalThis.fetch } = {}) {
  const fields = item?.release?.review?.fields
  if (!isObj(fields)) return [] // compareReview() owns the missing-record case
  const checks = [[item.video_url || item.image_url, 'source.sha256', 'media']]
  if (item.cover_url) checks.push([item.cover_url, 'cover.sha256', 'cover'])
  const problems = []
  for (const [url, field, what] of checks) {
    if (!url) continue
    let sha
    try { sha = await sha256Url(url, fetchImpl) } catch (e) {
      problems.push(problem(field, `could not fetch the hosted ${what} ${url} to check it (${e.message}) — bytes that cannot be checked are not published`)); continue
    }
    if (hash16(sha) !== fields[field]) problems.push(problem(field, `the hosted ${what} ${url} hashes to ${short(sha)}, which is not the reviewed ${what}`))
  }
  return problems
}

/**
 * The publish-time check: the media on disk against the hashes the review recorded (with the
 * clearest message first — which part of a video moved), the caption's mentions, the clock, then
 * the record.
 */
export function verify(release, item, measured, { now = new Date() } = {}) {
  const problems = []
  const declared = release.source || {}
  if (declared.sha256 && declared.sha256 !== measured.sha256) {
    const stream = measured.video_md5 === null ? ''
      : declared.video_md5 === measured.video_md5 ? ' (video stream unchanged: the audio track or the container changed)'
      : ' (video stream changed too)'
    problems.push(problem('source.sha256', `${measured.file} hashes to ${short(measured.sha256)}; the reviewed export hashed to ${short(declared.sha256)} — the media on disk is not the reviewed export${stream}`))
  }
  if (measured.video_md5 !== null && declared.video_md5 && declared.video_md5 !== measured.video_md5) {
    problems.push(problem('source.video_md5', `the video stream hashes to ${measured.video_md5}; the reviewed stream was ${declared.video_md5}`))
  }
  if (release.cover?.sha256 && release.cover.sha256 !== measured.cover_sha256) {
    problems.push(problem('cover.sha256', `${measured.cover_file} hashes to ${short(measured.cover_sha256)}; the reviewed cover hashed to ${short(release.cover.sha256)}`))
  }
  problems.push(...mentionProblems(release), ...lateProblems(release.delivery, now))
  const named = new Set(problems.map((p) => p.field))
  for (const p of compareReview(item)) if (!named.has(p.field)) problems.push(p)
  return problems
}

// ---------------------------------------------------------------------------------------------
// review / check
// ---------------------------------------------------------------------------------------------

function summarize(path, release, item, measured) {
  let handle = null
  try { handle = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts?.[release.account]?.handle ?? null } catch { /* no registry beside this file */ }
  const list = (arr, at = '') => (arr.length ? arr.map((h) => `${at}${isObj(h) ? h.username : h}`).join(', ') : '(none — decided empty)')
  const audio = item.audio_configuration
  const duration = measured.video_md5 ? durationOf(measured.file) : null
  const rows = [
    ['account', `${release.account}${handle ? ` (@${handle})` : ''}`],
    ['media_type', release.media_type],
    ['source', measured.file],
    ['', `sha256 ${measured.sha256}`],
    ...(measured.video_md5 ? [['', `video stream md5 ${measured.video_md5}${duration !== null ? `   duration ${duration.toFixed(2)} s` : ''}`]] : []),
    ['caption', release.caption ? `${describe(release.caption)} (${release.caption.length} chars)` : '(none — a Story)'],
    ['mentions', list(release.mentions, '@')],
    ['user_tags', list(release.user_tags)],
    ['collaborators', list(release.collaborators)],
    ['audio', audio ? `audio_id ${audio.audio_id}${audio.audio_volume !== undefined ? ` · audio ${audio.audio_volume}` : ''}${audio.video_volume !== undefined ? ` · video ${audio.video_volume}` : ''}` : 'none'],
    ['cover', measured.cover_file ? `${measured.cover_file}  sha256 ${measured.cover_sha256}` : 'none'],
    ...(release.alt_text ? [['alt_text', describe(release.alt_text)]] : []),
    ['delivery', release.delivery.immediate ? 'immediate (publishes when post-now runs)' : `${describeDelivery(release.delivery)} = ${item.scheduledAt}`],
    ['review digest', `${release.review.digest}  recorded ${release.review.reviewed_at}`],
  ]
  return [
    `Reviewed release package: ${path}`,
    ...rows.map(([k, v]) => `  ${k.padEnd(15)} ${v}`),
    '',
    'This is what will go out, and nothing else: post-now.mjs --release refuses on any difference.',
    `Publish with: node scripts/social-publish/post-now.mjs --release ${path} --graph-route "<Nino's words>"`,
  ].join('\n')
}

/**
 * Measure the media, check the mentions, record the review in the file. Throws ReleaseError
 * (exit 1) rather than writing a record for a package that is not what it says it is.
 */
export function review(path, { now = new Date(), ffmpeg } = {}) {
  const { release, dir } = loadRelease(path)
  const measured = measure(release, dir, { ffmpeg, path })
  const problems = []
  if (release.source.sha256 && release.source.sha256 !== measured.sha256) problems.push(problem('source.sha256', `the package says ${short(release.source.sha256)} but ${measured.file} hashes to ${short(measured.sha256)} — point source.file at the selected export, or drop the declared hash and let review measure it`))
  if (release.source.video_md5 && measured.video_md5 && release.source.video_md5 !== measured.video_md5) problems.push(problem('source.video_md5', `the package says ${release.source.video_md5} but the video stream hashes to ${measured.video_md5}`))
  if (release.cover?.sha256 && release.cover.sha256 !== measured.cover_sha256) problems.push(problem('cover.sha256', `the package says ${short(release.cover.sha256)} but ${measured.cover_file} hashes to ${short(measured.cover_sha256)}`))
  problems.push(...mentionProblems(release), ...lateProblems(release.delivery, now, 0, { stage: 'review' }))
  if (problems.length) throw new ReleaseError(path, problems, { exitCode: 1, stage: 'review' })
  release.source = { file: release.source.file, sha256: measured.sha256, video_md5: measured.video_md5 }
  if (release.cover) release.cover = { file: release.cover.file, sha256: measured.cover_sha256 }
  delete release.review
  const item = releaseItem(release, measured, { now, path })
  release.review = reviewOf(item, now)
  item.release.review = release.review
  writeFileSync(path, `${JSON.stringify(release, null, 2)}\n`)
  return { release, item, measured, summary: summarize(path, release, item, measured) }
}

/** What post-now --release would decide for this package right now, without touching anything. */
export function check(path, { now = new Date(), ffmpeg } = {}) {
  let release, dir, measured
  try { ({ release, dir } = loadRelease(path)); measured = measure(release, dir, { ffmpeg, path }) } catch (e) {
    if (e instanceof ReleaseError) return { ok: false, problems: e.problems, item: null, measured: null }
    throw e
  }
  const item = releaseItem(release, measured, { now, path })
  const problems = verify(release, item, measured, { now })
  return { ok: !problems.length, problems, item, measured }
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function invokedDirectly() {
  if (!process.argv[1]) return false
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (invokedDirectly()) {
  const [cmd, given] = process.argv.slice(2)
  if (!['review', 'check'].includes(cmd) || !given) {
    console.error('Usage: node scripts/social-publish/release-contract.mjs review|check <release.json>')
    process.exit(1)
  }
  const path = resolve(given)
  try {
    if (cmd === 'review') {
      console.log(review(path).summary)
    } else {
      const { ok, problems, item } = check(path)
      if (!ok) { console.error(refusalText(path, problems)); process.exit(REFUSED_RELEASE) }
      console.log(`ok — ${path} matches its review record (digest ${item.release.review.digest}); delivery: ${describeDelivery(item.release.delivery)}`)
    }
  } catch (e) {
    console.error(e instanceof ReleaseError ? e.message : `${cmd} failed: ${e.message}`)
    process.exit(e instanceof ReleaseError ? e.exitCode : 1)
  }
}
