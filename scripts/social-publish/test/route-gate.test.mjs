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
  checkRoute, hasStandingRoute, hasReceipt, cleanReason, makeReceipt, refusal, REFUSED,
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
    const child = spawn(process.execPath, [script, ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe'], // stdin closed: never inherit the runner's
      env: { ...process.env, GRAPH_BASE: base, IG_ACCESS_TOKEN: 'test-token-not-a-credential' },
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
    const child = await new Promise((resolve) => {
      const env = { ...process.env, GRAPH_BASE: graph.base }; delete env.IG_ACCESS_TOKEN
      const c = spawn(process.execPath, [join(sb.social, 'post-reels.mjs'), '--event', EVENT, '--count', '1'], { cwd: sb.root, env, stdio: ['ignore', 'pipe', 'pipe'] })
      let err = ''; c.stderr.on('data', (d) => { err += d }); c.on('close', (code) => resolve({ code, err }))
    })
    assert.equal(child.code, REFUSED)
    assert.doesNotMatch(child.err, /IG_ACCESS_TOKEN/)
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

test('a standing route in graph-routes.json lets a campaign publish with no per-post reason', async () => {
  const routes = { events: { [EVENT]: { reason: 'test fixture: scheduled drip approved by Nino', approved: '2026-09-21', scope: 'fixture' } } }
  const sb = sandbox({ routes }); const graph = await graphStub()
  try {
    const r = await run(join(sb.social, 'post-reels.mjs'), ['--event', EVENT, '--count', '1'], { cwd: sb.root, base: graph.base })
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /standing route in graph-routes\.json/)
    assert.ok(graph.seen.some((s) => s.endsWith('/media_publish')))
    assert.equal(JSON.parse(readFileSync(sb.queuePath(), 'utf8')).items[0].route, undefined, 'a standing route needs no per-item receipt')
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
    assert.match(r.out, /"surface": "graph"/)
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

  const stamped = [{ ...items[0], route: makeReceipt('Nino named the API for this post', 'test') }]
  assert.equal(checkRoute({ event: EVENT, items: stamped, routes: none }).kind, 'one-off')

  // a mixed batch is refused for the item that lacks a receipt, not waved through by the one that has it
  const mixed = [stamped[0], { ...items[0], id: 'second' }]
  assert.deepEqual(checkRoute({ event: EVENT, items: mixed, routes: none }).missing.map((i) => i.id), ['second'])

  // malformed receipts and entries do not count
  assert.equal(hasReceipt({ route: { surface: 'graph', reason: '' , recorded_at: 'x' } }), false)
  assert.equal(hasReceipt({ route: { surface: 'suite', reason: 'r', recorded_at: 'x' } }), false)
  assert.equal(hasReceipt({ route: true }), false)
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: { reason: 'r' } } }), false, 'an entry with no approval date is not an approval')
  assert.equal(hasStandingRoute(EVENT, { events: { [EVENT]: true } }), false)

  // the ad hoc ledger can never be given a standing route
  const adhocListed = { events: { adhoc: { reason: 'r', approved: '2026-09-21' } } }
  assert.equal(hasStandingRoute('adhoc', adhocListed), false)
  assert.equal(checkRoute({ event: 'adhoc', items, routes: adhocListed }).ok, false)

  assert.equal(cleanReason(true), null)
  assert.equal(cleanReason('  ok  '), null)
  assert.equal(cleanReason(' Nino asked for the API '), 'Nino asked for the API')
})

test('refusal text: says what happened, where the post should go, and what counts as approval', () => {
  const text = refusal({ event: EVENT, missing: incidentQueue().items, script: 'post-reels.mjs' })
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
