/**
 * Release contract tests. Run: pnpm test:social
 *
 * WHY (2026-10-18): the TPS day-one Reel went out with four release mistakes in one post —
 * rendered from a 41.3 s derivative instead of the selected 53.87 s export, an older caption
 * instead of the selected one, the two people tags missing, and published at once when
 * Sunday 7am CT was wanted. Every check that ran passed, because each compared a file
 * against itself or against whichever file it was handed. The route gate's digest names
 * media by hosted URL (unset at review time) and never hashed the delivery time.
 *
 * The fix under test: one frozen release.json per post, digested at review time, and a
 * publisher that recomputes the digest from the current item and the media bytes on disk
 * and refuses on mismatch, naming the field.
 *
 * Planted failures: the tests marked PLANTED were run against the unmodified gate first.
 * Against it, the digest tests fail because digestOf() cannot see media bytes or delivery,
 * the post-reels test fails because the publisher sends a mismatched release-bound item to
 * the Graph stub, and the post-now tests fail because --release does not exist. The run is
 * recorded in the PR that introduced this file.
 *
 * No network: GRAPH_BASE points at a local stub, upload-r2.mjs is replaced by a fake that
 * writes URLs into the sandbox queue, the token is a fixed non-credential string, and
 * nothing here reads or writes the repo's live queue/. ffmpeg-dependent cases skip when
 * ffmpeg is absent; everything else uses image fixtures.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digestOf, makeReceipt, hasReceipt } from '../route-gate.mjs'
import { PUBLISHER_FILES, TOOL_LIB_FILES } from './publisher-files.mjs'

// Imported dynamically so that, against a checkout without the module, each test below fails
// on its own line instead of the whole file failing at import.
const contract = await import('../release-contract.mjs').catch((e) => ({ missing: e.message }))
const need = (name) => {
  assert.equal(contract.missing, undefined, `release-contract.mjs is missing: ${contract.missing}`)
  assert.equal(typeof contract[name], 'function', `release-contract.mjs does not export ${name}()`)
  return contract[name]
}

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')
const REPO = join(SOCIAL, '..', '..')
const EVENT = 'adhoc'
const REASON = 'Nino asked for the API on this one'
const REFUSED_RELEASE = 4
const CAPTION = 'Day one is in the books. Three teams went undefeated. @nick_maruyama @chellechavez_'

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const ffmpegPresent = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true } catch { return false } })()

// A reviewed Reel's release.json, as the agent would author it before `review` fills the hashes.
const releaseFor = (dir, overrides = {}) => ({
  account: '630',
  media_type: 'IMAGE',
  source: { file: join(dir, 'export.jpg') },
  caption: CAPTION,
  mentions: ['nick_maruyama', 'chellechavez_'],
  user_tags: ['nick_maruyama', 'chellechavez_'],
  collaborators: [],
  audio_configuration: null,
  delivery: { immediate: true },
  ...overrides,
})

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'release-'))
  writeFileSync(join(dir, 'export.jpg'), Buffer.from('selected export bytes'))
  return dir
}
const writeRelease = (dir, release) => { const p = join(dir, 'release.json'); writeFileSync(p, JSON.stringify(release, null, 2)); return p }
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// The publisher scripts, copied into a throwaway root so every path they resolve lands in the
// sandbox. upload-r2.mjs is replaced by a fake: it writes a hosted URL onto every unhosted
// item so post-now's chain can reach post-reels without wrangler.
function sandbox({ routes = { events: {} }, queue = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'release-gate-'))
  const social = join(root, 'scripts', 'social-publish')
  mkdirSync(join(social, 'queue'), { recursive: true })
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true })
  // Against a checkout without release-contract.mjs (the planted-failure run) the copy is skipped, so
  // post-now and post-reels still run there and fail on the assertion, not on a missing fixture.
  for (const f of PUBLISHER_FILES) if (existsSync(join(SOCIAL, f))) cpSync(join(SOCIAL, f), join(social, f))
  for (const f of TOOL_LIB_FILES) cpSync(join(REPO, 'tools', 'lib', f), join(root, 'tools', 'lib', f))
  cpSync(join(REPO, 'reader-contract.json'), join(root, 'reader-contract.json'))
  writeFileSync(join(social, 'graph-routes.json'), JSON.stringify(routes, null, 2))
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

// Also plays R2: a GET under /media/ serves the file of that basename from `mediaDir`, so the
// hosted-bytes check in post-reels has real bytes to hash (and a 404 to refuse on, for a name it lacks).
async function graphStub({ mediaDir = null } = {}) {
  const seen = []; const payloads = []
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split('?')[0]}`)
    if (req.method === 'GET' && req.url.startsWith('/media/')) {
      const file = mediaDir && join(mediaDir, req.url.split('/').pop())
      if (!file || !existsSync(file)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(readFileSync(file))
    }
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      payloads.push({ path: req.url.split('?')[0], params: Object.fromEntries(new URLSearchParams(body)) })
      const json = req.url.includes('media_publish') ? { id: 'stub-media-1' }
        : req.method === 'GET' ? { status_code: 'FINISHED' }
        : { id: `stub-container-${seen.length}` }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(json))
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { seen, payloads, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
}

function run(script, args, { cwd, base, token = 'test-token-not-a-credential' }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GRAPH_BASE: base }
    if (token) env.IG_ACCESS_TOKEN = token; else delete env.IG_ACCESS_TOKEN
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout: ${script}\n${out}\n${err}`)) }, 60_000)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

// Review a release in the sandbox through the real CLI, so the file carries what the publisher will check.
async function reviewed(sb, dir, release) {
  const path = writeRelease(dir, release)
  const r = await run(join(sb.social, 'release-contract.mjs'), ['review', path], { cwd: sb.root, base: 'http://127.0.0.1:9' })
  assert.equal(r.code, 0, `review failed:\n${r.out}\n${r.err}`)
  return path
}

const postNow = (sb, graph, path, extra = []) => run(join(sb.social, 'post-now.mjs'), ['--release', path, '--graph-route', REASON, '--public-base', `${graph.base}/media`, ...extra], { cwd: sb.root, base: graph.base })
const postReels = (sb, graph, id, extra = []) => run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--id', id, '--graph-route', REASON, ...extra], { cwd: sb.root, base: graph.base })

// ---------------------------------------------------------------------------------------------
// The digest: what the gate can and cannot see
// ---------------------------------------------------------------------------------------------

test('PLANTED digestOf: two items that differ only in media bytes, or only in delivery, must not share a digest', () => {
  // The TPS Reel: same hosted URL slot (null before upload), same caption — different bytes on
  // disk and a different delivery time. The legacy digest cannot tell these apart.
  const base = { id: null, account: '630', media_type: 'REELS', video_url: null, caption: CAPTION, user_tags: ['nick_maruyama'], collaborators: [] }
  const selected = { ...base, release: { source: { sha256: sha256('53.87 s CapCut export'), video_md5: 'aaaa' }, mentions: ['nick_maruyama'], delivery: { scheduled_at: '2026-10-19T07:00', timezone: 'America/Chicago' } } }
  const derivative = { ...selected, release: { ...selected.release, source: { sha256: sha256('41.3 s prepared derivative'), video_md5: 'bbbb' } } }
  const now = { ...selected, release: { ...selected.release, delivery: { immediate: true } } }
  assert.notEqual(digestOf(selected, undefined, EVENT), digestOf(derivative, undefined, EVENT), 'different media bytes hashed the same')
  assert.notEqual(digestOf(selected, undefined, EVENT), digestOf(now, undefined, EVENT), 'a different delivery hashed the same')
  const noMentions = { ...selected, release: { ...selected.release, mentions: [] } }
  assert.notEqual(digestOf(selected, undefined, EVENT), digestOf(noMentions, undefined, EVENT), 'dropped mentions hashed the same')
})

test('digestOf: an item with no release block hashes exactly as the pre-release formula did (legacy receipts stay valid)', () => {
  // The formula as it stood before `release` existed (route-gate.mjs digestOf, 2026-10-17).
  const legacyDigestOf = (item, account, event = '') => {
    const type = item?.media_type || 'REELS'
    const imageTuple = (url, alt, tags) => (Array.isArray(tags) && tags.length ? ['IMAGE', url ?? null, alt || null, tags] : alt ? ['IMAGE', url ?? null, alt] : ['IMAGE', url ?? null])
    const media = type === 'CAROUSEL'
      ? (item.children || []).map((c) => (c.media_type === 'VIDEO' ? ['VIDEO', c.video_url || null] : imageTuple(c.image_url, c.alt_text, c.user_tags)))
      : type === 'IMAGE' ? [imageTuple(item?.image_url, item?.alt_text)]
      : type === 'STORIES' ? [item?.video_url ? ['VIDEO', item.video_url] : ['IMAGE', item?.image_url || null]]
      : [['VIDEO', item?.video_url || null]]
    const words = type === 'STORIES' ? (item?.user_tags?.length ? [item.user_tags] : []) : [item?.caption || '', item?.collaborators || [], item?.user_tags || []]
    const facebook = Array.isArray(item?.channels) && item.channels.includes('facebook') ? [item?.facebook_caption || null, item?.facebook_alt_text || null] : null
    const cover = type === 'REELS' && item?.cover_url ? [item.cover_url] : []
    const audio = item.audio_configuration ? [item.audio_configuration] : []
    const shown = [event, item?.id ?? null, account || item?.account || null, type, words, media, ...cover, ...(facebook ? [facebook] : []), ...audio]
    return createHash('sha256').update(JSON.stringify(shown)).digest('hex').slice(0, 16)
  }
  const items = [
    { id: 'r', account: '630', media_type: 'REELS', video_url: 'https://x/r.mp4', caption: 'c', collaborators: ['a'], user_tags: [], scheduledAt: '2026-10-19T12:00:00Z' },
    { id: 'i', account: 'letspepper', media_type: 'IMAGE', image_url: 'https://x/i.jpg', caption: 'c', user_tags: ['u'] },
    { id: 's', account: '630', media_type: 'STORIES', image_url: 'https://x/s.jpg', user_tags: ['u'] },
    { id: 'c', account: 'flickday', media_type: 'CAROUSEL', children: [{ image_url: 'https://x/1.jpg' }, { image_url: 'https://x/2.jpg', alt_text: 'two' }], caption: 'c', collaborators: [] },
  ]
  for (const item of items) assert.equal(digestOf(item, undefined, 'ev'), legacyDigestOf(item, undefined, 'ev'), item.id)
  // A route receipt bound to a legacy item still covers it after this change.
  const r = items[0]
  assert.equal(hasReceipt({ ...r, route: makeReceipt(REASON, 'test', new Date(), legacyDigestOf(r, undefined, 'ev')) }, new Date(), undefined, 'ev'), true)
})

// ---------------------------------------------------------------------------------------------
// The module: shape, time, measurement, review, comparison
// ---------------------------------------------------------------------------------------------

test('validateRelease: every decision is explicit — missing arrays, a file pointer caption, an unknown key or a half delivery are named', () => {
  const validateRelease = need('validateRelease')
  const dir = fixtureDir()
  try {
    assert.deepEqual(validateRelease(releaseFor(dir)), [])
    const names = (r) => validateRelease(r).map((p) => p.split(':')[0])
    assert.ok(names({ ...releaseFor(dir), user_tags: undefined }).includes('user_tags'), 'a missing user_tags array is a missing decision')
    assert.ok(names({ ...releaseFor(dir), collaborators: undefined }).includes('collaborators'))
    assert.ok(names({ ...releaseFor(dir), mentions: undefined }).includes('mentions'))
    assert.ok(names({ ...releaseFor(dir), audio_configuration: undefined }).includes('audio_configuration'), 'audio is a decision: an object or null')
    assert.ok(names({ ...releaseFor(dir), delivery: undefined }).includes('delivery'))
    assert.ok(names({ ...releaseFor(dir), delivery: { scheduled_at: '2026-10-19T07:00' } }).includes('delivery'), 'a scheduled delivery needs its timezone')
    assert.ok(names({ ...releaseFor(dir), delivery: { scheduled_at: '2026-10-19T07:00:00Z', timezone: 'America/Chicago' } }).includes('delivery'), 'scheduled_at is local wall time, no offset')
    assert.ok(names({ ...releaseFor(dir), delivery: { immediate: true, scheduled_at: '2026-10-19T07:00', timezone: 'America/Chicago' } }).includes('delivery'), 'one or the other')
    assert.ok(names({ ...releaseFor(dir), delivery: { immediate: false } }).includes('delivery'))
    assert.ok(names({ ...releaseFor(dir), caption: 'captions/day-one.txt', caption_file: 'x' }).includes('caption_file'), 'unknown keys are named, never dropped')
    assert.ok(names({ ...releaseFor(dir), caption: 42 }).includes('caption'))
    assert.ok(names({ ...releaseFor(dir), mentions: ['@nick_maruyama'] }).includes('mentions'), 'handles are written without the @')
    assert.ok(names({ ...releaseFor(dir), media_type: 'STORIES', caption: 'text' }).includes('caption'), 'a Story carries no caption; refuse rather than drop it')
    assert.ok(names({ ...releaseFor(dir), media_type: 'STORIES', caption: '', mentions: ['x'] }).includes('mentions'), 'Story mentions are user_tags')
    assert.ok(names({ ...releaseFor(dir), media_type: 'STORIES', caption: '', mentions: [], collaborators: ['x'] }).includes('collaborators'))
    assert.ok(names({ ...releaseFor(dir), media_type: 'REELS' }).includes('media_type'), 'a .jpg is not a Reel')
    assert.ok(names({ ...releaseFor(dir), audio_configuration: { audio_id: '123' } }).includes('audio_configuration'), 'catalog audio is REELS only')
    assert.ok(names({ ...releaseFor(dir), alt_text: 'x', media_type: 'STORIES', caption: '', mentions: [] }).includes('alt_text'))
    assert.ok(names({ ...releaseFor(dir), cover: { file: 'c.jpg' } }).includes('cover'), 'a cover applies to a Reel only')
    assert.ok(names({ ...releaseFor(dir), account: '' }).includes('account'))
    assert.ok(names({ ...releaseFor(dir), source: {} }).includes('source.file'))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('instantOf: local wall time in a named zone becomes one UTC instant, across the DST change', () => {
  const instantOf = need('instantOf')
  assert.equal(instantOf('2026-10-19T07:00', 'America/Chicago').toISOString(), '2026-10-19T12:00:00.000Z', 'CDT is UTC-5')
  assert.equal(instantOf('2026-01-15T07:00:00', 'America/Chicago').toISOString(), '2026-01-15T13:00:00.000Z', 'CST is UTC-6')
  assert.equal(instantOf('2026-10-19T07:00', 'UTC').toISOString(), '2026-10-19T07:00:00.000Z')
  assert.throws(() => instantOf('2026-10-19T07:00', 'America/Chicagoo'), /timezone/)
  assert.throws(() => instantOf('2026-10-19 07:00', 'America/Chicago'), /scheduled_at/)
  assert.throws(() => instantOf('2026-10-19T07:00-05:00', 'America/Chicago'), /scheduled_at/)
})

test('review: fills the media hashes and writes a review record; check passes on the untouched package', async () => {
  const review = need('review'); const check = need('check')
  const dir = fixtureDir()
  try {
    const path = writeRelease(dir, releaseFor(dir))
    const { release } = review(path, { now: new Date('2026-10-18T15:00:00Z') })
    assert.equal(release.source.sha256, sha256('selected export bytes'))
    assert.equal(release.source.video_md5, null, 'an image has no video stream')
    assert.equal(release.review.reviewed_at, '2026-10-18T15:00:00.000Z')
    assert.match(release.review.digest, /^[0-9a-f]{16}$/)
    for (const f of ['source.sha256', 'caption', 'mentions', 'user_tags', 'collaborators', 'delivery', 'account', 'media_type', 'audio_configuration']) {
      assert.match(release.review.fields[f] ?? '', /^[0-9a-f]{16}$/, `review.fields.${f}`)
    }
    assert.deepEqual(readJson(path).review, release.review, 'the record is written into the file')
    const ok = check(path)
    assert.deepEqual(ok.problems, [], JSON.stringify(ok.problems))
    assert.equal(ok.item.caption, CAPTION)
    assert.deepEqual(ok.item.user_tags, ['nick_maruyama', 'chellechavez_'])
    assert.equal(ok.item.release.review.digest, release.review.digest)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('review: refuses a package whose caption does not carry a listed mention, and one whose declared hash contradicts the file', () => {
  const review = need('review')
  const dir = fixtureDir()
  try {
    assert.throws(() => review(writeRelease(dir, releaseFor(dir, { caption: 'Day one is in the books.' }))), /mentions: .*chellechavez_/)
    assert.equal(readJson(join(dir, 'release.json')).review, undefined, 'no review record is written on refusal')
    assert.throws(() => review(writeRelease(dir, releaseFor(dir, { source: { file: join(dir, 'export.jpg'), sha256: 'deadbeef' } }))), /source\.sha256/)
    assert.throws(() => review(writeRelease(dir, releaseFor(dir, { source: { file: join(dir, 'missing.jpg') } }))), /source\.file/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('check: names the field that drifted since the review — media bytes, caption, tags, collaborators, delivery, account, mentions', () => {
  const review = need('review'); const check = need('check')
  const dir = fixtureDir()
  try {
    const path = writeRelease(dir, releaseFor(dir))
    review(path)
    const frozen = readJson(path)
    const fieldsOf = (edit) => {
      const r = structuredClone(frozen); edit(r); writeFileSync(path, JSON.stringify(r, null, 2))
      return check(path).problems.map((p) => p.field)
    }
    // wrong source file: the bytes on disk are not what was reviewed
    writeFileSync(join(dir, 'export.jpg'), Buffer.from('41.3 s prepared derivative'))
    const swapped = check(path)
    assert.ok(swapped.problems.some((p) => p.field === 'source.sha256'), JSON.stringify(swapped.problems))
    assert.match(swapped.problems.find((p) => p.field === 'source.sha256').message, /not the reviewed/)
    writeFileSync(join(dir, 'export.jpg'), Buffer.from('selected export bytes'))
    assert.deepEqual(check(path).problems, [], 'restoring the bytes restores the contract')
    // stale caption
    assert.ok(fieldsOf((r) => { r.caption = 'Day one is in the books. @nick_maruyama @chellechavez_' }).includes('caption'))
    // tag and collab changes, including a dropped tag
    assert.ok(fieldsOf((r) => { r.user_tags = ['nick_maruyama'] }).includes('user_tags'))
    assert.ok(fieldsOf((r) => { r.user_tags = [] }).includes('user_tags'))
    assert.ok(fieldsOf((r) => { r.collaborators = ['nick_maruyama'] }).includes('collaborators'))
    // delivery time change
    assert.ok(fieldsOf((r) => { r.delivery = { scheduled_at: '2026-10-19T07:00', timezone: 'America/Chicago' } }).includes('delivery'))
    // destination account
    assert.ok(fieldsOf((r) => { r.account = 'letspepper' }).includes('account'))
    // mention dropped from the list AND from the caption: the mentions decision changed
    assert.ok(fieldsOf((r) => { r.mentions = ['nick_maruyama']; r.caption = 'Day one is in the books. Three teams went undefeated. @nick_maruyama' }).includes('mentions'))
    // mention still listed but gone from the caption: named as mentions, not as a digest mismatch
    const missing = fieldsOf((r) => { r.caption = 'Day one is in the books. Three teams went undefeated. @nick_maruyama' })
    assert.ok(missing.includes('mentions'), JSON.stringify(missing))
    // a package that was never reviewed
    assert.ok(fieldsOf((r) => { delete r.review }).includes('review'))
    // untouched: clean
    writeFileSync(path, JSON.stringify(frozen, null, 2))
    assert.deepEqual(check(path).problems, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('check: a video is identified by its bytes and its video stream, so an audio-only remux is reported as such', { skip: !ffmpegPresent && 'ffmpeg not installed' }, () => {
  const review = need('review'); const check = need('check')
  const dir = mkdtempSync(join(tmpdir(), 'release-video-'))
  try {
    const gen = (out, { pattern = 'testsrc', tone = 440 } = {}) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y',
      '-f', 'lavfi', '-i', `${pattern}=duration=1:size=64x64:rate=10`, '-f', 'lavfi', '-i', `sine=frequency=${tone}:duration=1`,
      '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', '-shortest', out], { stdio: ['ignore', 'ignore', 'inherit'] })
    const selected = join(dir, 'export.mp4'); gen(selected)
    const path = writeRelease(dir, releaseFor(dir, { media_type: 'REELS', source: { file: selected } }))
    const { release } = review(path)
    assert.match(release.source.video_md5, /^[0-9a-f]{32}$/)
    const streamMd5 = release.source.video_md5
    // Same video stream, different audio track: the bytes differ, the stream does not.
    const remux = join(dir, 'remux.mp4')
    execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', selected, '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', remux], { stdio: ['ignore', 'ignore', 'inherit'] })
    cpSync(remux, selected)
    const audioOnly = check(path)
    const bytes = audioOnly.problems.find((p) => p.field === 'source.sha256')
    assert.ok(bytes, JSON.stringify(audioOnly.problems))
    assert.match(bytes.message, /video stream (is )?unchanged/i, 'the message says which part of the file moved')
    assert.ok(!audioOnly.problems.some((p) => p.field === 'source.video_md5'))
    // A different render: the stream itself differs.
    gen(selected, { pattern: 'smptebars' })
    const rerendered = check(path)
    assert.ok(rerendered.problems.some((p) => p.field === 'source.video_md5'), JSON.stringify(rerendered.problems))
    assert.notEqual(contract.videoStreamMd5(selected), streamMd5)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------------------------
// The publisher: post-now --release and post-reels on a release-bound item
// ---------------------------------------------------------------------------------------------

test('PLANTED post-now --release: the file on disk is not the reviewed export → refused before the queue, upload or Graph', async () => {
  const sb = sandbox(); const graph = await graphStub(); const dir = fixtureDir()
  try {
    const path = await reviewed(sb, dir, releaseFor(dir))
    writeFileSync(join(dir, 'export.jpg'), Buffer.from('41.3 s prepared derivative')) // the swap
    const r = await postNow(sb, graph, path)
    assert.equal(r.code, REFUSED_RELEASE, `expected the release refusal exit code\n${r.out}\n${r.err}`)
    assert.match(r.err, /REFUSED — release contract/)
    assert.match(r.err, /source\.sha256/, 'the refusal names the field')
    assert.equal(existsSync(sb.queuePath()), false, 'nothing queued')
    assert.deepEqual(graph.seen, [], 'nothing sent to Meta')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED post-now --release: a caption, tag, collaborator or delivery edited after the review is refused, naming the field', async () => {
  const sb = sandbox(); const graph = await graphStub(); const dir = fixtureDir()
  try {
    const path = await reviewed(sb, dir, releaseFor(dir))
    const frozen = readJson(path)
    const edits = {
      caption: (r) => { r.caption = 'Day one is in the books. @nick_maruyama @chellechavez_' },
      user_tags: (r) => { r.user_tags = [] },
      collaborators: (r) => { r.collaborators = ['chellechavez_'] },
      delivery: (r) => { r.delivery = { scheduled_at: '2026-10-19T07:00', timezone: 'America/Chicago' } },
    }
    for (const [field, edit] of Object.entries(edits)) {
      const r = structuredClone(frozen); edit(r); writeFileSync(path, JSON.stringify(r, null, 2))
      const res = await postNow(sb, graph, path)
      assert.equal(res.code, REFUSED_RELEASE, `${field}: expected refusal\n${res.out}\n${res.err}`)
      assert.match(res.err, new RegExp(`^\\s*${field}:`, 'm'), `${field}: the refusal names the field\n${res.err}`)
    }
    // --dry-run is refused the same way: a dry run cannot pass where the live run would stop.
    const dry = await postNow(sb, graph, path, ['--dry-run'])
    assert.equal(dry.code, REFUSED_RELEASE, dry.err)
    assert.equal(existsSync(sb.queuePath()), false)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('post-now --release: a content flag beside the release file is refused — the file owns caption, tags, media and account', async () => {
  const sb = sandbox(); const graph = await graphStub(); const dir = fixtureDir()
  try {
    const path = await reviewed(sb, dir, releaseFor(dir))
    for (const flags of [['--caption', 'other'], ['--tag', 'x'], ['--collab', 'x'], ['--file', join(dir, 'export.jpg')], ['--account', '630'], ['--story'], ['--audio-id', '1']]) {
      const r = await postNow(sb, graph, path, flags)
      assert.equal(r.code, 1, `${flags[0]}\n${r.out}\n${r.err}`)
      assert.match(r.err, new RegExp(`${flags[0]}.*release`), `${flags[0]}: the message names the flag and the file`)
    }
    const unreviewed = writeRelease(dir, releaseFor(dir))
    const r = await postNow(sb, graph, unreviewed)
    assert.equal(r.code, REFUSED_RELEASE, r.err)
    assert.match(r.err, /review/)
    assert.equal(existsSync(sb.queuePath()), false)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('post-now --release, the passing path: the reviewed package publishes as reviewed, and the ledger binds the release', async () => {
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    const path = await reviewed(sb, dir, releaseFor(dir))
    const dry = await postNow(sb, graph, path, ['--dry-run'])
    assert.equal(dry.code, 0, dry.err)
    assert.match(dry.out, /delivery: immediate/)
    assert.deepEqual(graph.seen, [])
    const r = await postNow(sb, graph, path)
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /posted \(media stub-media-1\)/)
    const item = readJson(sb.queuePath()).items[0]
    assert.equal(item.status, 'posted')
    assert.equal(item.caption, CAPTION)
    assert.deepEqual(item.user_tags, ['nick_maruyama', 'chellechavez_'])
    assert.equal(item.release.source.sha256, sha256('selected export bytes'))
    assert.deepEqual(item.release.delivery, { immediate: true })
    assert.deepEqual(item.release.mentions, ['nick_maruyama', 'chellechavez_'])
    assert.equal(item.release.review.digest, readJson(path).review.digest)
    assert.equal(item.route.digest, digestOf(item, undefined, EVENT), 'the route receipt is bound to the release-bearing item')
    assert.notEqual(digestOf(item, undefined, EVENT), digestOf({ ...item, release: undefined }, undefined, EVENT), 'the receipt covers the release block')
    const container = graph.payloads.find((p) => p.path.endsWith('/media'))
    assert.equal(container.params.caption, CAPTION, 'the caption sent is the caption reviewed')
    assert.deepEqual(JSON.parse(container.params.user_tags).map((t) => t.username), ['nick_maruyama', 'chellechavez_'])
    assert.equal(graph.seen.filter((s) => s.includes('/media_publish')).length, 1)
    assert.ok(graph.seen.some((s) => s.startsWith('GET /media/') && s.endsWith('/export.jpg')), `the hosted bytes were fetched and checked before publishing:\n${graph.seen.join('\n')}`)
    assert.ok(graph.seen.indexOf(graph.seen.find((s) => s.startsWith('GET /media/'))) < graph.seen.findIndex((s) => s.startsWith('POST ')), 'fetched before the first Graph call')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('post-now --release: a scheduled delivery is queued for its time, never published now, and --force cannot pull it forward', async () => {
  const instantOf = need('instantOf')
  const sb = sandbox(); const graph = await graphStub(); const dir = fixtureDir()
  try {
    const delivery = { scheduled_at: '2099-10-19T07:00', timezone: 'America/Chicago' }
    const path = await reviewed(sb, dir, releaseFor(dir, { delivery }))
    const r = await postNow(sb, graph, path)
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    const item = readJson(sb.queuePath()).items[0]
    assert.equal(item.scheduledAt, instantOf(delivery.scheduled_at, delivery.timezone).toISOString(), 'scheduledAt comes from the file, not from the clock')
    assert.equal(item.status, 'pending')
    assert.ok(item.image_url, 'the media is hosted so the later run has nothing left to upload')
    assert.deepEqual(graph.seen, [], `published early:\n${graph.seen.join('\n')}`)
    assert.match(r.out, /post-reels\.mjs --event adhoc --id adhoc-/, 'says how to publish it when due')
    assert.match(r.out, /2099-10-19T07:00 America\/Chicago/)
    // The later run, too early and forced: still not due. --force skips a schedule nobody reviewed, not this one.
    const forced = await postReels(sb, graph, item.id, ['--force'])
    assert.notEqual(forced.code, 0)
    assert.deepEqual(graph.seen, [])
    // --prepare-only ahead of a future delivery is refused rather than preparing a container that will expire.
    const prep = await postNow(sb, graph, path, ['--prepare-only'])
    assert.equal(prep.code, 1, prep.err)
    assert.match(prep.err, /prepare-only/)
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED post-reels: a release-bound queue item whose content no longer matches its review record is refused, naming the field', async () => {
  // The queue item as post-now would have written it, except that its caption was edited in the
  // ledger between queueing and the scheduled run. The review record is deliberately one that
  // cannot match: the unmodified publisher ignores `release` entirely and publishes.
  const item = {
    id: 'adhoc-202610181200', account: '630', media_type: 'IMAGE', file: '/fixture/export.jpg', caption: 'An edited caption.',
    image_url: 'https://media.invalid/adhoc/630/export.jpg', video_url: null, user_tags: ['nick_maruyama'], collaborators: [],
    scheduledAt: '2000-01-01T00:00:00.000Z', status: 'pending',
    release: {
      path: '/fixture/release.json', source: { file: '/fixture/export.jpg', sha256: sha256('selected export bytes'), video_md5: null },
      cover_sha256: null, mentions: ['nick_maruyama'], delivery: { immediate: true },
      review: { digest: '0000000000000000', fields: { caption: '0000000000000000' }, reviewed_at: '2026-10-18T15:00:00.000Z' },
    },
  }
  const sb = sandbox({ queue: { event: EVENT, items: [item] } }); const graph = await graphStub()
  try {
    const before = readFileSync(sb.queuePath(), 'utf8')
    const r = await postReels(sb, graph, item.id)
    assert.equal(r.code, REFUSED_RELEASE, `expected the release refusal exit code\n${r.out}\n${r.err}`)
    assert.match(r.err, /REFUSED — release contract/)
    assert.match(r.err, /^\s*caption:/m)
    assert.deepEqual(graph.seen, [], 'a mismatched release reached Meta')
    assert.equal(readFileSync(sb.queuePath(), 'utf8'), before, 'the ledger is untouched on refusal')
  } finally { await graph.close(); sb.cleanup() }
})

// ---------------------------------------------------------------------------------------------
// Post-commit review of f733c52: a past schedule, and the hosted bytes
// ---------------------------------------------------------------------------------------------

test('a scheduled time already in the past is refused at review, and at publish once it is past the grace', () => {
  const review = need('review'); const check = need('check'); const lateProblems = need('lateProblems')
  const dir = fixtureDir()
  try {
    const delivery = { scheduled_at: '2026-10-19T07:00', timezone: 'America/Chicago' } // 12:00Z
    const path = writeRelease(dir, releaseFor(dir, { delivery }))
    // A year typed wrong, or a window already missed: review refuses, no record is written.
    assert.throws(() => review(path, { now: new Date('2026-10-19T12:00:01Z') }), /delivery: .*already past at review time/)
    assert.equal(readJson(path).review, undefined)
    // Reviewed the evening before.
    review(path, { now: new Date('2026-10-18T22:00:00Z') })
    assert.deepEqual(check(path, { now: new Date('2026-10-19T11:00:00Z') }).problems, [], 'before the time: queued for it')
    assert.deepEqual(check(path, { now: new Date('2026-10-19T12:10:00Z') }).problems, [], 'ten minutes after: still 7am')
    const late = check(path, { now: new Date('2026-10-19T15:12:00Z') }).problems
    assert.equal(late.length, 1, JSON.stringify(late))
    assert.equal(late[0].field, 'delivery')
    assert.match(late[0].message, /3 h 12 min ago/)
    assert.match(late[0].message, /does not quietly become "now"/)
    assert.deepEqual(lateProblems({ immediate: true }, new Date()), [], 'immediate has no clock')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('post-now --release and post-reels both refuse a reviewed schedule whose time has passed, instead of publishing late', async () => {
  const check = need('check')
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  try {
    // Scheduled for yesterday at midnight UTC (24–48 h ago, whatever the clock says now) and reviewed an
    // hour before that, so the review passes and every run below is at least a day late.
    const scheduled = new Date(Date.now() - 24 * 3600_000); scheduled.setUTCHours(0, 0, 0, 0)
    const delivery = { scheduled_at: scheduled.toISOString().slice(0, 16), timezone: 'UTC' }
    const path = writeRelease(dir, releaseFor(dir, { delivery }))
    const reviewedAt = new Date(scheduled.getTime() - 3600_000)
    const r = await run(join(sb.social, 'release-contract.mjs'), ['check', path], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED_RELEASE, 'an unreviewed package is refused by check')
    const reviewed = contract.review(path, { now: reviewedAt })
    assert.ok(reviewed.release.review)
    const now = await postNow(sb, graph, path)
    assert.equal(now.code, REFUSED_RELEASE, `${now.out}\n${now.err}`)
    assert.match(now.err, /^\s*delivery: .*past the 15-minute grace/m)
    assert.equal(existsSync(sb.queuePath()), false)
    // The same item already in the ledger (queued in time, run late): post-reels refuses it too.
    const item = { ...check(path, { now: reviewedAt }).item, id: 'adhoc-late', image_url: `${graph.base}/media/adhoc/630/adhoc-late/export.jpg` }
    writeFileSync(sb.queuePath(), JSON.stringify({ event: EVENT, items: [item] }, null, 2))
    const late = await postReels(sb, graph, item.id)
    assert.equal(late.code, REFUSED_RELEASE, `${late.out}\n${late.err}`)
    assert.match(late.err, /^\s*delivery: .*past the 15-minute grace/m)
    assert.deepEqual(graph.seen, [], 'nothing fetched or sent for a post that is late')
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('PLANTED post-reels: the hosted object is hashed against the review — a ledger whose URL points at other bytes is refused, and so is a URL that cannot be fetched', async () => {
  const check = need('check')
  const sb = sandbox(); const dir = fixtureDir(); const graph = await graphStub({ mediaDir: dir })
  writeFileSync(join(dir, 'other.jpg'), Buffer.from('41.3 s prepared derivative'))
  try {
    const path = writeRelease(dir, releaseFor(dir))
    contract.review(path)
    const base = { ...check(path).item, id: 'adhoc-hosted', scheduledAt: '2000-01-01T00:00:00.000Z' }
    const queue = (image_url) => writeFileSync(sb.queuePath(), JSON.stringify({ event: EVENT, items: [{ ...base, image_url }] }, null, 2))
    // The ledger record agrees with itself; only the bytes at the URL disagree.
    queue(`${graph.base}/media/adhoc/630/adhoc-hosted/other.jpg`)
    const swapped = await postReels(sb, graph, base.id)
    assert.equal(swapped.code, REFUSED_RELEASE, `${swapped.out}\n${swapped.err}`)
    assert.match(swapped.err, /^\s*source\.sha256: the hosted media .*other\.jpg hashes to .*not the reviewed media/m)
    assert.ok(!graph.seen.some((s) => s.startsWith('POST ')), `a Graph call was made for unreviewed bytes:\n${graph.seen.join('\n')}`)
    // Gone from R2, or never uploaded: not a pass.
    queue(`${graph.base}/media/adhoc/630/adhoc-hosted/missing.jpg`)
    const gone = await postReels(sb, graph, base.id)
    assert.equal(gone.code, REFUSED_RELEASE, gone.err)
    assert.match(gone.err, /^\s*source\.sha256: could not fetch the hosted media .*HTTP 404/m)
    assert.ok(!graph.seen.some((s) => s.startsWith('POST ')))
    // Control: the reviewed bytes at the URL publish.
    queue(`${graph.base}/media/adhoc/630/adhoc-hosted/export.jpg`)
    const ok = await postReels(sb, graph, base.id)
    assert.equal(ok.code, 0, `${ok.out}\n${ok.err}`)
    assert.equal(graph.seen.filter((s) => s.includes('/media_publish')).length, 1)
  } finally { await graph.close(); sb.cleanup(); rmSync(dir, { recursive: true, force: true }) }
})

test('hostedProblems: the review record decides what is fetched — a reviewed cover missing from the ledger is refused, an unreviewed one too', async () => {
  const hostedProblems = need('hostedProblems')
  const hash16 = (v) => createHash('sha256').update(JSON.stringify(v ?? null)).digest('hex').slice(0, 16) // the record's own formula
  const served = { 'https://r2.test/reel.mp4': Buffer.from('reviewed reel'), 'https://r2.test/cover.jpg': Buffer.from('reviewed cover'), 'https://r2.test/other.jpg': Buffer.from('some other cover') }
  const fetchImpl = async (url) => (served[url]
    ? { ok: true, status: 200, body: (async function* () { yield served[url] })() }
    : { ok: false, status: 404 })
  const fieldsFor = (coverBytes) => ({
    'source.sha256': hash16(sha256(served['https://r2.test/reel.mp4'])),
    'cover.sha256': hash16(coverBytes ? sha256(coverBytes) : null),
  })
  const item = (overrides, fields) => ({ media_type: 'REELS', video_url: 'https://r2.test/reel.mp4', release: { review: { digest: 'x', fields } }, ...overrides })
  const fieldsOf = async (it) => (await hostedProblems(it, { fetchImpl })).map((p) => `${p.field}: ${p.message}`)
  // Reviewed with a cover: the cover has to be there, and be the reviewed bytes.
  const withCover = fieldsFor(served['https://r2.test/cover.jpg'])
  assert.deepEqual(await fieldsOf(item({ cover_url: 'https://r2.test/cover.jpg' }, withCover)), [])
  assert.match((await fieldsOf(item({}, withCover)))[0], /^cover\.sha256: a cover was reviewed but this item has no cover_url/)
  assert.match((await fieldsOf(item({ cover_url: 'https://r2.test/other.jpg' }, withCover)))[0], /^cover\.sha256: the hosted cover .*not the reviewed cover/)
  assert.match((await fieldsOf(item({ cover_url: 'https://r2.test/gone.jpg' }, withCover)))[0], /^cover\.sha256: could not fetch .*HTTP 404/)
  // Reviewed without a cover: none may appear.
  const noCover = fieldsFor(null)
  assert.deepEqual(await fieldsOf(item({}, noCover)), [])
  assert.match((await fieldsOf(item({ cover_url: 'https://r2.test/cover.jpg' }, noCover)))[0], /^cover\.sha256: the hosted cover .*not the reviewed cover/)
  // And the media itself, both ways.
  assert.match((await fieldsOf(item({ video_url: 'https://r2.test/other.jpg' }, noCover)))[0], /^source\.sha256: the hosted media .*not the reviewed media/)
  assert.deepEqual(await fieldsOf({ ...item({}, noCover), release: {} }), [], 'no record: compareReview owns that refusal')
})
