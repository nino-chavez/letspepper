import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker from '../src/index.js'
import { REGISTRATIONS_CRON } from '../src/registrations.js'
import {
  INSIGHTS_CRON, STORIES_CRON, RUN_BUDGET, MAX_RANGE_DAYS, GRAPH_TIMEOUT_MS, DAY_METRICS, FOLLOW_METRIC, MEDIA_METRICS,
  reportDay, dayWindow, lookbackDays, readInsights, readAudience, readOnlineFollowers, classify, GraphError, alertFor,
  runInsights, runStories, runPostHistory, insightsStatus, POST_HISTORY_PAGES,
} from '../src/insights.js'

const here = (p) => new URL(p, import.meta.url)
// Every fixture keeps the shape of a response Meta returned live on 2026-10-15; the numbers,
// IDs and city names in it are invented, because this repository is public and the real
// values are 630's private Insights.
const fixture = (name) => JSON.parse(readFileSync(here(`./fixtures/insights/${name}.json`), 'utf8'))
const MIGRATIONS = ['0001_instagram_insights.sql', '0002_stories_audience_online.sql']
  .map((name) => readFileSync(here(`../migrations/${name}`), 'utf8'))
const IG = '17841411569230130'
const GRAPH = 'https://graph.facebook.com/v25.0'
const ACCOUNTS = {
  '630': { handle: '630volleyball', ig_user_id: IG, ig_token_binding: 'IG_630_ACCESS_TOKEN', insights: true },
  other: { handle: 'other.account', ig_user_id: '1', ig_token_binding: 'IG_OTHER', insights: false },
}
// 9:30 a.m. CDT on Oct 16: the lookback is Oct 9–15, and the five fixture posts fall inside
// the 14-day media window.
const NOW = new Date('2026-10-16T14:30:00Z')
const PROFILE = fixture('profile')
const POSTS = fixture('media-list').data
const STORIES = fixture('stories-list').data
const reelId = POSTS.find((m) => m.media_product_type === 'REELS').id
const feedId = POSTS.find((m) => m.media_product_type === 'FEED').id
// A daily run's fixed requests before any post insights: profile, two per day, two audience
// breakdowns, online hours, and the media list.
const DAILY_FIXED_REQUESTS = 1 + 2 * 7 + 2 + 1 + 1

/**
 * D1 stand-in: the real migration on an in-memory SQLite. Covers the slice of the D1
 * binding the insights job uses — prepare().bind().first() and batch() in one
 * transaction — and refuses anything else so a new call shape fails loudly here.
 */
function fakeD1() {
  const sqlite = new DatabaseSync(':memory:')
  for (const migration of MIGRATIONS) sqlite.exec(migration)
  // node:sqlite returns null-prototype rows; D1 returns plain objects.
  const plain = (row) => (row ? { ...row } : null)
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    async first() { return plain(sqlite.prepare(sql).get(...args)) },
    async all() { return { results: sqlite.prepare(sql).all(...args).map(plain) } },
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
 * A Graph API stand-in. `mode` is 'missing_scope' (the error Meta returned for a token
 * without insights), 'granted', or a function (url, init) => Response for a test that needs
 * something else. Records every call.
 */
function graphStub(mode = 'granted', { dayValue = 100 } = {}) {
  const calls = []
  const storyIds = new Set(STORIES.map((story) => story.id))
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    calls.push({ url, method: init.method || 'GET', signal: init.signal })
    if (url.hostname === 'ntfy.sh') return new Response('ok')
    if (typeof mode === 'function') return mode(url, init)
    const path = url.pathname.replace('/v25.0/', '')
    const metric = url.searchParams.get('metric')
    if (path === IG) return json(PROFILE)
    if (path === `${IG}/media`) return json(fixture('media-list'))
    if (path === `${IG}/stories`) return json(fixture('stories-list'))
    if (mode === 'missing_scope' && path.endsWith('/insights')) return json(fixture('missing-scope'), 400)
    if (path === `${IG}/insights`) {
      if (metric === 'follower_demographics') return json(fixture(url.searchParams.get('breakdown') === 'city' ? 'audience-city' : 'audience-age-gender'))
      if (metric === 'online_followers') return json(fixture('online-followers'))
      return json(metric === FOLLOW_METRIC ? followTotals(6, 6) : dayTotals(metric.split(','), dayValue))
    }
    const mediaId = path.replace('/insights', '')
    if (storyIds.has(mediaId)) return json(fixture(url.searchParams.get('breakdown') ? 'story-navigation' : 'story'))
    if (mediaId === reelId) return json(fixture('media-reel'))
    if (mediaId === feedId) return json(fixture('media-feed'))
    if (path.endsWith('/insights')) return json(mediaLifetime(metric.split(','), 50))
    return json({ error: { message: `unexpected path ${path}`, code: 100 } }, 400)
  }
  return { calls, fetchImpl }
}

const graphCalls = (calls) => calls.filter((c) => c.url.hostname === 'graph.facebook.com')
const ntfyCalls = (calls) => calls.filter((c) => c.url.hostname === 'ntfy.sh')
const envWith = (db, extra = {}) => ({ INSIGHTS_DB: db, IG_630_ACCESS_TOKEN: 'test-token', NTFY_TOPIC: 'test-topic', ...extra })
const collect = (env, fetchImpl, opts = {}) => runInsights(env, { accounts: ACCOUNTS, graph: GRAPH, now: NOW, fetchImpl, ...opts })
const stories = (env, fetchImpl, opts = {}) => runStories(env, { accounts: ACCOUNTS, graph: GRAPH, now: NOW, fetchImpl, ...opts })

test('the insights crons in wrangler.jsonc match INSIGHTS_CRON and STORIES_CRON', () => {
  const config = readFileSync(here('../wrangler.jsonc'), 'utf8')
  const crons = JSON.parse(config.match(/"crons":\s*(\[[^\]]*\])/)[1])
  assert.deepEqual(crons, ['0 * * * *', INSIGHTS_CRON, STORIES_CRON, REGISTRATIONS_CRON])
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
  assert.deepEqual(readInsights(mediaLifetime(['reels_skip_rate'], 41.5)), [{ metric: 'reels_skip_rate', value: 41.5 }], 'decimals are kept')
})

test("each response shape Meta returned reads back every metric it carries", () => {
  const raw = (name) => fixture(name).data
  const day = readInsights(fixture('day-sample'))
  assert.deepEqual(day.map((v) => v.metric).sort(), [...DAY_METRICS].sort())
  assert.deepEqual(day.map((v) => v.value), raw('day-sample').map((row) => row.total_value.value))
  assert.deepEqual(readInsights(fixture('follows-sample')).map((v) => v.metric), ['follows_and_unfollows:FOLLOWER', 'follows_and_unfollows:NON_FOLLOWER'])
  // Lifetime post insights come back as values[], one metric per requested name, in order.
  assert.deepEqual(readInsights(fixture('media-reel')).map((v) => v.metric), MEDIA_METRICS.REELS)
  assert.deepEqual(readInsights(fixture('media-feed')).map((v) => v.metric), MEDIA_METRICS.FEED)
  assert.deepEqual(readInsights(fixture('story')).map((v) => v.metric), MEDIA_METRICS.STORY)
  // The breakdown call repeats the navigation total beside its split; the Stories read keeps
  // only the split from it, because the total already came from the first call.
  assert.deepEqual(readInsights(fixture('story-navigation')).map((v) => v.metric).sort(),
    ['navigation', 'navigation:swipe_forward', 'navigation:tap_back', 'navigation:tap_exit', 'navigation:tap_forward'])
  const skipRate = readInsights(fixture('media-reel')).find((v) => v.metric === 'reels_skip_rate').value
  assert.ok(!Number.isInteger(skipRate), 'Meta reports skip rate with a decimal')
})

test('audience and online-hours responses become rows; a day Meta has not filled is skipped', () => {
  const cities = readAudience(fixture('audience-city'), 'city')
  assert.equal(cities.length, 45, 'Meta returns its top 45 cities')
  assert.ok(cities.every((row) => row.breakdown === 'city' && row.dimension.includes(',')))
  const ageGender = readAudience(fixture('audience-age-gender'), 'age,gender')
  assert.ok(ageGender.length > 0 && ageGender.every((row) => /^\d+(-\d+)?\+?:[FMU]$/.test(row.dimension)), 'age and gender join as 18-24:F')
  const days = fixture('online-followers').data[0].values
  const filled = days.filter((day) => Object.keys(day.value ?? {}).length)
  assert.ok(filled.length < days.length, 'the fixture includes the unfilled current day')
  const hours = readOnlineFollowers(fixture('online-followers'))
  assert.equal(hours.length, filled.length * 24)
  assert.ok(hours.every((row) => row.hour >= 0 && row.hour <= 23 && row.period_end.endsWith('+0000')))
  assert.deepEqual(readOnlineFollowers({ data: [] }), [])
})

test('classify reads Meta error codes, starting with the one Meta returned for this token', () => {
  const real = fixture('missing-scope').error
  assert.equal(classify(new GraphError(real, 400)), 'missing_scope')
  assert.equal(classify(new GraphError({ message: 'expired', code: 190 }, 400)), 'token_invalid')
  assert.equal(classify(new GraphError({ message: 'perm', code: 200 }, 403)), 'missing_scope')
  assert.equal(classify(new GraphError({ message: 'busy', code: 4 }, 400)), 'error')
  assert.equal(classify(new Error('anything else')), 'error')
})

test('each insights cron runs only its own job; the hourly publisher tick never touches them', async () => {
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
    assert.deepEqual(db.rows('SELECT job, trigger FROM sync_runs'), [{ job: 'daily', trigger: 'cron' }])

    pending.length = 0
    stub.calls.length = 0
    await worker.scheduled({ cron: STORIES_CRON }, envWith(db, { QUEUE: queue, ACTIVE_EVENTS: 'test-event' }), ctx)
    await Promise.all(pending)
    assert.deepEqual(kvReads, [], 'the Stories tick must not read publisher queues')
    assert.ok(graphCalls(stub.calls).every((c) => /\/stories$|\/insights$/.test(c.url.pathname)), 'the Stories tick reads only Stories')
    assert.deepEqual(db.rows("SELECT job, trigger FROM sync_runs WHERE job = 'stories'"), [{ job: 'stories', trigger: 'cron' }])

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
  assert.equal(run.followers, PROFILE.followers_count)
  assert.equal(run.dayValues, 0)
  assert.equal(run.audience, 0, 'audience needs the insights permission too')
  assert.match(run.detail, /\(#10\) Application does not have permission/)
  // One failed day stops the day loop: the same token fails every day the same way.
  assert.equal(graphCalls(stub.calls).filter((c) => c.url.pathname.endsWith(`${IG}/insights`)).length, 1)
  assert.deepEqual(db.rows('SELECT day, followers_count FROM account_snapshots'), [{ day: '2026-10-16', followers_count: PROFILE.followers_count }])
  assert.equal(db.rows('SELECT COUNT(*) AS n FROM media')[0].n, POSTS.length)
  const reel = POSTS.find((m) => m.id === reelId)
  assert.deepEqual(
    db.rows('SELECT metric, value FROM media_metric_snapshots WHERE media_id = ? ORDER BY metric', reelId),
    [{ metric: 'comments_count', value: reel.comments_count }, { metric: 'like_count', value: reel.like_count }],
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
  const reel = db.rows('SELECT metric, value FROM media_metric_snapshots WHERE media_id = ?', reelId)
  assert.ok(MEDIA_METRICS.REELS.every((m) => reel.some((r) => r.metric === m)))
  const skip = reel.find((r) => r.metric === 'reels_skip_rate').value
  assert.equal(skip, fixture('media-reel').data.find((row) => row.name === 'reels_skip_rate').values[0].value, 'the decimal survives storage')
  const feedCall = graphCalls(stub.calls).find((c) => c.url.pathname.endsWith(`/${feedId}/insights`))
  assert.equal(feedCall.url.searchParams.get('metric'), MEDIA_METRICS.FEED.join(','))
  // Captions are stored with each post.
  assert.equal(db.rows('SELECT caption FROM media WHERE media_id = ?', feedId)[0].caption, POSTS.find((m) => m.id === feedId).caption)
  // Audience and online hours are stored for the day read.
  assert.equal(run.audience, readAudience(fixture('audience-city'), 'city').length + readAudience(fixture('audience-age-gender'), 'age,gender').length)
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM audience_snapshots WHERE day = '2026-10-16' AND breakdown = 'city'")[0].n, 45)
  assert.equal(db.rows('SELECT COUNT(*) AS n FROM online_followers')[0].n, readOnlineFollowers(fixture('online-followers')).length)
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
  assert.equal(db.rows("SELECT COUNT(DISTINCT media_id) AS n FROM media_metric_snapshots WHERE metric = 'views'")[0].n, RUN_BUDGET - DAILY_FIXED_REQUESTS)
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

test('every Graph request carries a time limit, and a timeout is recorded as a failed read', async () => {
  const db = fakeD1()
  const stub = graphStub((url, init) => {
    assert.ok(init.signal instanceof AbortSignal, 'each request carries an abort signal')
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
  })
  const { accounts: [run] } = await collect(envWith(db), stub.fetchImpl)
  assert.equal(run.state, 'error')
  assert.match(db.rows('SELECT detail FROM sync_runs')[0].detail, new RegExp(`no answer within ${GRAPH_TIMEOUT_MS / 1000} seconds`))
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

test('alerts fire on a change of state only, and a token problem alerts from the daily job alone', () => {
  assert.equal(alertFor({ handle: 'a', previous: null, state: 'ok' }), null)
  assert.equal(alertFor({ handle: 'a', previous: 'ok', state: 'ok' }), null)
  assert.match(alertFor({ handle: 'a', previous: 'ok', state: 'token_invalid' }).title, /expired or revoked/)
  assert.match(alertFor({ handle: 'a', previous: 'missing_scope', state: 'ok' }).message, /daily Instagram insights read.*"missing_scope"/)
  assert.equal(alertFor({ handle: 'a', previous: null, state: 'partial', detail: 'x' }).priority, 'default')
  assert.equal(alertFor({ handle: 'a', previous: 'ok', state: 'token_invalid', job: 'stories' }), null)
  assert.equal(alertFor({ handle: 'a', previous: 'ok', state: 'missing_scope', job: 'stories' }), null)
  assert.match(alertFor({ handle: 'a', previous: 'ok', state: 'error', job: 'stories' }).title, /the Stories read failed/)
  assert.match(alertFor({ handle: 'a', previous: 'error', state: 'ok', job: 'stories' }).message, /hourly Stories read/)
})

test('the Stories job saves each live Story with its totals and navigation split', async () => {
  const db = fakeD1()
  const stub = graphStub('granted')
  const { accounts: [run] } = await stories(envWith(db), stub.fetchImpl)
  assert.equal(run.job, 'stories')
  assert.equal(run.state, 'ok')
  assert.equal(run.mediaRead, STORIES.length)
  assert.equal(graphCalls(stub.calls).length, 1 + 2 * STORIES.length)
  const saved = db.rows("SELECT media_id, media_product_type, caption FROM media ORDER BY media_id")
  assert.ok(saved.every((m) => m.media_product_type === 'STORY' && m.caption === null))
  const metrics = db.rows('SELECT metric FROM media_metric_snapshots WHERE media_id = ?', STORIES[0].id).map((r) => r.metric)
  for (const metric of [...MEDIA_METRICS.STORY, 'navigation:tap_forward', 'navigation:tap_exit']) assert.ok(metrics.includes(metric), metric)
  assert.deepEqual(db.rows('SELECT job, days_complete FROM sync_runs'), [{ job: 'stories', days_complete: 0 }])

  // A missing permission is the daily job's alert to send, not the hourly one's.
  const blocked = graphStub('missing_scope')
  const { accounts: [noScope] } = await stories(envWith(db), blocked.fetchImpl)
  assert.equal(noScope.state, 'missing_scope')
  assert.equal(ntfyCalls(blocked.calls).length, 0)
  // When the token comes back, the Stories job compares with its last non-token run, so the
  // recovery alert comes from the daily job alone; a real Stories failure still alerts.
  const recovered = graphStub('granted')
  await stories(envWith(db), recovered.fetchImpl)
  assert.equal(ntfyCalls(recovered.calls).length, 0, 'no second recovery alert')
  await stories(envWith(db), graphStub('missing_scope').fetchImpl)
  const broken = graphStub((url) => url.pathname.endsWith('/stories') ? json({ error: { message: 'Service temporarily unavailable', code: 2 } }, 503) : json({ data: [] }))
  const { accounts: [failed] } = await stories(envWith(db), broken.fetchImpl)
  assert.equal(failed.state, 'error')
  assert.equal(failed.previous, 'ok', 'the token-state run in between is skipped')
  assert.equal(ntfyCalls(broken.calls).length, 1, 'a real Stories failure still alerts')
  // No live Story is a clean run with nothing to save.
  const none = graphStub((url) => url.pathname.endsWith('/stories') ? json({ data: [] }) : json({ error: { message: 'unexpected', code: 100 } }, 400))
  const { accounts: [empty] } = await stories(envWith(fakeD1()), none.fetchImpl)
  assert.equal(empty.state, 'ok')
  assert.equal(empty.mediaRead, 0)
})

// A post list in Meta's paged shape: newest first, one post every 12 hours from NOW, split
// into pages of 50 linked by cursors.
function pagedPosts(count) {
  const posts = Array.from({ length: count }, (_, i) => ({
    id: `8${String(i).padStart(5, '0')}`, timestamp: new Date(NOW.getTime() - (i + 1) * 12 * 3600000).toISOString().replace('.000Z', '+0000'),
    media_type: 'VIDEO', media_product_type: 'REELS', permalink: null, caption: `Post ${i}`, like_count: i, comments_count: 0,
  }))
  return (url) => {
    const page = Number(url.searchParams.get('after') ?? 0)
    const data = posts.slice(page * 50, page * 50 + 50)
    const more = page * 50 + 50 < posts.length
    return json({ data, paging: { cursors: { before: 'b', after: String(page + 1) }, ...(more ? { next: 'https://graph.facebook.com/next-page' } : {}) } })
  }
}

test('the post backfill pages back to its start day, then resumes without re-reading', async () => {
  const db = fakeD1()
  const list = pagedPosts(120)
  const stub = graphStub((url) => url.pathname.endsWith(`${IG}/media`) ? list(url) : graphStub('granted').fetchImpl(url.toString()))
  // Since Sep 20 (LA) with one post every 12 hours from Oct 16: posts 0–51 qualify, and
  // the 52nd page entry is the first older one.
  const first = await runPostHistory(envWith(db), { accounts: ACCOUNTS, graph: GRAPH, since: '2026-09-20', now: NOW, fetchImpl: stub.fetchImpl })
  const run = first.accounts[0]
  const listCalls = graphCalls(stub.calls).filter((c) => c.url.pathname.endsWith(`${IG}/media`))
  assert.deepEqual(listCalls.map((c) => c.url.searchParams.get('after')), [null, '1'], 'the second page follows the cursor')
  assert.equal(run.postsListed, 52)
  assert.equal(run.job, 'range')
  assert.equal(run.state, 'partial', 'the budget runs out before every post is read')
  assert.equal(run.postsRead, RUN_BUDGET - 2)
  assert.equal(run.postsRemaining, 52 - (RUN_BUDGET - 2))
  assert.equal(db.rows("SELECT COUNT(*) AS n FROM media WHERE caption LIKE 'Post %'")[0].n, 52)
  assert.deepEqual(db.rows('SELECT first_day, last_day FROM sync_runs'), [{ first_day: '2026-09-20', last_day: '2026-10-16' }])

  const second = graphStub((url) => url.pathname.endsWith(`${IG}/media`) ? list(url) : graphStub('granted').fetchImpl(url.toString()))
  const { accounts: [rest] } = await runPostHistory(envWith(db), { accounts: ACCOUNTS, graph: GRAPH, since: '2026-09-20', now: NOW, fetchImpl: second.fetchImpl })
  assert.equal(rest.state, 'ok')
  assert.equal(rest.postsRead, 52 - (RUN_BUDGET - 2))
  assert.equal(rest.postsRemaining, 0)
  const insightCalls = graphCalls(second.calls).filter((c) => c.url.pathname.endsWith('/insights'))
  assert.equal(insightCalls.length, rest.postsRead, 'posts read earlier the same day are skipped')
  assert.equal(db.rows("SELECT COUNT(DISTINCT media_id) AS n FROM media_metric_snapshots WHERE metric = 'reach'")[0].n, 52)
  assert.equal(ntfyCalls([...stub.calls, ...second.calls]).length, 0, 'a backfill never alerts')
})

test('the post backfill stops listing at its page limit and says so', async () => {
  const db = fakeD1()
  const list = pagedPosts(POST_HISTORY_PAGES * 50 + 10)
  const stub = graphStub((url) => url.pathname.endsWith(`${IG}/media`) ? list(url) : json({ error: { message: 'not reached', code: 100 } }, 400))
  const { accounts: [run] } = await runPostHistory(envWith(db), { accounts: ACCOUNTS, graph: GRAPH, since: '2025-01-01', now: NOW, fetchImpl: stub.fetchImpl })
  assert.equal(run.postsListed, POST_HISTORY_PAGES * 50)
  assert.match(run.detail, new RegExp(`more than ${POST_HISTORY_PAGES * 50} posts since 2025-01-01`))
})

test('migration 0002 labels runs written before it by the job that wrote them', () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(MIGRATIONS[0])
  const insert = sqlite.prepare(`INSERT INTO sync_runs (account, trigger, started_at, finished_at, state, first_day, last_day,
    days_complete, days_failed, day_values_written, media_read) VALUES ('630', 'manual', ?, ?, 'ok', ?, ?, 7, 0, 91, 12)`)
  insert.run('2026-10-16T02:56:53.056Z', '2026-10-16T02:57:08.823Z', '2026-10-08', '2026-10-14')
  insert.run('2026-10-16T02:57:09.568Z', '2026-10-16T02:57:27.012Z', '2026-09-01', '2026-09-22')
  insert.run('2026-10-16T03:06:51.000Z', '2026-10-16T03:07:03.000Z', '2026-09-23', '2026-10-07')
  sqlite.exec(MIGRATIONS[1])
  assert.deepEqual(sqlite.prepare('SELECT job FROM sync_runs ORDER BY id').all().map((r) => r.job), ['daily', 'range', 'range'])
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
    assert.equal(status['630'].latestSnapshot.followers_count, PROFILE.followers_count)
    assert.equal(status['630'].lastStoriesRun, null)
    assert.equal(status.other, undefined)
    const ranStories = await (await call('/insights/stories?key=trigger')).json()
    assert.equal(ranStories.accounts[0].job, 'stories')
    assert.equal((await call('/insights/stories?key=wrong')).status, 403)
    assert.equal((await call('/insights/posts?key=wrong&since=2026-09-01')).status, 403)
    assert.equal((await call('/insights/posts?key=trigger&since=2099-01-01')).status, 400)
    assert.equal((await call('/insights/posts?key=trigger')).status, 400, 'since is required')
    const after = await (await call('/insights/status?key=trigger')).json()
    assert.equal(after['630'].lastStoriesRun.trigger, 'manual')
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
