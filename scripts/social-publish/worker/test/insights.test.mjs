import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker from '../src/index.js'
import {
  INSIGHTS_CRON, RUN_BUDGET, MAX_RANGE_DAYS, DAY_METRICS, FOLLOW_METRIC, MEDIA_METRICS,
  reportDay, dayWindow, lookbackDays, readInsights, classify, GraphError, alertFor,
  runInsights, insightsStatus,
} from '../src/insights.js'

const here = (p) => new URL(p, import.meta.url)
const fixture = (name) => JSON.parse(readFileSync(here(`./fixtures/insights/${name}.json`), 'utf8'))
const MIGRATION = readFileSync(here('../migrations/0001_instagram_insights.sql'), 'utf8')
const IG = '17841411569230130'
const GRAPH = 'https://graph.facebook.com/v25.0'
const ACCOUNTS = {
  '630': { handle: '630volleyball', ig_user_id: IG, ig_token_binding: 'IG_630_ACCESS_TOKEN', insights: true },
  other: { handle: 'other.account', ig_user_id: '1', ig_token_binding: 'IG_OTHER', insights: false },
}
// 9:30 a.m. CDT on Oct 16: the lookback is Oct 8–15 minus today, and the five fixture
// posts (Oct 12–15) fall inside the 14-day media window.
const NOW = new Date('2026-10-16T14:30:00Z')

/**
 * D1 stand-in: the real migration on an in-memory SQLite. Covers the slice of the D1
 * binding the insights job uses — prepare().bind().first() and batch() in one
 * transaction — and refuses anything else so a new call shape fails loudly here.
 */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(MIGRATION)
  // node:sqlite returns null-prototype rows; D1 returns plain objects.
  const plain = (row) => (row ? { ...row } : null)
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    async first() { return plain(sqlite.prepare(sql).get(...args)) },
    exec() {
      const prepared = sqlite.prepare(sql)
      if (/^\s*SELECT/i.test(sql)) return { results: prepared.all(...args).map(plain) }
      prepared.run(...args)
      return { results: [] }
    },
  })
  return {
    sqlite,
    prepare: (sql) => statement(sql),
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const out = statements.map((s) => s.exec())
        sqlite.exec('COMMIT')
        return out
      } catch (e) {
        sqlite.exec('ROLLBACK')
        throw e
      }
    },
    rows: (sql, ...args) => sqlite.prepare(sql).all(...args).map(plain),
  }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// The shape Meta documents for metric_type=total_value, one entry per requested metric.
function dayTotals(metrics, value) {
  return { data: metrics.map((name, i) => ({ name, period: 'day', total_value: { value: value + i } })) }
}
function followTotals(follows, unfollows) {
  return {
    data: [{
      name: FOLLOW_METRIC, period: 'day',
      total_value: { breakdowns: [{ dimension_keys: ['follow_type'], results: [
        { dimension_values: ['FOLLOWER'], value: follows },
        { dimension_values: ['NON_FOLLOWER'], value: unfollows },
      ] }] },
    }],
  }
}
function mediaLifetime(metrics, value) {
  return { data: metrics.map((name, i) => ({ name, period: 'lifetime', values: [{ value: value + i }] })) }
}

/**
 * A Graph API stand-in. `mode` is 'missing_scope' (today's real token), 'granted', or a
 * function (url) => Response for a test that needs something else. Records every call.
 */
function graphStub(mode = 'granted', { dayValue = 100 } = {}) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    calls.push({ url, method: init.method || 'GET' })
    if (url.hostname === 'ntfy.sh') return new Response('ok')
    if (typeof mode === 'function') return mode(url)
    const path = url.pathname.replace('/v25.0/', '')
    if (path === IG) return json(fixture('profile'))
    if (path === `${IG}/media`) return json(fixture('media-list'))
    if (mode === 'missing_scope' && path.endsWith('/insights')) return json(fixture('missing-scope'), 400)
    if (path === `${IG}/insights`) {
      const metric = url.searchParams.get('metric')
      return json(metric === FOLLOW_METRIC ? followTotals(6, 6) : dayTotals(metric.split(','), dayValue))
    }
    if (path.endsWith('/insights')) return json(mediaLifetime(url.searchParams.get('metric').split(','), 50))
    return json({ error: { message: `unexpected path ${path}`, code: 100 } }, 400)
  }
  return { calls, fetchImpl }
}

const graphCalls = (calls) => calls.filter((c) => c.url.hostname === 'graph.facebook.com')
const ntfyCalls = (calls) => calls.filter((c) => c.url.hostname === 'ntfy.sh')
const envWith = (db, extra = {}) => ({ INSIGHTS_DB: db, IG_630_ACCESS_TOKEN: 'test-token', NTFY_TOPIC: 'test-topic', ...extra })
const collect = (env, fetchImpl, opts = {}) => runInsights(env, { accounts: ACCOUNTS, graph: GRAPH, now: NOW, fetchImpl, ...opts })

test('INSIGHTS_CRON is the daily cron in wrangler.jsonc, beside the hourly one', () => {
  const config = readFileSync(here('../wrangler.jsonc'), 'utf8')
  const crons = JSON.parse(config.match(/"crons":\s*(\[[^\]]*\])/)[1])
  assert.deepEqual(crons, ['0 * * * *', INSIGHTS_CRON])
  assert.match(config, /"binding":\s*"INSIGHTS_DB"/)
  assert.match(config, /"migrations_dir":\s*"migrations"/)
})

test('reporting days follow Los Angeles midnight, end a second early, and survive both DST changes', () => {
  // Business Suite's own capture of Oct 6 carries 1791270000, the same instant. Meta
  // includes `until`, so the window stops one second before the next midnight.
  assert.deepEqual(dayWindow('2026-10-06'), { since: 1791270000, until: 1791270000 + 86400 - 1 })
  assert.equal(dayWindow('2026-10-06').since, Date.UTC(2026, 9, 6, 7) / 1000)
  assert.equal(dayWindow('2026-10-06').until + 1, dayWindow('2026-10-07').since)
  const fallBack = dayWindow('2026-11-01')
  assert.equal(fallBack.since, Date.UTC(2026, 10, 1, 7) / 1000)
  assert.equal(fallBack.until - fallBack.since, 25 * 3600 - 1)
  const springForward = dayWindow('2026-03-08')
  assert.equal(springForward.since, Date.UTC(2026, 2, 8, 8) / 1000)
  assert.equal(springForward.until - springForward.since, 23 * 3600 - 1)
  assert.equal(reportDay(new Date('2026-10-16T05:30:00Z')), '2026-10-15') // 10:30 p.m. PDT
})

test('a daily run re-reads the seven complete days before today', () => {
  const days = lookbackDays(NOW)
  assert.deepEqual(days, ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])
  assert.deepEqual(lookbackDays(new Date('2026-10-16T05:30:00Z')).at(-1), '2026-10-14')
})

test('readInsights keeps totals and breakdown values and never invents a zero', () => {
  assert.deepEqual(readInsights(followTotals(6, 4)), [
    { metric: 'follows_and_unfollows:FOLLOWER', value: 6 },
    { metric: 'follows_and_unfollows:NON_FOLLOWER', value: 4 },
  ])
  assert.deepEqual(readInsights(mediaLifetime(['views'], 7)), [{ metric: 'views', value: 7 }])
  assert.deepEqual(readInsights({ data: [] }), [])
  assert.deepEqual(readInsights({ data: [{ name: 'reach', total_value: {} }, { name: 'views', values: [] }] }), [])
})

test("Meta's real one-day responses for Oct 6 read back as Business Suite's numbers", () => {
  // Captured 2026-10-15 with the window dayWindow('2026-10-06') builds. Business Suite
  // showed the same day as reach 4,806, 353 interactions, 6 follows and 6 unfollows.
  const day = Object.fromEntries(readInsights(fixture('day-2026-10-06')).map((v) => [v.metric, v.value]))
  assert.deepEqual(Object.keys(day).sort(), [...DAY_METRICS].sort())
  assert.equal(day.reach, 4806)
  assert.equal(day.total_interactions, 353)
  assert.deepEqual(readInsights(fixture('follows-2026-10-06')), [
    { metric: 'follows_and_unfollows:FOLLOWER', value: 6 },
    { metric: 'follows_and_unfollows:NON_FOLLOWER', value: 6 },
  ])
  // Lifetime media insights come back as values[], one metric per requested name.
  assert.deepEqual(readInsights(fixture('media-reel')).map((v) => v.metric), MEDIA_METRICS.REELS)
  assert.deepEqual(readInsights(fixture('media-feed')).map((v) => v.metric), MEDIA_METRICS.FEED)
})

test('classify reads Meta error codes, starting with the one Meta returned for this token', () => {
  const real = fixture('missing-scope').error
  assert.equal(classify(new GraphError(real, 400)), 'missing_scope')
  assert.equal(classify(new GraphError({ message: 'expired', code: 190 }, 400)), 'token_invalid')
  assert.equal(classify(new GraphError({ message: 'perm', code: 200 }, 403)), 'missing_scope')
  assert.equal(classify(new GraphError({ message: 'busy', code: 4 }, 400)), 'error')
  assert.equal(classify(new Error('anything else')), 'error')
})

test('the daily cron runs only the insights job; the hourly cron never touches it', async () => {
  const kvReads = []
  const queue = { async get(key) { kvReads.push(key); return null }, async put() { throw new Error('no writes expected') } }
  const originalFetch = globalThis.fetch
  const stub = graphStub('granted')
  globalThis.fetch = stub.fetchImpl
  try {
    const db = fakeD1()
    const pending = []
    const ctx = { waitUntil: (p) => pending.push(p) }
    await worker.scheduled({ cron: INSIGHTS_CRON }, envWith(db, { QUEUE: queue, ACTIVE_EVENTS: 'test-event' }), ctx)
    await Promise.all(pending)
    assert.deepEqual(kvReads, [], 'the insights tick must not read publisher queues')
    assert.ok(stub.calls.every((c) => c.method === 'GET' || c.url.hostname === 'ntfy.sh'), 'the insights tick only reads Graph')
    assert.equal(db.rows('SELECT COUNT(*) AS n FROM sync_runs')[0].n, 1)

    pending.length = 0
    const untouched = { prepare() { throw new Error('the hourly tick must not use INSIGHTS_DB') } }
    await worker.scheduled({ cron: '0 * * * *' }, { INSIGHTS_DB: untouched, QUEUE: queue, ACTIVE_EVENTS: 'test-event' }, ctx)
    await Promise.all(pending)
    assert.ok(kvReads.length > 0 && kvReads.every((k) => k === 'test-event'), 'the hourly tick still runs the publisher')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("today's token: follower counts and posts are saved, the missing permission alerts once", async () => {
  const db = fakeD1()
  const stub = graphStub('missing_scope')
  const first = await collect(envWith(db), stub.fetchImpl)
  const run = first.accounts[0]
  assert.equal(run.state, 'missing_scope')
  assert.equal(run.followers, 8257)
  assert.equal(run.dayValues, 0)
  assert.match(run.detail, /\(#10\) Application does not have permission/)
  // One failed day stops the day loop: the same token fails every day the same way.
  assert.equal(graphCalls(stub.calls).filter((c) => c.url.pathname.endsWith(`${IG}/insights`)).length, 1)
  assert.deepEqual(db.rows('SELECT day, followers_count FROM account_snapshots'), [{ day: '2026-10-16', followers_count: 8257 }])
  assert.equal(db.rows('SELECT COUNT(*) AS n FROM media')[0].n, 5)
  assert.deepEqual(
    db.rows("SELECT metric, value FROM media_metric_snapshots WHERE media_id = '17962360413206792' ORDER BY metric"),
    [{ metric: 'comments_count', value: 1 }, { metric: 'like_count', value: 128 }],
  )
  assert.equal(ntfyCalls(stub.calls).length, 1, 'first missing-scope run alerts')
  assert.equal(run.alerted, true)

  const again = graphStub('missing_scope')
  const second = await collect(envWith(db), again.fetchImpl)
  assert.equal(second.accounts[0].state, 'missing_scope')
  assert.equal(ntfyCalls(again.calls).length, 0, 'an unchanged state does not alert again')
})

test('a granted token records every day and post, and a recovery alerts', async () => {
  const db = fakeD1()
  await collect(envWith(db), graphStub('missing_scope').fetchImpl)
  const stub = graphStub('granted')
  const { accounts: [run] } = await collect(envWith(db), stub.fetchImpl)
  assert.equal(run.state, 'ok')
  assert.equal(run.daysComplete, 7)
  assert.equal(run.dayValues, 7 * (DAY_METRICS.length + 2))
  assert.equal(ntfyCalls(stub.calls).length, 1, 'recovery alerts once')
  const oct12 = Object.fromEntries(db.rows("SELECT metric, value FROM account_metric_days WHERE day = '2026-10-12'").map((r) => [r.metric, r.value]))
  assert.equal(oct12.reach, 100)
  assert.equal(oct12['follows_and_unfollows:FOLLOWER'], 6)
  assert.equal(oct12['follows_and_unfollows:NON_FOLLOWER'], 6)
  const reel = db.rows("SELECT metric FROM media_metric_snapshots WHERE media_id = '17916892425265676'").map((r) => r.metric)
  assert.ok(MEDIA_METRICS.REELS.every((m) => reel.includes(m)))
  const carousel = graphCalls(stub.calls).find((c) => c.url.pathname.endsWith('/17968912968186616/insights'))
  assert.equal(carousel.url.searchParams.get('metric'), MEDIA_METRICS.FEED.join(','))
  // Each day is read as its own Los Angeles window.
  const oct12Call = graphCalls(stub.calls).find((c) => c.url.searchParams.get('since') === String(dayWindow('2026-10-12').since))
  assert.equal(oct12Call.url.searchParams.get('until'), String(dayWindow('2026-10-13').since - 1))
  assert.equal(oct12Call.url.searchParams.get('metric_type'), 'total_value')
})

test('a later reading revises a value, and an empty reading never erases one', async () => {
  const db = fakeD1()
  await collect(envWith(db), graphStub('granted', { dayValue: 100 }).fetchImpl)
  const reach = () => db.rows("SELECT value, first_observed_at, last_observed_at FROM account_metric_days WHERE day = '2026-10-12' AND metric = 'reach'")[0]
  const before = reach()

  const later = new Date(NOW.getTime() + 86400000)
  await runInsights(envWith(db), { accounts: ACCOUNTS, graph: GRAPH, now: later, fetchImpl: graphStub('granted', { dayValue: 120 }).fetchImpl })
  const revised = reach()
  assert.equal(revised.value, 120)
  assert.equal(revised.first_observed_at, before.first_observed_at)
  assert.notEqual(revised.last_observed_at, before.last_observed_at)

  const empty = graphStub((url) => {
    if (url.pathname.endsWith(`${IG}/insights`)) return json({ data: [] })
    return graphStub('granted').fetchImpl(url.toString())
  })
  await runInsights(envWith(db), { accounts: ACCOUNTS, graph: GRAPH, now: later, fetchImpl: empty.fetchImpl })
  assert.equal(reach().value, 120)
})

test('the longest allowed range fits one run budget', async () => {
  assert.equal(MAX_RANGE_DAYS, 22)
  const db = fakeD1()
  const stub = graphStub('granted')
  const { accounts: [run] } = await collect(envWith(db), stub.fetchImpl, { from: '2026-09-01', to: '2026-09-22', trigger: 'manual' })
  assert.equal(run.state, 'ok')
  assert.equal(run.daysComplete, 22)
  assert.equal(run.throughDay, '2026-09-22')
  assert.equal(graphCalls(stub.calls).length, 1 + 2 * MAX_RANGE_DAYS)
  assert.ok(graphCalls(stub.calls).length <= RUN_BUDGET)
  assert.equal(run.mediaRead, 0, 'a range run reads days only')
})

test('a daily run with more posts than the budget allows stops, saves what it read, and says why', async () => {
  const db = fakeD1()
  const posts = Array.from({ length: 35 }, (_, i) => ({
    id: `9${String(i).padStart(4, '0')}`, timestamp: new Date(NOW.getTime() - (i + 1) * 3600000).toISOString().replace('.000Z', '+0000'),
    media_type: 'VIDEO', media_product_type: 'REELS', permalink: null, like_count: i, comments_count: 0,
  }))
  const stub = graphStub((url) => {
    if (url.pathname.endsWith(`${IG}/media`)) return json({ data: posts })
    return graphStub('granted').fetchImpl(url.toString())
  })
  const { accounts: [run] } = await collect(envWith(db), stub.fetchImpl)
  assert.equal(run.state, 'partial')
  assert.match(run.detail, new RegExp(`${RUN_BUDGET}-request run budget`))
  assert.equal(run.daysComplete, 7)
  assert.equal(graphCalls(stub.calls).length, RUN_BUDGET)
  // Every listed post keeps its like and comment counts; insights stop at the budget.
  assert.equal(db.rows("SELECT COUNT(DISTINCT media_id) AS n FROM media_metric_snapshots WHERE metric = 'like_count'")[0].n, 35)
  assert.equal(db.rows("SELECT COUNT(DISTINCT media_id) AS n FROM media_metric_snapshots WHERE metric = 'views'")[0].n, RUN_BUDGET - 16)
})

test('ranges are checked before any request', async () => {
  const db = fakeD1()
  const stub = graphStub('granted')
  await assert.rejects(collect(envWith(db), stub.fetchImpl, { from: '2026-10-10', to: '2026-10-16' }), /before today/)
  await assert.rejects(collect(envWith(db), stub.fetchImpl, { from: '2026-09-01', to: '2026-09-23' }), /at most 22 days/)
  await assert.rejects(collect(envWith(db), stub.fetchImpl, { from: '2026-10-10' }), /YYYY-MM-DD/)
  await assert.rejects(collect(envWith(db), stub.fetchImpl, { from: '2026-02-30', to: '2026-03-01' }), /YYYY-MM-DD/)
  await assert.rejects(collect(envWith(db), stub.fetchImpl, { only: 'other' }), /does not collect insights/)
  assert.equal(stub.calls.length, 0)
})

test('a missing token binding is recorded and alerted, not thrown', async () => {
  const db = fakeD1()
  const stub = graphStub('granted')
  const { accounts: [run] } = await collect(envWith(db, { IG_630_ACCESS_TOKEN: undefined }), stub.fetchImpl)
  assert.equal(run.state, 'error')
  assert.equal(run.detail, 'token: IG_630_ACCESS_TOKEN is not set')
  assert.equal(graphCalls(stub.calls).length, 0)
  assert.equal(ntfyCalls(stub.calls).length, 1)
})

test('a network failure never stores the request URL, which carries the token', async () => {
  const db = fakeD1()
  const stub = graphStub((url) => { throw new TypeError(`fetch failed for ${url}`) })
  const { accounts: [run] } = await collect(envWith(db), stub.fetchImpl)
  assert.equal(run.state, 'error')
  const stored = db.rows('SELECT detail FROM sync_runs')[0].detail
  assert.doesNotMatch(stored, /access_token|test-token|graph\.facebook\.com/)
})

test('only scheduled runs alert, and a manual run never shifts the alert state', async () => {
  const db = fakeD1()
  const cron1 = graphStub('missing_scope')
  await collect(envWith(db), cron1.fetchImpl)
  assert.equal(ntfyCalls(cron1.calls).length, 1)

  const manual = graphStub('granted')
  const { accounts: [byHand] } = await collect(envWith(db), manual.fetchImpl, { trigger: 'manual' })
  assert.equal(byHand.state, 'ok')
  assert.equal(byHand.alerted, null)
  assert.equal(ntfyCalls(manual.calls).length, 0)

  const cron2 = graphStub('missing_scope')
  await collect(envWith(db), cron2.fetchImpl)
  assert.equal(ntfyCalls(cron2.calls).length, 0, 'the previous scheduled run had the same state')
})

test('alerts fire on a change of state only', () => {
  assert.equal(alertFor({ handle: 'a', previous: null, state: 'ok' }), null)
  assert.equal(alertFor({ handle: 'a', previous: 'ok', state: 'ok' }), null)
  assert.match(alertFor({ handle: 'a', previous: 'ok', state: 'token_invalid' }).title, /expired or revoked/)
  assert.match(alertFor({ handle: 'a', previous: 'missing_scope', state: 'ok' }).message, /"missing_scope"/)
  assert.equal(alertFor({ handle: 'a', previous: null, state: 'partial', detail: 'x' }).priority, 'default')
})

test('/insights routes need the trigger key and report freshness', async () => {
  const db = fakeD1()
  const originalFetch = globalThis.fetch
  globalThis.fetch = graphStub('missing_scope').fetchImpl
  try {
    const env = envWith(db, { TRIGGER_KEY: 'trigger' })
    const call = (path) => worker.fetch(new Request(`https://worker.example.test${path}`), env)
    assert.equal((await call('/insights/status')).status, 403)
    assert.equal((await call('/insights/run?key=wrong')).status, 403)
    assert.equal((await call('/insights/run?key=trigger&from=2026-10-01&to=2099-01-01')).status, 400)
    const ran = await (await call('/insights/run?key=trigger')).json()
    assert.equal(ran.accounts[0].state, 'missing_scope')
    assert.equal(ran.accounts[0].alerted, null, 'a manual run reports to its caller, not the phone')
    const status = await (await call('/insights/status?key=trigger')).json()
    assert.equal(status['630'].lastRun.state, 'missing_scope')
    assert.equal(status['630'].lastRun.trigger, 'manual')
    assert.equal(status['630'].lastOkAt, null)
    assert.equal(status['630'].latestSnapshot.followers_count, 8257)
    assert.equal(status.other, undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('insightsStatus reads coverage per source', async () => {
  const db = fakeD1()
  await collect(envWith(db), graphStub('granted').fetchImpl)
  const status = await insightsStatus(envWith(db), { accounts: ACCOUNTS })
  assert.deepEqual(status['630'].coverage, [{ source: 'graph_api', first_day: '2026-10-09', last_day: '2026-10-15', days: 7 }])
})
