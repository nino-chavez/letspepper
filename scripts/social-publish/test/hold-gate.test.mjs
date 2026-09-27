/**
 * Hold and veto gate tests (hold-shape.mjs), run through the real post-reels.mjs
 * subprocess so the check is proven at the entry point, not just as pure logic.
 * Same sandbox shape as route-gate.test.mjs: a throwaway root, every path the
 * scripts resolve from their own location, and a stub Graph server that records
 * every request so a held/vetoed item's silence can be told apart from a blind
 * harness (the control test proves the stub would see a publish that got through).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { holdBlock, isHeld, isVetoed, linkedItemBlock } from '../hold-shape.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')
const REPO = join(SOCIAL, '..', '..')
const EVENT = 'gallery-announce-test'

const baseItem = (extra = {}) => ({
  id: 'holdtest-carousel',
  account: 'flickday',
  media_type: 'CAROUSEL',
  caption: 'A gallery went up. Photos: Nino Chavez / Flickday Media.',
  children: [1, 2].map((n) => ({ image_url: `https://media.invalid/${EVENT}/0${n}.jpg` })),
  user_tags: [],
  collaborators: [],
  scheduledAt: '2000-01-01T00:00:00.000Z', // always "due" on the scheduledAt axis
  status: 'held',
  ...extra,
})

function sandbox({ routes = { events: {} }, item, items = [item] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hold-gate-'))
  const social = join(root, 'scripts', 'social-publish')
  mkdirSync(join(social, 'queue'), { recursive: true })
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true })
  for (const f of ['route-gate.mjs', 'route-shape.mjs', 'hold-shape.mjs', 'collab-shape.mjs', 'tag-params.mjs', 'carousel-container-params.mjs', 'post-reels.mjs', 'accounts.json', 'vary-captions.mjs'])
    cpSync(join(SOCIAL, f), join(social, f))
  cpSync(join(REPO, 'tools', 'lib', 'encounter-audit.mjs'), join(root, 'tools', 'lib', 'encounter-audit.mjs'))
  cpSync(join(REPO, 'reader-contract.json'), join(root, 'reader-contract.json'))
  writeFileSync(join(social, 'graph-routes.json'), JSON.stringify(routes, null, 2))
  const queue = { event: EVENT, items }
  writeFileSync(join(social, 'queue', `${EVENT}.json`), JSON.stringify(queue, null, 2))
  return {
    root, social,
    queuePath: join(social, 'queue', `${EVENT}.json`),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

async function graphStub() {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split('?')[0]}`)
    const body = req.url.includes('media_publish') ? { id: 'stub-media-1' }
      : req.method === 'GET' ? { status_code: 'FINISHED' }
      : { id: `stub-container-${seen.length}` }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { seen, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
}

function run(script, args, { cwd, base }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GRAPH_BASE: base, IG_ACCESS_TOKEN: 'test-token-not-a-credential' }
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout\n${out}\n${err}`)) }, 30_000)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

const STANDING = { events: { [EVENT]: { reason: 'test fixture: standing route for the hold-gate tests', approved: '2026-09-25', accounts: ['flickday'] } } }

test('a held item does not publish before holdUntil, even with --force', async () => {
  const item = baseItem({ status: 'held', holdUntil: new Date(Date.now() + 3600_000).toISOString() })
  const sb = sandbox({ routes: STANDING, item }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--force'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [], 'a held item reached the Graph API before its hold cleared')
    assert.match(r.out, /Nothing due/)
    assert.equal(JSON.parse(readFileSync(sb.queuePath, 'utf8')).items[0].status, 'held')
  } finally { await graph.close(); sb.cleanup() }
})

test('the same item publishes once holdUntil has passed', async () => {
  const item = baseItem({ status: 'held', holdUntil: new Date(Date.now() - 1000).toISOString() })
  const sb = sandbox({ routes: STANDING, item }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.ok(graph.seen.some((s) => s.endsWith('/media_publish')), `stub never saw a publish: ${graph.seen.join(', ')}`)
    assert.equal(JSON.parse(readFileSync(sb.queuePath, 'utf8')).items[0].status, 'posted')
  } finally { await graph.close(); sb.cleanup() }
})

test('an undecided Collab carousel never publishes locally, even after its timed hold and with --force', async () => {
  const item = baseItem({ status: 'held', holdUntil: new Date(Date.now() - 1000).toISOString(), collab: { status: 'ask' } })
  const sb = sandbox({ routes: STANDING, item }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--force'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [], 'the Collab-ask carousel reached the Graph API')
    assert.match(r.out, /Nothing due/)
  } finally { await graph.close(); sb.cleanup() }
})

test('a vetoed item never publishes, even after holdUntil and even with --force', async () => {
  const item = baseItem({ status: 'vetoed', holdUntil: new Date(Date.now() - 1000).toISOString(), veto_reason: 'test fixture' })
  const sb = sandbox({ routes: STANDING, item }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--force'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [])
    assert.equal(JSON.parse(readFileSync(sb.queuePath, 'utf8')).items[0].status, 'vetoed')
  } finally { await graph.close(); sb.cleanup() }
})

test('control: an ordinary pending item (no hold, no veto) with the same fixture DOES reach the stub', async () => {
  const item = baseItem({ status: 'pending' })
  const sb = sandbox({ routes: STANDING, item }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.ok(graph.seen.some((s) => s.endsWith('/media_publish')), 'the harness cannot vouch for the zeros above if this control is blind too')
  } finally { await graph.close(); sb.cleanup() }
})

// --- the linked-carousel gate applies to THIS publisher too (code review 2026-09-26) --------
// post-reels.mjs is a separate publisher over the same queue shape the Worker uses for
// gallery-announce — a real, unblocked path was `post-reels.mjs --event gallery-announce --id
// <story-id>` before this, since only the Worker's own postDuePending checked linkedItemBlock.

test('post-reels.mjs never publishes a Story whose carousel has not posted yet, even named directly with --id', async () => {
  const carousel = baseItem({ id: 'holdtest-carousel', status: 'pending' })
  const story = baseItem({ id: 'holdtest-story', linked_item_id: 'holdtest-carousel', status: 'pending' })
  const sb = sandbox({ routes: STANDING, items: [carousel, story] }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--id', 'holdtest-story'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 1, `${r.out}\n${r.err}`) // "no due item" — same exit as a missing/already-posted id
    assert.deepEqual(graph.seen, [], 'the Story reached the Graph API before its carousel posted')
  } finally { await graph.close(); sb.cleanup() }
})

test('post-reels.mjs publishes the Story once its carousel is already posted', async () => {
  const carousel = baseItem({ id: 'holdtest-carousel', status: 'posted' })
  const story = baseItem({ id: 'holdtest-story', linked_item_id: 'holdtest-carousel', status: 'pending' })
  const sb = sandbox({ routes: STANDING, items: [carousel, story] }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--id', 'holdtest-story'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    const items = JSON.parse(readFileSync(sb.queuePath, 'utf8')).items
    assert.equal(items.find((i) => i.id === 'holdtest-story').status, 'posted')
  } finally { await graph.close(); sb.cleanup() }
})

// --- pure logic --------------------------------------------------------------

test('hold-shape: pure decision table', () => {
  const now = new Date('2026-09-25T12:00:00Z')
  assert.equal(isHeld({ holdUntil: '2026-09-25T18:00:00Z' }, now), true)
  assert.equal(isHeld({ holdUntil: '2026-09-25T06:00:00Z' }, now), false, 'past holdUntil is not held')
  assert.equal(isHeld({}, now), false, 'no holdUntil is not held')
  assert.equal(isHeld({ holdUntil: 'not a date' }, now), false)
  assert.equal(isVetoed({ status: 'vetoed' }), true)
  assert.equal(isVetoed({ status: 'pending' }), false)
  assert.match(holdBlock({ status: 'vetoed', veto_reason: 'wrong gallery' }, now), /vetoed: wrong gallery/)
  assert.match(holdBlock({ status: 'pending', holdUntil: '2026-09-25T18:00:00Z' }, now), /held until/)
  assert.equal(holdBlock({ status: 'pending', holdUntil: '2026-09-25T06:00:00Z' }, now), null)
  assert.equal(holdBlock({ status: 'pending' }, now), null)
  // vetoed wins over an already-cleared hold, and over a still-open one
  assert.match(holdBlock({ status: 'vetoed', holdUntil: '2026-09-25T18:00:00Z' }, now), /vetoed/)
})

// --- linkedItemBlock: the companion-Story gate (2026-09-26) ------------------
// Code review 2026-09-26 caught that the only link between a Story and its carousel was time
// (a fixed schedule offset) — a carousel that got vetoed or failed left its Story to publish
// anyway, pointing at a feed post that never happened. linkedItemBlock() is the fix.

test('linkedItemBlock: no linked_item_id at all is never blocked', () => {
  assert.equal(linkedItemBlock({ id: 'a' }, [{ id: 'a' }]), null)
})

test('linkedItemBlock: a dangling reference (the linked item is not in this queue) is not blocked here', () => {
  assert.equal(linkedItemBlock({ id: 'story', linked_item_id: 'nope' }, [{ id: 'story', linked_item_id: 'nope' }]), null)
})

test('linkedItemBlock: waiting for the carousel to post is non-terminal — try again next tick, no state change', () => {
  for (const status of ['held', 'pending', 'building']) {
    const items = [{ id: 'carousel', status }, { id: 'story', linked_item_id: 'carousel' }]
    const block = linkedItemBlock(items[1], items)
    assert.equal(block.terminal, false, status)
    assert.match(block.reason, /waiting for its linked post/)
  }
})

test('linkedItemBlock: a vetoed carousel permanently blocks its Story', () => {
  const items = [{ id: 'carousel', status: 'vetoed' }, { id: 'story', linked_item_id: 'carousel' }]
  const block = linkedItemBlock(items[1], items)
  assert.equal(block.terminal, true)
  assert.match(block.reason, /vetoed/)
})

test('linkedItemBlock: a carousel that failed with a terminal Graph error permanently blocks its Story', () => {
  const items = [{ id: 'carousel', status: 'error', error: 'container ERROR' }, { id: 'story', linked_item_id: 'carousel' }]
  const block = linkedItemBlock(items[1], items)
  assert.equal(block.terminal, true)
  assert.match(block.reason, /failed to publish/)
})

test('linkedItemBlock: a POSTED carousel unblocks its Story', () => {
  const items = [{ id: 'carousel', status: 'posted' }, { id: 'story', linked_item_id: 'carousel' }]
  assert.equal(linkedItemBlock(items[1], items), null)
})
