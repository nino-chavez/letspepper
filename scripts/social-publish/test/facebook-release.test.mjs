/**
 * Facebook Page destination for a reviewed release.json. Run: pnpm test:social
 *
 * WHY (2026-11-27): the Atlanta Reckoning off-the-court Reel went to Instagram through
 * `post-now.mjs --release`, and its Facebook half was held. The 630 token carried no
 * `pages_manage_posts`, and the release contract itself refused any Facebook destination: an
 * unknown key, and a publisher with no Page path. The fix under test binds the Page as a
 * reviewed destination with its own caption, and publishes it through Meta's Reels Publishing
 * API (start → hosted upload → finish) or, for a feed image, `POST /{page-id}/photos`.
 *
 * What the tests hold the change to:
 *   - an Instagram-only package reviews to exactly the record it did before, so no existing
 *     review record, ledger item, route receipt or saved container changes meaning;
 *   - every Facebook decision is explicit: its caption is its own (never the Instagram one), a
 *     Facebook-only package carries no Instagram content that would not go out, and the Reel's
 *     length and shape are checked against Meta's Reels spec at review;
 *   - the Page publish uses the Page credential, never the Instagram one, and both credentials
 *     are present before the first side effect;
 *   - a saved Facebook video is never uploaded twice, and a draft stays a draft;
 *   - a mistyped flag (`--facebok-draft`) is refused instead of silently publishing.
 *
 * Planted failures: the tests marked PLANTED were run against the publisher before this change
 * (origin/main e0e311e). The run is recorded on the PR that added this file.
 *
 * No network: GRAPH_BASE points at a local stub that also plays R2 and rupload, the tokens are
 * fixed non-credential strings, and nothing here reads 1Password or the repo's live queue/.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestOf } from '../route-gate.mjs'
import * as contract from '../release-contract.mjs'
import { PUBLISHER_FILES, TOOL_LIB_FILES } from './publisher-files.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')
const REPO = join(SOCIAL, '..', '..')
const EVENT = 'adhoc'
const REASON = 'Nino asked for the API on this one'
const REFUSED_RELEASE = 4
const PAGE = '569987303404898' // 630 Volleyball, accounts.json 630.page_id
const IG = '17841411569230130'
const IG_TOKEN = 'ig-test-token-not-a-credential'
const FB_TOKEN = 'fb-test-token-not-a-credential'
const PAGE_TOKEN = 'derived-page-token-not-a-credential'
const CAPTION = 'Three days, thirteen boys teams. @nick_maruyama'
const FB_CAPTION = 'Three days, thirteen boys teams, and the rest of the trip.'

// The twelve fields the review record bound before Facebook existed (release-contract.mjs, e0e311e).
const PRE_FACEBOOK_FIELDS = ['account', 'media_type', 'source.sha256', 'source.video_md5', 'cover.sha256', 'caption', 'mentions', 'user_tags', 'collaborators', 'audio_configuration', 'alt_text', 'delivery']

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const ffmpegPresent = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const igRelease = (dir, overrides = {}) => ({
  account: '630',
  media_type: 'IMAGE',
  source: { file: join(dir, 'export.jpg') },
  caption: CAPTION,
  mentions: ['nick_maruyama'],
  user_tags: ['nick_maruyama'],
  collaborators: [],
  audio_configuration: null,
  delivery: { immediate: true },
  ...overrides,
})
const crosspost = (dir, overrides = {}) => igRelease(dir, { destinations: ['instagram', 'facebook'], facebook: { caption: FB_CAPTION }, ...overrides })
// Facebook only: the Instagram half already went out (the 2026-11-27 case), so nothing Instagram-only is in the package.
const facebookOnly = (dir, overrides = {}) => ({
  account: '630', media_type: 'IMAGE', source: { file: join(dir, 'export.jpg') },
  caption: '', mentions: [], user_tags: [], collaborators: [], audio_configuration: null, cover: null,
  destinations: ['facebook'], facebook: { caption: FB_CAPTION },
  delivery: { immediate: true },
  ...overrides,
})

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'fb-release-'))
  writeFileSync(join(dir, 'export.jpg'), Buffer.from('selected export bytes'))
  return dir
}
const writeRelease = (dir, release) => { const p = join(dir, 'release.json'); writeFileSync(p, JSON.stringify(release, null, 2)); return p }

// A video Meta's Reels spec accepts (3.2 s, 540×960, 24 fps), and one it does not (1 s, 64×64).
const genVideo = (out, { size = '540x960', rate = 24, duration = 3.2 } = {}) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y',
  '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=${size}:rate=${rate}`, '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
  '-c:v', 'mpeg4', '-q:v', '8', '-c:a', 'aac', '-shortest', out], { stdio: ['ignore', 'ignore', 'inherit'] })

// The publisher scripts in a throwaway root (same shape as release-contract.test.mjs's sandbox).
function sandbox({ queue = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fb-release-gate-'))
  const social = join(root, 'scripts', 'social-publish')
  mkdirSync(join(social, 'queue'), { recursive: true })
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true })
  for (const f of PUBLISHER_FILES) if (existsSync(join(SOCIAL, f))) cpSync(join(SOCIAL, f), join(social, f))
  for (const f of TOOL_LIB_FILES) cpSync(join(REPO, 'tools', 'lib', f), join(root, 'tools', 'lib', f))
  cpSync(join(REPO, 'reader-contract.json'), join(root, 'reader-contract.json'))
  writeFileSync(join(social, 'graph-routes.json'), JSON.stringify({ events: {} }, null, 2))
  if (queue) writeFileSync(join(social, 'queue', `${queue.event}.json`), JSON.stringify(queue, null, 2))
  writeFileSync(join(social, 'upload-r2.mjs'), `
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
const args = Object.fromEntries(process.argv.slice(2).reduce((a, t, i, arr) => { if (t.startsWith('--')) { const n = arr[i + 1]; a.push([t.slice(2), n === undefined || n.startsWith('--') ? true : n]) } return a }, []))
const path = join(dirname(fileURLToPath(import.meta.url)), 'queue', args.event + '.json')
const q = JSON.parse(readFileSync(path, 'utf8'))
for (const it of q.items) {
  if (it.file && !it.video_url && !it.image_url) it[/\\.(mp4|mov)$/i.test(it.file) ? 'video_url' : 'image_url'] = args['public-base'] + '/' + args.prefix + '/' + basename(it.file)
  if (it.cover_file && !it.cover_url) it.cover_url = args['public-base'] + '/' + args.prefix + '/' + basename(it.cover_file)
}
writeFileSync(path, JSON.stringify(q, null, 2))
`)
  return { root, social, queuePath: (e = EVENT) => join(social, 'queue', `${e}.json`), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

// Plays Graph (Instagram and the Page), R2 (GET /media/<name>) and rupload (POST /rupload/...).
// GET /{video-id}?fields=status reports `publishStatus` until a finish arrives, then what that
// finish asked for (published, or draft); `pageLookup` says whether the Page token exchange
// returns a derived token.
async function graphStub({ mediaDir = null, publishStatus = 'not_started', pageLookup = true, statusFails = false } = {}) {
  const seen = []; const calls = []
  let finished = null
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://stub')
    seen.push(`${req.method} ${url.pathname}`)
    const send = (code, json) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)) }
    if (req.method === 'GET' && url.pathname.startsWith('/media/')) {
      const file = mediaDir && join(mediaDir, url.pathname.split('/').pop())
      if (!file || !existsSync(file)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(readFileSync(file))
    }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const params = req.method === 'GET' ? Object.fromEntries(url.searchParams) : Object.fromEntries(new URLSearchParams(body))
      calls.push({ method: req.method, path: url.pathname, params, headers: { authorization: req.headers.authorization || null, file_url: req.headers.file_url || null } })
      const p = url.pathname
      if (p.startsWith('/rupload/')) return send(200, { success: true })
      if (req.method === 'GET' && p === `/${PAGE}`) return send(200, pageLookup ? { access_token: PAGE_TOKEN, id: PAGE } : { id: PAGE })
      if (p === `/${PAGE}/video_reels` && params.upload_phase === 'start') return send(200, { video_id: 'fbvid-1', upload_url: `http://${req.headers.host}/rupload/video-upload/fbvid-1` })
      if (p === `/${PAGE}/video_reels` && params.upload_phase === 'finish') { finished = params.video_state; return send(200, { success: true }) }
      if (req.method === 'GET' && p === '/fbvid-1') {
        if (statusFails) return send(500, { error: { message: 'An unexpected error has occurred. Please retry your request later.', code: 2 } })
        const state = finished ? (finished === 'DRAFT' ? 'draft' : 'published') : publishStatus
        return send(200, { id: 'fbvid-1', status: { video_status: 'ready', uploading_phase: { status: 'complete' }, processing_phase: { status: 'complete' }, publishing_phase: { status: state === 'not_started' ? 'not_started' : 'complete', publish_status: state } } })
      }
      if (p === `/${PAGE}/photos`) return send(200, { id: 'fbphoto-1', post_id: `${PAGE}_111` })
      if (p.endsWith('/media_publish')) return send(200, { id: 'stub-media-1' })
      if (req.method === 'GET') return send(200, { status_code: 'FINISHED' })
      return send(200, { id: `stub-container-${calls.length}` })
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return { seen, calls, base, close: () => new Promise((r) => server.close(r)) }
}

function run(script, args, { cwd, base, igToken = IG_TOKEN, fbToken = FB_TOKEN, path = null }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GRAPH_BASE: base }
    if (igToken) env.IG_ACCESS_TOKEN = igToken; else delete env.IG_ACCESS_TOKEN
    if (fbToken) env.FB_ACCESS_TOKEN = fbToken; else delete env.FB_ACCESS_TOKEN
    if (path) env.PATH = path
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout: ${script}\n${out}\n${err}`)) }, 60_000)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

async function reviewed(sb, dir, release) {
  const path = writeRelease(dir, release)
  const r = await run(join(sb.social, 'release-contract.mjs'), ['review', path], { cwd: sb.root, base: 'http://127.0.0.1:9' })
  assert.equal(r.code, 0, `review failed:\n${r.out}\n${r.err}`)
  return { path, out: r.out }
}
const postNow = (sb, graph, path, extra = [], opts = {}) => run(join(sb.social, 'post-now.mjs'), ['--release', path, '--graph-route', REASON, '--public-base', `${graph.base}/media`, ...extra], { cwd: sb.root, base: graph.base, ...opts })
const postReels = (sb, graph, id, extra = [], opts = {}) => run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--id', id, '--graph-route', REASON, ...extra], { cwd: sb.root, base: graph.base, ...opts })
const igCalls = (graph) => graph.calls.filter((c) => c.path.startsWith(`/${IG}/`))
const pageCalls = (graph) => graph.calls.filter((c) => c.path.startsWith(`/${PAGE}/`) || c.path.startsWith('/rupload/') || c.path === '/fbvid-1')

// ---------------------------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------------------------

test('an Instagram-only package reviews to exactly the record it did before Facebook existed', () => {
  // Not planted: this passes before and after the change, and fails if the Facebook fields are
  // added to every record — which would make every existing review record and queued item read
  // as "predates this field".
  const dir = fixtureDir()
  try {
    const path = writeRelease(dir, igRelease(dir))
    const { release, item } = contract.review(path, { now: new Date('2026-11-27T14:00:00Z') })
    assert.deepEqual(Object.keys(release.review.fields), PRE_FACEBOOK_FIELDS)
    assert.equal(release.review.digest, contract.contractDigest(item))
    assert.equal('channels' in item, false, 'an Instagram-only item has no channels key, as before')
    assert.equal('facebook_status' in item, false)
    // A ledger item reviewed before this change (twelve fields) still matches its record.
    assert.deepEqual(contract.compareReview(item), [])
    // An explicit Instagram-only destination list reviews to the same record.
    const explicit = writeRelease(dir, igRelease(dir, { destinations: ['instagram'] }))
    const again = contract.review(explicit, { now: new Date('2026-11-27T14:00:00Z') })
    assert.deepEqual(again.release.review.fields, release.review.fields)
    assert.equal(again.release.review.digest, release.review.digest)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED validateRelease: a Facebook destination is a reviewed decision, every part of it explicit', () => {
  const dir = fixtureDir()
  try {
    assert.deepEqual(contract.validateRelease(crosspost(dir)), [], 'a crosspost with its own Page caption is well formed')
    assert.deepEqual(contract.validateRelease(facebookOnly(dir)), [], 'a Facebook-only package is well formed')
    const names = (r) => contract.validateRelease(r).map((p) => p.split(':')[0])
    assert.ok(names(crosspost(dir, { destinations: ['instagram', 'threads'] })).includes('destinations'))
    assert.ok(names(crosspost(dir, { destinations: [] })).includes('destinations'), 'no destination is not a decision')
    assert.ok(names(crosspost(dir, { destinations: ['facebook', 'facebook'] })).includes('destinations'))
    assert.ok(names(crosspost(dir, { facebook: undefined })).includes('facebook'), 'a Page destination needs its own copy')
    assert.ok(names(igRelease(dir, { facebook: { caption: FB_CAPTION } })).includes('facebook'), 'Page copy with no Page destination would be dropped')
    assert.ok(names(crosspost(dir, { facebook: {} })).includes('facebook.caption'), 'the Page caption is never borrowed from Instagram')
    assert.ok(names(crosspost(dir, { facebook: { caption: 42 } })).includes('facebook.caption'))
    assert.ok(names(crosspost(dir, { facebook: { caption: FB_CAPTION, cover: 'c.jpg' } })).includes('facebook.cover'), 'unknown keys are named, never dropped')
    assert.ok(names(crosspost(dir, { facebook: { caption: FB_CAPTION, title: 'T' } })).includes('facebook.title'), 'a title applies to a Page Reel only')
    assert.ok(names(crosspost(dir, { media_type: 'STORIES', caption: '', mentions: [], collaborators: [] })).includes('destinations'), 'no Page Stories through this publisher')
    assert.ok(names(crosspost(dir, { audio_configuration: { audio_id: '123' }, media_type: 'REELS', source: { file: join(dir, 'export.mp4') } })).includes('audio_configuration'), 'Instagram catalog music cannot cross to the Page')
    // Facebook only: nothing Instagram-only may sit in the package, because none of it goes out.
    for (const [field, value] of [['caption', 'an Instagram caption'], ['mentions', ['nick_maruyama']], ['user_tags', ['nick_maruyama']], ['collaborators', ['nick_maruyama']], ['alt_text', 'alt']]) {
      assert.ok(names(facebookOnly(dir, { [field]: value })).includes(field), `${field} on a Facebook-only package`)
    }
    assert.ok(names(facebookOnly(dir, { media_type: 'REELS', source: { file: join(dir, 'export.mp4') }, cover: { file: 'c.jpg' } })).includes('cover'))
    // A package with no destinations key is the Instagram-only package it always was.
    assert.deepEqual(contract.validateRelease(igRelease(dir)), [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED review of a crosspost: the record binds the Page destination and its copy, and drift in either is named', () => {
  const dir = fixtureDir()
  try {
    const path = writeRelease(dir, crosspost(dir, { facebook: { caption: FB_CAPTION, alt_text: 'Boys teams on court' } }))
    const { release, item, summary } = contract.review(path)
    assert.deepEqual(Object.keys(release.review.fields), [...PRE_FACEBOOK_FIELDS, 'destinations', 'facebook'])
    assert.deepEqual(item.channels, ['instagram', 'facebook'])
    assert.equal(item.facebook_caption, FB_CAPTION, 'the Page caption is its own')
    assert.equal(item.caption, CAPTION)
    assert.equal(item.facebook_alt_text, 'Boys teams on court')
    assert.equal(item.facebook_status, 'pending')
    // The printout Nino approves says where it goes and what does not cross.
    assert.match(summary, /destinations\s+instagram \+ facebook/)
    assert.match(summary, new RegExp(`facebook page\\s+${PAGE}`))
    assert.match(summary, /facebook caption\s+"Three days, thirteen boys teams, and the rest of the trip\."/)
    assert.match(summary, /not on facebook\s+user_tags, mentions \(Instagram only/)
    assert.deepEqual(contract.check(path).problems, [])
    const frozen = readJson(path)
    const fieldsOf = (edit) => { const r = structuredClone(frozen); edit(r); writeFileSync(path, JSON.stringify(r, null, 2)); return contract.check(path).problems.map((p) => p.field) }
    assert.ok(fieldsOf((r) => { r.facebook.caption = 'Another Page caption.' }).includes('facebook'))
    assert.ok(fieldsOf((r) => { r.destinations = ['facebook']; r.caption = ''; r.mentions = []; r.user_tags = [] }).includes('destinations'))
    writeFileSync(path, JSON.stringify(frozen, null, 2))
    // A ledger edit that drops the Page, or adds it to an Instagram-only item, is refused too.
    assert.ok(contract.compareReview({ ...item, channels: undefined, facebook_caption: undefined }).some((p) => p.field === 'destinations'))
    const igOnly = contract.review(writeRelease(dir, igRelease(dir))).item
    const added = contract.compareReview({ ...igOnly, channels: ['instagram', 'facebook'], facebook_caption: FB_CAPTION })
    assert.ok(added.some((p) => p.field === 'destinations'), JSON.stringify(added))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED review: a Page Reel outside Meta\'s Reels spec is refused before anything is recorded', { skip: !ffmpegPresent && 'ffmpeg/ffprobe not installed' }, () => {
  const dir = fixtureDir()
  try {
    const tiny = join(dir, 'tiny.mp4'); genVideo(tiny, { size: '64x64', rate: 10, duration: 1 })
    const path = writeRelease(dir, facebookOnly(dir, { media_type: 'REELS', source: { file: tiny }, facebook: { caption: FB_CAPTION, title: null } }))
    assert.throws(() => contract.review(path), (e) => /source\.file: .*1\.0\d? s.*3 to 90 s/.test(e.message) && /9:16/.test(e.message) && /540×960/.test(e.message) && /24 to 60 fps/.test(e.message))
    assert.equal(readJson(path).review, undefined, 'no record on refusal')
    // The same file to Instagram only is not held to the Page spec.
    contract.review(writeRelease(dir, igRelease(dir, { media_type: 'REELS', source: { file: tiny }, mentions: [], caption: 'x', user_tags: [] })))
    // A file inside the spec reviews, and the printout shows what was measured.
    const ok = join(dir, 'reel.mp4'); genVideo(ok)
    const { summary } = contract.review(writeRelease(dir, facebookOnly(dir, { media_type: 'REELS', source: { file: ok }, facebook: { caption: FB_CAPTION, title: 'Off the court' } })))
    assert.match(summary, /facebook reel\s+3\.2\d? s · 540×960 · 24 fps — inside Meta's Reels spec/)
    assert.match(summary, /facebook cover\s+none sent/)
    assert.match(summary, /destinations\s+facebook only/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------------------------
// The publisher
// ---------------------------------------------------------------------------------------------

test('PLANTED post-now --release crosspost image: Instagram with the Instagram copy, the Page with its own copy and the Page token', async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    const { path } = await reviewed(sb, dir, crosspost(dir, { facebook: { caption: FB_CAPTION, alt_text: 'Boys teams on court' } }))
    const r = await postNow(sb, graph, path)
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    const item = readJson(sb.queuePath()).items[0]
    assert.equal(item.status, 'posted')
    assert.equal(item.facebook_status, 'posted')
    assert.equal(item.facebook_post_id, `${PAGE}_111`)
    const ig = igCalls(graph)
    assert.equal(ig.find((c) => c.path.endsWith('/media')).params.caption, CAPTION)
    assert.ok(ig.every((c) => c.params.access_token === IG_TOKEN), 'Instagram calls use the Instagram token')
    const photo = graph.calls.find((c) => c.path === `/${PAGE}/photos`)
    assert.ok(photo, `no Page photo call:\n${graph.seen.join('\n')}`)
    assert.equal(photo.params.message, FB_CAPTION, 'the Page caption is the reviewed Page caption')
    assert.equal(photo.params.alt_text_custom, 'Boys teams on court')
    assert.equal(photo.params.published, 'true')
    assert.equal(photo.params.access_token, PAGE_TOKEN, 'the Page call uses the Page token derived from FB_ACCESS_TOKEN')
    assert.ok(!graph.calls.some((c) => c.path.startsWith(`/${PAGE}`) && c.params.access_token === IG_TOKEN), 'the Instagram token never reaches the Page')
    assert.equal(item.route.digest, digestOf(item, undefined, EVENT), 'the route receipt is bound to the item with its Page copy')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED post-now --release Facebook-only Reel: start, hosted upload, finish PUBLISHED — and no Instagram call', { skip: !ffmpegPresent && 'ffmpeg/ffprobe not installed' }, async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    genVideo(join(dir, 'reel.mp4'))
    const { path } = await reviewed(sb, dir, facebookOnly(dir, { media_type: 'REELS', source: { file: join(dir, 'reel.mp4') }, facebook: { caption: FB_CAPTION, title: 'Off the court' } }))
    const r = await postNow(sb, graph, path, [], { igToken: null })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.deepEqual(igCalls(graph), [], 'nothing went to Instagram')
    const fb = pageCalls(graph)
    const start = fb.find((c) => c.params.upload_phase === 'start')
    const upload = fb.find((c) => c.path.startsWith('/rupload/'))
    const finish = fb.find((c) => c.params.upload_phase === 'finish')
    assert.ok(start && upload && finish, graph.seen.join('\n'))
    assert.ok(fb.indexOf(start) < fb.indexOf(upload) && fb.indexOf(upload) < fb.indexOf(finish), 'start → upload → finish')
    assert.equal(upload.headers.authorization, `OAuth ${PAGE_TOKEN}`)
    assert.match(upload.headers.file_url, /\/media\/adhoc\/630\/adhoc-\d+\/reel\.mp4$/, 'Meta fetches the hosted, hash-checked copy')
    assert.equal(finish.params.video_id, 'fbvid-1')
    assert.equal(finish.params.video_state, 'PUBLISHED')
    assert.equal(finish.params.description, FB_CAPTION)
    assert.equal(finish.params.title, 'Off the court')
    const item = readJson(sb.queuePath()).items[0]
    assert.equal(item.facebook_status, 'posted')
    assert.equal(item.facebook_video_id, 'fbvid-1')
    assert.equal(item.status, 'not_requested', 'the Instagram leg records that it was not part of this package')
    assert.ok(graph.seen.some((s) => s.startsWith('GET /media/')), 'the hosted bytes were checked first')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED --facebook-draft: a Facebook-only Reel finishes as DRAFT, stays a draft, and the flag is refused where it cannot mean that', { skip: !ffmpegPresent && 'ffmpeg/ffprobe not installed' }, async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    genVideo(join(dir, 'reel.mp4'))
    const { path } = await reviewed(sb, dir, facebookOnly(dir, { media_type: 'REELS', source: { file: join(dir, 'reel.mp4') }, facebook: { caption: FB_CAPTION, title: null } }))
    const r = await postNow(sb, graph, path, ['--facebook-draft'], { igToken: null })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    const finish = graph.calls.find((c) => c.params.upload_phase === 'finish')
    assert.equal(finish.params.video_state, 'DRAFT')
    const item = readJson(sb.queuePath()).items[0]
    assert.equal(item.facebook_status, 'draft')
    assert.match(r.out, /draft/i)
    // A draft is terminal for its item: a later run publishes nothing.
    const before = graph.calls.length
    const again = await postReels(sb, graph, item.id, [], { igToken: null })
    assert.notEqual(again.code, 0)
    assert.equal(graph.calls.length, before, 'nothing sent for an item that is already a draft')
    // Where a draft cannot mean "nothing goes live", the flag is refused before any side effect.
    const sb2 = sandbox(); const graph2 = await graphStub({ mediaDir: dir })
    try {
      const dir2 = fixtureDir()
      const cross = (await reviewed(sb2, dir2, crosspost(dir2))).path
      const refused = await postNow(sb2, graph2, cross, ['--facebook-draft'])
      assert.equal(refused.code, 1, refused.err)
      assert.match(refused.err, /--facebook-draft/)
      assert.equal(existsSync(sb2.queuePath()), false)
      assert.deepEqual(graph2.seen, [])
      rmSync(dir2, { recursive: true, force: true })
    } finally { await graph2.close(); sb2.cleanup() }
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED a mistyped flag is refused, not ignored: --facebok-draft would otherwise publish', async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    const { path } = await reviewed(sb, dir, igRelease(dir))
    const r = await postNow(sb, graph, path, ['--facebok-draft'])
    assert.equal(r.code, 1, `${r.out}\n${r.err}`)
    assert.match(r.err, /--facebok-draft/)
    assert.equal(existsSync(sb.queuePath()), false, 'nothing queued')
    assert.deepEqual(graph.seen, [], 'nothing sent')
    // post-reels too.
    const item = { ...contract.check(path).item, id: 'adhoc-typo', image_url: `${graph.base}/media/adhoc/630/adhoc-typo/export.jpg` }
    writeFileSync(sb.queuePath(), JSON.stringify({ event: EVENT, items: [item] }, null, 2))
    const pr = await postReels(sb, graph, item.id, ['--prepare-onyl'])
    assert.equal(pr.code, 1, `${pr.out}\n${pr.err}`)
    assert.match(pr.err, /--prepare-onyl/)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED both credentials before the first side effect: a crosspost with no Page credential queues and sends nothing', async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    const { path } = await reviewed(sb, dir, crosspost(dir))
    // No FB_ACCESS_TOKEN, and `op` unreachable: PATH is a folder holding only links to node and git
    // (queue-dir.mjs asks git where the ledger lives), so the 1Password read fails without ever
    // reaching a real vault — node's own folder may hold `op` (Homebrew puts both in one).
    const bin = join(sb.root, 'bin'); mkdirSync(bin)
    symlinkSync(process.execPath, join(bin, 'node'))
    symlinkSync(execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim(), join(bin, 'git'))
    const r = await postNow(sb, graph, path, [], { fbToken: null, path: bin })
    assert.equal(r.code, 1, `${r.out}\n${r.err}`)
    assert.match(r.err, /Facebook Page credential/)
    assert.match(r.err, /Meta 630 Page Publisher/, 'names the 1Password item to fix')
    assert.equal(existsSync(sb.queuePath()), false, 'nothing queued')
    assert.deepEqual(graph.seen, [], 'Instagram did not go out ahead of a Page publish that could not')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED a saved Facebook video is never uploaded twice: a re-run reads its status first', { skip: !ffmpegPresent && 'ffmpeg/ffprobe not installed' }, async () => {
  const dir = fixtureDir()
  genVideo(join(dir, 'reel.mp4'))
  try {
    const path = writeRelease(dir, facebookOnly(dir, { media_type: 'REELS', source: { file: join(dir, 'reel.mp4') }, facebook: { caption: FB_CAPTION, title: null } }))
    contract.review(path)
    const base = (graph) => ({ ...contract.check(path).item, id: 'adhoc-resume', video_url: `${graph.base}/media/adhoc/630/adhoc-resume/reel.mp4`, facebook_video_id: 'fbvid-1', facebook_uploaded: true, facebook_status: 'error', facebook_finish_sent_at: '2026-11-27T15:00:00.000Z' })
    // The finish landed before the last run lost its response: marked posted, nothing re-sent.
    {
      const graph = await graphStub({ mediaDir: dir, publishStatus: 'published' })
      const sb = sandbox({ queue: { event: EVENT, items: [base(graph)] } })
      try {
        const r = await postReels(sb, graph, 'adhoc-resume', [], { igToken: null })
        assert.equal(r.code, 0, `${r.out}\n${r.err}`)
        assert.equal(graph.calls.filter((c) => c.path === `/${PAGE}/video_reels`).length, 0, 'no second start or finish')
        assert.equal(graph.calls.filter((c) => c.path.startsWith('/rupload/')).length, 0, 'no second upload')
        assert.equal(readJson(sb.queuePath()).items[0].facebook_status, 'posted')
      } finally { await graph.close(); sb.cleanup() }
    }
    // The status cannot be read: held, and still no new video.
    {
      const graph = await graphStub({ mediaDir: dir, statusFails: true })
      const sb = sandbox({ queue: { event: EVENT, items: [base(graph)] } })
      try {
        const r = await postReels(sb, graph, 'adhoc-resume', [], { igToken: null })
        assert.notEqual(r.code, 0)
        assert.match(r.err, /HELD/)
        assert.equal(graph.calls.filter((c) => c.path === `/${PAGE}/video_reels`).length, 0)
        assert.equal(readJson(sb.queuePath()).items[0].facebook_video_id, 'fbvid-1', 'the saved video is kept')
      } finally { await graph.close(); sb.cleanup() }
    }
    // Uploaded but never finished: the same video is finished, not started again.
    {
      const graph = await graphStub({ mediaDir: dir, publishStatus: 'not_started' })
      const item = { ...base(graph) }; delete item.facebook_finish_sent_at
      const sb = sandbox({ queue: { event: EVENT, items: [item] } })
      try {
        await postReels(sb, graph, 'adhoc-resume', [], { igToken: null })
        assert.equal(graph.calls.filter((c) => c.params.upload_phase === 'start').length, 0)
        assert.equal(graph.calls.filter((c) => c.params.upload_phase === 'finish' && c.params.video_id === 'fbvid-1').length, 1)
      } finally { await graph.close(); sb.cleanup() }
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('a finish Meta refused outright is sent again on the same video after the fix; one whose answer was lost is not', async () => {
  // Post-commit review of b17d182: a finish refused with a permission error left the "finish sent"
  // mark, so every later run only waited on a video that would never publish.
  const { publishPageReel } = await import('../facebook-page.mjs')
  const refusal = Object.assign(new Error('(#200) requires pages_manage_posts'), { http: 403, code: 200 })
  const lost = Object.assign(new Error('fetch failed'), {})
  const runWith = async (finishError) => {
    const item = { facebook_video_id: 'v1', facebook_uploaded: true, video_url: 'https://r2.test/reel.mp4', facebook_caption: 'c' }
    let finishes = 0; let published = false
    const api = async (path, params) => {
      if (path === 'v1') return { status: { video_status: 'ready', uploading_phase: { status: 'complete' }, processing_phase: { status: 'complete' }, publishing_phase: { status: published ? 'complete' : 'not_started', publish_status: published ? 'published' : 'not_started' } } }
      if (params.upload_phase === 'finish') {
        finishes++
        if (finishes === 1) { if (finishError instanceof Error) throw finishError; return finishError }
        published = true; return { success: true }
      }
      throw new Error(`unexpected ${path}`)
    }
    const args = { api, upload: async () => ({ success: true }), sleep: async () => {}, token: 't', pageId: 'p', item, save: () => {}, poll: { attempts: 2, intervalMs: 0 } }
    const first = await publishPageReel(args).catch((e) => ({ ok: false, threw: e }))
    assert.equal(first.ok, false)
    const second = await publishPageReel(args)
    return { item, finishes, second }
  }
  const refused = await runWith(refusal)
  assert.equal(refused.finishes, 2, 'the refused finish is sent again on the same video')
  assert.equal(refused.second.ok, true)
  // Review of dc8d294: Meta answering 200 without success is a definite answer too.
  const notAccepted = await runWith({ success: false })
  assert.equal(notAccepted.finishes, 2, 'a finish Meta answered without success is sent again on the same video')
  assert.equal(notAccepted.second.ok, true)
  const unknown = await runWith(lost)
  assert.equal(unknown.finishes, 1, 'a finish whose answer was lost is never sent twice')
  assert.equal(unknown.second.ok, false)
  assert.ok(unknown.item.facebook_finish_sent_at)
})

test('an account with no Page credential in accounts.json cannot carry a Facebook destination', () => {
  const dir = fixtureDir()
  try {
    const path = writeRelease(dir, crosspost(dir, { account: 'letspepper' }))
    assert.throws(() => contract.review(path), /facebook: .*letspepper.*fb_token_ref/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
