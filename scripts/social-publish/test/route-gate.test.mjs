/**
 * Route gate tests. Run: pnpm test:social  (node --test scripts/social-publish/test/)
 *
 * The subprocess tests run the REAL publisher scripts, copied into a throwaway
 * root so every path they resolve from their own location — the queue, the
 * approval list, the copy audit's root — lands in the sandbox. Nothing here
 * reads or writes the repo's live queue/, and GRAPH_BASE points at a local
 * stub that records every request, so no test can reach Meta even if the gate
 * is broken. The token is a fixed non-credential string.
 *
 * The first test is a replay of the 2026-09-21 incident: a hand-written queue
 * file for an ad hoc five-photo Collab carousel, published with
 * `post-reels.mjs --event … --count 1 --id …`. It must now stop before the
 * first request. The "control" test proves the stub would have seen the
 * publish, so a zero request count means the gate held and not that the
 * harness was blind.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  checkRoute, hasStandingRoute, hasReceipt, cleanReason, makeReceipt, digestOf, refusal, REFUSED, RECEIPT_TTL_HOURS,
} from '../route-gate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')
const REPO = join(SOCIAL, '..', '..')
const EVENT = 'breeze-men-20260920'
const ITEM_ID = 'breeze-men-20260920-carousel'

// The incident item as it stood at 12:12 on 2026-09-21: hosted, pending, no receipt.
const incidentQueue = () => ({
  event: EVENT,
  items: [{
    id: ITEM_ID,
    account: 'flickday',
    media_type: 'CAROUSEL',
    caption: '630 Breeze men’s tryouts on September 20. Swings, digs, and the moments between reps.\n\nPhotos: Nino Chavez / Flickday Media.',
    children: [1, 2, 3, 4, 5].map((n) => ({ image_url: `https://media.invalid/${EVENT}/0${n}.jpg` })),
    user_tags: [],
    collaborators: ['nino.chavez.photo'],
    scheduledAt: '2026-09-21T17:00:00.000Z',
    status: 'pending',
  }],
})

// The incident item plus n-1 siblings, all due: the shape of a backlog.
// `receiptAt`: give every item a valid receipt recorded at that time, bound to the item as it stands.
const REASON = 'Nino asked for the API on this one'
const receiptFor = (item, at = new Date(), account) => makeReceipt(REASON, 'test', at, digestOf(item, account, EVENT))
const backlog = (n, receiptAt) => {
  const q = incidentQueue(); const [first] = q.items
  q.items = Array.from({ length: n }, (_, i) => {
    const item = { ...first, id: `${EVENT}-${i + 1}` }
    return receiptAt ? { ...item, route: receiptFor(item, receiptAt) } : item
  })
  return q
}

function sandbox({ routes = { events: {} }, queue = incidentQueue() } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'route-gate-'))
  const social = join(root, 'scripts', 'social-publish')
  mkdirSync(join(social, 'queue'), { recursive: true })
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true })
  for (const f of ['route-gate.mjs', 'post-reels.mjs', 'post-now.mjs', 'accounts.json', 'vary-captions.mjs'])
    cpSync(join(SOCIAL, f), join(social, f))
  cpSync(join(REPO, 'tools', 'lib', 'encounter-audit.mjs'), join(root, 'tools', 'lib', 'encounter-audit.mjs'))
  cpSync(join(REPO, 'reader-contract.json'), join(root, 'reader-contract.json'))
  writeFileSync(join(social, 'graph-routes.json'), JSON.stringify(routes, null, 2))
  if (queue) writeFileSync(join(social, 'queue', `${queue.event}.json`), JSON.stringify(queue, null, 2))
  return { root, social, queuePath: (e = EVENT) => join(social, 'queue', `${e}.json`), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

// Minimal Graph stand-in: enough of the container → status → publish flow to let a permitted run finish.
async function graphStub() {
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split('?')[0]}`)
    if (req.url.includes('graph-is-down')) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"unavailable","code":2}}') }
    if (req.url.includes('bad-param')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Invalid parameter","code":100}}') }
    if (req.url.includes('throttled')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Application request limit reached","code":4}}') }
    if (req.url.includes('no-such-container')) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"Unsupported get request","code":100,"error_subcode":33}}') }
    const body = req.url.includes('media_publish') ? { id: 'stub-media-1' }
      : req.method === 'GET' ? { status_code: req.url.includes('already-live') ? 'PUBLISHED' : 'FINISHED' }
      : { id: `stub-container-${seen.length}` }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(body))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { seen, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
}

function run(script, args, { cwd, base, token = 'test-token-not-a-credential' }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, GRAPH_BASE: base }
    if (token) env.IG_ACCESS_TOKEN = token; else delete env.IG_ACCESS_TOKEN
    const child = spawn(process.execPath, [script, ...args], {
      cwd, env, stdio: ['ignore', 'pipe', 'pipe'], // stdin closed: never inherit the runner's
    })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`timeout: ${script}\n${out}\n${err}`)) }, 60_000)
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }) })
  })
}

// --- the incident, replayed -------------------------------------------------

test('incident replay: an ad hoc Collab carousel with no route never reaches the Graph API', async () => {
  const sb = sandbox(); const graph = await graphStub()
  try {
    const before = readFileSync(sb.queuePath(), 'utf8')
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `expected the route refusal exit code, got ${r.code}\n${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [], 'the publisher made a Graph request before it had a route')
    assert.equal(readFileSync(sb.queuePath(), 'utf8'), before, 'a refused run must leave the queue file untouched')
    assert.match(r.err, /REFUSED — no approved Graph route for event "breeze-men-20260920"/)
    assert.match(r.err, /meta-publish/, 'the refusal has to name the skill that owns the routing decision')
    assert.match(r.err, /native Instagram/)
  } finally { await graph.close(); sb.cleanup() }
})

test('incident replay: the dry run is refused too, so it cannot pass where the live run would not', async () => {
  const sb = sandbox(); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--dry-run'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED)
    assert.deepEqual(graph.seen, [])
    assert.doesNotMatch(r.out, /would post/)
  } finally { await graph.close(); sb.cleanup() }
})

test('incident replay: the refusal comes before the token check, so nobody fetches a credential for a post that should go out by hand', async () => {
  const sb = sandbox(); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base, token: null })
    assert.equal(r.code, REFUSED)
    assert.doesNotMatch(r.err, /IG_ACCESS_TOKEN/)
  } finally { await graph.close(); sb.cleanup() }
})

test('control: with a recorded one-off route the same item publishes, and the stub sees it', async () => {
  const sb = sandbox(); const graph = await graphStub()
  try {
    const reason = 'Nino: "run this one through the Graph publisher" (test fixture)'
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', reason], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.ok(graph.seen.some((s) => s.endsWith('/media_publish')), `the stub never saw a publish — the harness cannot vouch for the zero above. saw: ${graph.seen.join(', ')}`)
    const item = JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0]
    assert.equal(item.status, 'posted')
    assert.equal(item.route.surface, 'graph')
    assert.equal(item.route.reason, reason, 'the reason stays on the ledger item as the route receipt')
    assert.match(item.route.via, /post-reels\.mjs --graph-route/)
  } finally { await graph.close(); sb.cleanup() }
})

test('a standing route in graph-routes.json lets a campaign publish several items with no per-post reason', async () => {
  const routes = { events: { [EVENT]: { reason: 'test fixture: scheduled drip approved by Nino', approved: '2026-09-21', accounts: ['flickday'] } } }
  const sb = sandbox({ routes, queue: backlog(2) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '2'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /standing route in graph-routes\.json/)
    assert.equal(graph.seen.filter((s) => s.endsWith('/media_publish')).length, 2)
    assert.equal(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].route, undefined, 'a standing route needs no per-item receipt')
  } finally { await graph.close(); sb.cleanup() }
})

// --- a one-off is one post ----------------------------------------------------

test('one reason cannot be stretched over a backlog: --force --count 80 with a reason publishes nothing', async () => {
  const sb = sandbox({ queue: backlog(80) }); const graph = await graphStub()
  try {
    const before = readFileSync(sb.queuePath(), 'utf8')
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--force', '--count', '80', '--graph-route', 'Nino asked for the API on this one'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [])
    assert.equal(readFileSync(sb.queuePath(), 'utf8'), before, 'no receipt may be written by a refused run')
    assert.match(r.err, /A one-off route covers ONE post, and this run would publish 80/)
  } finally { await graph.close(); sb.cleanup() }
})

test('the default --count 2 with a reason is refused too: the second item was never approved', async () => {
  const sb = sandbox({ queue: backlog(2) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--graph-route', 'Nino asked for the API on this one'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED)
    assert.deepEqual(graph.seen, [])
    assert.match(r.err, /--id <item-id>/)
  } finally { await graph.close(); sb.cleanup() }
})

test('--count 1 with a reason does not publish whichever item is oldest: the post has to be named with --id', async () => {
  const sb = sandbox({ queue: backlog(2) }); const graph = await graphStub()
  try {
    const before = readFileSync(sb.queuePath(), 'utf8')
    const reason = 'Nino asked for the API on this one'
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--graph-route', reason], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [])
    assert.equal(readFileSync(sb.queuePath(), 'utf8'), before)
    assert.match(r.err, /covers the post Nino NAMED\. 2 items are due/)

    // the same run with the item named goes through, and only that item is touched
    const named = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', `${EVENT}-2`, '--graph-route', reason], { cwd: sb.root, base: graph.base })
    assert.equal(named.code, 0, `${named.out}\n${named.err}`)
    const items = JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items
    assert.deepEqual(items.map((i) => i.status), ['pending', 'posted'])
    assert.equal(items[0].route, undefined)
    assert.equal(items[1].route.reason, reason)
  } finally { await graph.close(); sb.cleanup() }
})

test('a bare run cannot sweep up several receipted leftovers', async () => {
  const sb = sandbox({ queue: backlog(2, new Date()) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '2'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('a receipt goes stale: yesterday\'s yes does not publish today', async () => {
  const sb = sandbox({ queue: backlog(1, new Date(Date.now() - (RECEIPT_TTL_HOURS + 1) * 3600_000)) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED)
    assert.deepEqual(graph.seen, [])
    assert.match(r.err, /route receipt is older than 24h/)
  } finally { await graph.close(); sb.cleanup() }
})

test('a fresh receipt lets the SAME post retry with no new reason', async () => {
  const sb = sandbox({ queue: backlog(1, new Date()) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /one-off receipt already on the item/)
    assert.ok(graph.seen.some((s) => s.endsWith('/media_publish')))
  } finally { await graph.close(); sb.cleanup() }
})

test('a receipt approves THAT post: a new caption, new photos or another account needs a new yes', async () => {
  const edits = {
    caption: (it) => { it.caption = 'A different caption Nino never saw.' },
    photos: (it) => { it.children = it.children.slice(0, 3) },
    collaborators: (it) => { it.collaborators = ['letspepper.open'] },
  }
  for (const [what, edit] of Object.entries(edits)) {
    const queue = backlog(1, new Date()); edit(queue.items[0]) // edited AFTER the receipt was recorded
    const sb = sandbox({ queue }); const graph = await graphStub()
    try {
      const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
      assert.equal(r.code, REFUSED, `${what}: ${r.out}\n${r.err}`)
      assert.deepEqual(graph.seen, [], what)
      assert.match(r.err, /has changed since its route was approved/, what)
    } finally { await graph.close(); sb.cleanup() }
  }
  // same item, untouched, but pointed at another account with --account
  const sb = sandbox({ queue: backlog(1, new Date()) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--account', 'ninophoto'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('"publish this now" is not approval for the API: the reason has to name the surface', async () => {
  for (const reason of ['Nino said publish this now', 'Nino said do not use the Graph API here']) {
    const sb = sandbox(); const graph = await graphStub()
    try {
      const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', reason], { cwd: sb.root, base: graph.base })
      assert.equal(r.code, REFUSED, reason); assert.deepEqual(graph.seen, [], reason)
      assert.match(r.err, /have to name the Graph API/)
    } finally { await graph.close(); sb.cleanup() }
  }
})

test('a standing route cannot be pointed at another account with --account', async () => {
  const routes = { events: { [EVENT]: { reason: 'test fixture: drip approved by Nino', approved: '2026-09-21', accounts: ['flickday'] } } }
  const sb = sandbox({ routes, queue: backlog(2) }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '2', '--account', 'ninophoto'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `${r.out}\n${r.err}`); assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('duplicate or missing ids stop the run before anything is selected', async () => {
  const q = backlog(2); q.items[1].id = q.items[0].id
  const sb = sandbox({ queue: q }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', q.items[0].id, '--graph-route', REASON], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 1); assert.match(r.err, /unique, non-empty id/); assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('a container built from an older version of the post is not reused under a new approval', async () => {
  const q = incidentQueue(); q.items[0].ig_container_id = 'old-container'; q.items[0].ig_container_digest = 'digest-of-the-old-payload'
  const sb = sandbox({ queue: q }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', REASON], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.ok(!graph.seen.some((s) => s.startsWith('POST') && s.includes('old-container')), `the stale container was published: ${graph.seen.join(', ')}`)
    assert.notEqual(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].ig_container_id, 'old-container')
  } finally { await graph.close(); sb.cleanup() }
})

test('a stale container whose publish already landed marks the item posted and never posts it twice', async () => {
  const q = incidentQueue(); q.items[0].ig_container_id = 'already-live'; q.items[0].ig_container_digest = 'digest-of-the-old-payload'
  const sb = sandbox({ queue: q }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', REASON], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.deepEqual(graph.seen.filter((s) => s.startsWith('POST')), [], `something was built or published: ${graph.seen.join(', ')}`)
    assert.equal(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].status, 'posted')
  } finally { await graph.close(); sb.cleanup() }
})

test('when Graph cannot say whether a saved container published, nothing is rebuilt', async () => {
  for (const id of ['graph-is-down', 'throttled', 'bad-param']) { // a 503, and a throttle that Graph reports as HTTP 400 code 4
  const q = incidentQueue(); q.items[0].ig_container_id = id; q.items[0].ig_container_digest = 'digest-of-the-old-payload'
  const sb = sandbox({ queue: q }); const graph = await graphStub()
  try {
    await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', REASON], { cwd: sb.root, base: graph.base })
    assert.deepEqual(graph.seen.filter((s) => s.startsWith('POST')), [], `rebuilt or published on an unknown status: ${graph.seen.join(', ')}`)
    const item = JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0]
    assert.equal(item.status, 'error'); assert.match(item.error, /could not confirm/); assert.equal(item.ig_container_id, id)
  } finally { await graph.close(); sb.cleanup() }
  }
})

test('a container Graph says does not exist is rebuilt', async () => {
  const q = incidentQueue(); q.items[0].ig_container_id = 'no-such-container'; q.items[0].ig_container_digest = 'digest-of-the-old-payload'
  const sb = sandbox({ queue: q }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--id', ITEM_ID, '--graph-route', REASON], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.equal(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].status, 'posted')
  } finally { await graph.close(); sb.cleanup() }
})

test('run-drip.sh hands the gate\'s refusal code to its caller, before any credential is read', async () => {
  const sb = sandbox()
  try {
    cpSync(join(SOCIAL, 'run-drip.sh'), join(sb.social, 'run-drip.sh'))
    const src = readFileSync(join(sb.social, 'run-drip.sh'), 'utf8')
      .replace('REPO="/Users/nino/Workspace/dev/apps/letspepper"', `REPO="${sb.root}"`).replace('LOG="/tmp/lp-reels.log"', `LOG="${sb.root}/drip.log"`)
      .replace(/op read [^)]*\)/, 'echo SHOULD-NOT-BE-REACHED >&2; echo tok)')
    writeFileSync(join(sb.social, 'run-drip.sh'), src)
    const r = await new Promise((resolve) => { const c = spawn('/bin/zsh', [join(sb.social, 'run-drip.sh'), EVENT], { cwd: sb.root, stdio: ['ignore', 'pipe', 'pipe'] }); let e = ''; c.stderr.on('data', (d) => { e += d }); c.on('close', (code) => resolve({ code, e })) })
    assert.equal(r.code, REFUSED); assert.doesNotMatch(r.e, /SHOULD-NOT-BE-REACHED/)
    assert.match(readFileSync(join(sb.root, 'drip.log'), 'utf8'), /exit 3/)
  } finally { sb.cleanup() }
})

test('an unreadable approval list fails closed with the gate\'s exit code', async () => {
  const sb = sandbox(); writeFileSync(join(sb.social, 'graph-routes.json'), '{ not json'); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED); assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('a run that stops at the token check leaves no receipt behind', async () => {
  const sb = sandbox(); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', '--graph-route', 'Nino asked for the API on this one'], { cwd: sb.root, base: graph.base, token: null })
    assert.equal(r.code, 1, 'past the route gate, stopped by the missing token')
    assert.match(r.err, /IG_ACCESS_TOKEN/)
    assert.equal(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].route, undefined, 'an aborted run must not leave an approved-looking item on the ledger')
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

test('a bare or throwaway --graph-route is not a reason', async () => {
  for (const flag of [['--graph-route'], ['--graph-route', 'ok'], ['--graph-route', 'approved']]) {
    const sb = sandbox(); const graph = await graphStub()
    try {
      const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1', ...flag], { cwd: sb.root, base: graph.base })
      assert.equal(r.code, REFUSED, flag.join(' '))
      assert.deepEqual(graph.seen, [])
      assert.match(r.err, /needs Nino's own words/)
    } finally { await graph.close(); sb.cleanup() }
  }
})

// --- post-now: the ad hoc entry point ---------------------------------------

test('post-now refuses before it writes the ledger, uploads, or calls Meta', async () => {
  const sb = sandbox({ queue: null }); const graph = await graphStub()
  try {
    const media = join(sb.root, 'frame.jpg'); writeFileSync(media, 'not a real jpeg')
    const r = await run(join(sb.social, 'post-now.mjs'), ['--account', 'flickday', '--file', media, '--caption', 'x', '--collab', 'nino.chavez.photo'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, REFUSED, `${r.out}\n${r.err}`)
    assert.equal(existsSync(sb.queuePath('adhoc')), false, 'the ad hoc ledger must not be written by a refused run')
    assert.deepEqual(graph.seen, [])
    assert.match(r.err, /re-run post-now\.mjs with {2}--graph-route/)
  } finally { await graph.close(); sb.cleanup() }
})

test('post-now --dry-run with a reason shows the receipt it would record', async () => {
  const sb = sandbox({ queue: null }); const graph = await graphStub()
  try {
    const media = join(sb.root, 'frame.jpg'); writeFileSync(media, 'not a real jpeg')
    const r = await run(join(sb.social, 'post-now.mjs'), ['--account', 'flickday', '--file', media, '--caption', 'x', '--graph-route', 'Nino asked for the API on this one', '--dry-run'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /route: one-off, "Nino asked for the API on this one"/)
    assert.equal(existsSync(sb.queuePath('adhoc')), false)
    assert.deepEqual(graph.seen, [])
  } finally { await graph.close(); sb.cleanup() }
})

// --- the decision itself ----------------------------------------------------

test('checkRoute: the rules, without a subprocess', () => {
  const items = incidentQueue().items
  const none = { events: {} }
  assert.equal(checkRoute({ event: EVENT, items, routes: none }).ok, false)
  assert.deepEqual(checkRoute({ event: EVENT, items, routes: none }).missing.map((i) => i.id), [ITEM_ID])

  const stamped = [{ ...items[0], route: receiptFor(items[0]) }]
  assert.equal(checkRoute({ event: EVENT, items: stamped, routes: none }).kind, 'one-off')

  // without a standing route a run is one post: two items are refused even when both hold a fresh receipt
  const mixed = [stamped[0], { ...items[0], id: 'second' }]
  assert.equal(checkRoute({ event: EVENT, items: mixed, routes: none }).why, 'batch')
  assert.deepEqual(checkRoute({ event: EVENT, items: mixed, routes: none }).missing.map((i) => i.id), ['second'])
  assert.equal(checkRoute({ event: EVENT, items: [stamped[0], stamped[0]], routes: none }).why, 'batch')
  assert.equal(checkRoute({ event: EVENT, items: mixed, routes: none, reasonFlag: 'Nino asked for the API' }).ok, false)
  // one item in the batch, but picked by queue order out of several: refused until it is named
  assert.equal(checkRoute({ event: EVENT, items, routes: none, reasonFlag: 'Nino asked for the API', named: false, candidates: 2 }).why, 'unnamed')
  assert.equal(checkRoute({ event: EVENT, items, routes: none, reasonFlag: 'Nino asked for the API', named: false, candidates: 1 }).ok, true, 'a queue holding one due item names it by itself')
  assert.equal(checkRoute({ event: EVENT, items: stamped, routes: none, named: false, candidates: 3 }).why, 'unnamed', 'a fresh receipt does not excuse an unnamed pick either')
  // a reason stamps exactly the one item
  assert.deepEqual(checkRoute({ event: EVENT, items, routes: none, reasonFlag: 'Nino asked for the API' }).stamp.map((i) => i.id), [ITEM_ID])

  // freshness: a receipt is good for RECEIPT_TTL_HOURS, not before it was written, not after it lapsed
  const at = new Date('2026-09-21T18:00:00Z')
  const r = (hoursAgo) => ({ ...items[0], route: receiptFor(items[0], new Date(at.getTime() - hoursAgo * 3600_000)) })
  assert.equal(hasReceipt(r(1), at, undefined, EVENT), true)
  assert.equal(hasReceipt(r(RECEIPT_TTL_HOURS + 1), at, undefined, EVENT), false)
  assert.equal(hasReceipt(r(-1), at, undefined, EVENT), false, 'a receipt dated in the future is not a receipt')
  assert.equal(hasReceipt({ ...items[0], route: { ...receiptFor(items[0]), recorded_at: 'not a date' } }, at), false)

  // malformed receipts and entries do not count
  assert.equal(hasReceipt({ ...items[0], route: makeReceipt('Nino named the API for this post', 'test') }, new Date(), undefined, EVENT), false, 'a receipt with no digest approves nothing')
  assert.equal(hasReceipt({ ...items[0], caption: 'edited', route: receiptFor(items[0]) }, new Date(), undefined, EVENT), false, 'the digest binds the caption')
  assert.equal(hasReceipt({ ...items[0], route: receiptFor(items[0]) }, new Date(), 'ninophoto', EVENT), false, 'and the account the run will publish to')
  assert.equal(hasReceipt({ ...items[0], route: receiptFor(items[0], new Date(), 'ninophoto') }, new Date(), 'ninophoto', EVENT), true)
  assert.equal(hasReceipt({ route: { surface: 'graph', reason: '' , recorded_at: 'x' } }), false)
  assert.equal(hasReceipt({ route: { surface: 'suite', reason: 'r', recorded_at: 'x' } }), false)
  assert.equal(hasReceipt({ route: true }), false)
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: { reason: 'r' } } }), false, 'an entry with no approval date is not an approval')
  const entry = { reason: 'drip approved', approved: '2026-09-21', accounts: ['flickday'] }
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: entry } }, ['flickday']), true)
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: entry } }, ['ninophoto']), false, 'a standing route covers the accounts it names, nothing else')
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: { ...entry, approved: 'yes' } } }, ['flickday']), false, 'approved has to be a date')
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: { reason: 'r', approved: '2026-09-21' } } }, ['flickday']), false, 'no accounts, no route')
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: { ...entry, expires: '2026-09-01' } } }, ['flickday'], new Date('2026-09-21')), false, 'an expired route is over')
  assert.equal(hasStandingRoute('constructor', { events: {} }, []), false)
  // the reason has to approve THIS surface
  assert.equal(cleanReason('Nino said publish this now'), null, 'a yes to publishing is not a yes to the API')
  assert.equal(cleanReason('Nino said do not use the API for this'), null)
  assert.equal(cleanReason('Nino: post it by hand instead of the Graph API'), null)
  assert.equal(cleanReason('Nino: use the Graph API for this one'), 'Nino: use the Graph API for this one')
  for (const no of ['Nino said skip the API on this one', 'Nino said the API is wrong for this, post by hand', 'Nino said the Graph API should not be used', 'Nino mentioned the API yesterday'])
    assert.equal(cleanReason(no), null, no)
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: entry } }, []), false, 'an unknown account fails closed')
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: true } }), false)

  // the ad hoc ledger can never be given a standing route
  const adhocListed = { events: { adhoc: { reason: 'r', approved: '2026-09-21', accounts: ['flickday'] } } }
  assert.equal(hasStandingRoute('adhoc', adhocListed), false)
  assert.equal(checkRoute({ event: 'adhoc', items, routes: adhocListed }).ok, false)

  assert.equal(cleanReason(true), null)
  assert.equal(cleanReason('  ok  '), null)
  assert.equal(cleanReason(' Nino asked for the API '), 'Nino asked for the API')
})

test('refusal text: says what happened, where the post should go, and what counts as approval', () => {
  const items = incidentQueue().items
  const text = refusal({ event: EVENT, items, missing: items, script: 'post-reels.mjs' })
  for (const needle of ['Nothing was queued, uploaded, or sent to Meta', 'native Instagram', 'Meta Business Suite', 'meta-publish', 'graph-routes.json', 'forges an approval'])
    assert.ok(text.includes(needle), `refusal is missing: ${needle}`)
})

test('every entry in the tracked approval list is a complete approval', () => {
  // A malformed entry does not approve anything, and fails silently at publish time. Catch it here.
  const tracked = JSON.parse(readFileSync(join(SOCIAL, 'graph-routes.json'), 'utf8'))
  assert.equal(typeof tracked.events, 'object')
  for (const event of Object.keys(tracked.events)) {
    assert.notEqual(event, 'adhoc', 'the ad hoc ledger cannot hold a standing route')
    assert.ok(hasStandingRoute(event, tracked), `graph-routes.json: "${event}" needs a non-empty reason and approved date`)
  }
})
