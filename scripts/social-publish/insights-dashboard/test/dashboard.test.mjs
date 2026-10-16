import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import worker from '../src/index.js'
import { sessionCookie, validSession, passphraseMatches, SESSION_DAYS } from '../src/auth.js'
import { QUERIES, loadDashboard, periodWindow, weeklyFollows, PROVISIONAL_DAYS } from '../src/data.js'
import { dashboardPage, escapeHtml } from '../src/page.js'

// Every number, ID and caption below is invented. This repository is public; 630's real
// Insights live only in the database.
const here = (p) => new URL(p, import.meta.url)
const MIGRATIONS = ['0001_instagram_insights.sql', '0002_stories_audience_online.sql']
  .map((name) => readFileSync(here(`../../worker/migrations/${name}`), 'utf8'))
const NOW = new Date('2026-10-16T15:00:00Z') // 10 a.m. Central; Oct 16 in Los Angeles
const PASSPHRASE = 'test passphrase four words'

function fakeD1() {
  const sqlite = new DatabaseSync(':memory:')
  for (const m of MIGRATIONS) sqlite.exec(m)
  const plain = (row) => (row ? { ...row } : null)
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    async first() { return plain(sqlite.prepare(sql).get(...args)) },
    async all() { return { results: sqlite.prepare(sql).all(...args).map(plain) } },
    exec() { return { results: sqlite.prepare(sql).all(...args).map(plain) } },
  })
  return { sqlite, prepare: (sql) => statement(sql), async batch(statements) { return statements.map((s) => s.exec()) } }
}

function day(offset) {
  const d = new Date(Date.UTC(2026, 8, 1 + offset))
  return d.toISOString().slice(0, 10)
}

/** Sep 1 – Oct 15 of invented daily totals, eight posts, two Stories, an audience, two runs. */
function seeded({ through = 44 } = {}) {
  const db = fakeD1()
  const metric = db.sqlite.prepare("INSERT INTO account_metric_days VALUES ('630', ?, ?, ?, 'graph_api', 't', 't')")
  for (let i = 0; i <= through; i += 1) {
    metric.run(day(i), 'reach', 1000 + i * 10)
    metric.run(day(i), 'views', 3000 + i * 20)
    metric.run(day(i), 'total_interactions', 50 + i)
    metric.run(day(i), 'follows_and_unfollows:FOLLOWER', 4)
    metric.run(day(i), 'follows_and_unfollows:NON_FOLLOWER', 3)
  }
  const media = db.sqlite.prepare("INSERT INTO media (media_id, account, published_at, media_type, media_product_type, permalink, caption, first_seen_at, last_seen_at) VALUES (?, '630', ?, ?, ?, ?, ?, 't', 't')")
  const snap = db.sqlite.prepare('INSERT INTO media_metric_snapshots VALUES (?, ?, ?, ?, ?)')
  const posts = [
    ['p1', '2026-10-14T23:00:00+0000', 'VIDEO', 'REELS', 900, 'Newest reel'],
    ['p2', '2026-10-01T23:00:00+0000', 'CAROUSEL_ALBUM', 'FEED', 2500, 'Carousel <script>alert(1)</script> & friends'],
    ['p3', '2026-09-20T23:00:00+0000', 'VIDEO', 'REELS', 4000, 'Most viewed reel'],
    ['p4', '2026-09-05T23:00:00+0000', 'IMAGE', 'FEED', 700, 'Early photo'],
  ]
  for (const [id, at, type, product, views, caption] of posts) {
    media.run(id, at, type, product, `https://www.instagram.com/p/${id}/`, caption)
    snap.run(id, '2026-10-15', 'views', views - 50, '2026-10-15T14:30:00.000Z')
    snap.run(id, '2026-10-16', 'views', views, '2026-10-16T14:30:00.000Z')
    snap.run(id, '2026-10-16', 'reach', Math.round(views / 2), '2026-10-16T14:30:00.000Z')
    snap.run(id, '2026-10-16', product === 'REELS' ? 'reels_skip_rate' : 'follows', product === 'REELS' ? 41.5 : 3, '2026-10-16T14:30:00.000Z')
  }
  // A later run that read only the like count (as the post backfill does for posts it
  // already read that day) must not hide the insights read earlier.
  snap.run('p3', '2026-10-16', 'like_count', 321, '2026-10-16T15:00:00.000Z')
  media.run('s1', '2026-10-15T18:00:00+0000', 'VIDEO', 'STORY', null, null)
  snap.run('s1', '2026-10-16', 'reach', 120, '2026-10-16T13:45:00.000Z')
  snap.run('s1', '2026-10-16', 'navigation:tap_forward', 40, '2026-10-16T13:45:00.000Z')
  media.run('s0', '2026-10-01T18:00:00+0000', 'VIDEO', 'STORY', null, null) // older than seven days
  const audience = db.sqlite.prepare("INSERT INTO audience_snapshots VALUES ('630', '2026-10-16', ?, ?, ?, 't')")
  for (let i = 1; i <= 12; i += 1) audience.run('city', `Example City ${i}, Illinois`, 200 - i)
  audience.run('age,gender', '13-17:F', 30)
  audience.run('age,gender', '13-17:M', 10)
  audience.run('age,gender', '35-44:F', 50)
  audience.run('age,gender', '35-44:M', 10)
  db.sqlite.prepare("INSERT INTO account_snapshots VALUES ('630', '2026-10-16', 1234, 100, 50, 't')").run()
  const run = db.sqlite.prepare("INSERT INTO sync_runs (account, job, trigger, started_at, finished_at, state, days_complete, days_failed, day_values_written, media_read) VALUES ('630', ?, 'cron', ?, ?, ?, 7, 0, 91, 4)")
  run.run('daily', '2026-10-16T14:30:00.000Z', '2026-10-16T14:30:20.000Z', 'ok')
  run.run('stories', '2026-10-16T13:45:00.000Z', '2026-10-16T13:45:05.000Z', 'partial')
  return db
}

test('the dashboard only reads: every statement is a SELECT', () => {
  for (const [name, sql] of Object.entries(QUERIES)) assert.match(sql.trim(), /^SELECT\b/i, name)
  const source = readFileSync(here('../src/data.js'), 'utf8')
  assert.doesNotMatch(source, /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/)
})

test('the entry module exports only its handler, as the Workers runtime requires', async () => {
  const entry = await import('../src/index.js')
  assert.deepEqual(Object.keys(entry), ['default'])
})

test('the dashboard config shares the database but never owns migrations', () => {
  const dashboard = readFileSync(here('../wrangler.jsonc'), 'utf8')
  const scheduler = readFileSync(here('../../worker/wrangler.jsonc'), 'utf8')
  const id = (config) => config.match(/"database_id":\s*"([^"]+)"/)[1]
  assert.equal(id(dashboard), id(scheduler))
  assert.doesNotMatch(dashboard, /"migrations_dir"/)
  assert.match(dashboard, /"binding":\s*"INSIGHTS_DB"/)
})

test('a period ends at the newest complete day and compares only with a fully covered period', async () => {
  assert.deepEqual(periodWindow('7', { first_day: '2026-09-01', last_day: '2026-10-15' }).previous, { start: '2026-10-02', end: '2026-10-08' })
  const week = await loadDashboard(seeded(), { period: '7', now: NOW })
  assert.equal(week.window.end, '2026-10-15', 'today (Oct 16) is never shown')
  assert.equal(week.series.length, 7)
  assert.deepEqual(week.series.filter((d) => d.provisional).map((d) => d.day), ['2026-10-14', '2026-10-15'])
  assert.equal(PROVISIONAL_DAYS, 2)
  assert.equal(week.summary.comparable, true)
  assert.ok(week.summary.ratio > 1)
  assert.equal(week.summary.typical, 1000 + 41 * 10, 'a typical day is the median: Oct 12 for Oct 9-15')
  assert.ok(week.summary.lately.ratio > 1, 'lately compares the last week with the one before')
  const month = await loadDashboard(seeded(), { period: '30', now: NOW })
  assert.equal(month.summary.comparable, false, 'Sep 1 history cannot cover the 30 days before Sep 16')
  assert.equal(month.summary.ratio, null)
  assert.equal(month.historyStart, '2026-09-01')
  const all = await loadDashboard(seeded(), { period: 'all', now: NOW })
  assert.equal(all.window.start, '2026-09-01')
  assert.equal(all.series.length, 45)
  for (const odd of ['forever', 'toString', 'constructor', '__proto__']) {
    const fallback = await loadDashboard(seeded(), { period: odd, now: NOW })
    assert.equal(fallback.period, '30', `${odd} falls back to 30 days`)
  }
})

test('a week with no reach still counts as recorded, and a zero never reads as missing', async () => {
  const db = seeded()
  db.sqlite.prepare("UPDATE account_metric_days SET value = 0 WHERE metric = 'reach' AND day BETWEEN '2026-09-30' AND '2026-10-06'").run()
  const data = await loadDashboard(db, { period: '7', now: NOW })
  assert.equal(data.summary.lately.before, 0)
  assert.equal(data.summary.lately.ratio, null)
  assert.match(dashboardPage(data, { nonce: 'n' }), /The week before reached none\./)
  const viaRoute = await worker.fetch(new Request('https://dash.example.test/?period=toString', { headers: { cookie: (await sessionCookie(PASSPHRASE)).split(';')[0] } }),
    { INSIGHTS_DB: seeded(), DASHBOARD_PASSPHRASE: PASSPHRASE })
  assert.equal(viaRoute.status, 200, 'an inherited name as the period does not crash the page')
})

test('follows add up by Monday-to-Sunday week and a missing day is flagged', () => {
  const days = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-11', '2026-10-12']
  const values = new Map([
    ['2026-10-04', { follows: 2, unfollows: 1 }], ['2026-10-05', { follows: 3, unfollows: 1 }],
    ['2026-10-06', { follows: 1 }], ['2026-10-11', { follows: 1, unfollows: 2 }], ['2026-10-12', { follows: 5, unfollows: 0 }],
  ])
  const weeks = weeklyFollows(days, values)
  assert.deepEqual(weeks.map((w) => [w.start, w.end, w.days, w.follows, w.unfollows, w.complete]), [
    ['2026-10-04', '2026-10-04', 1, 2, 1, false],
    ['2026-10-05', '2026-10-11', 3, 5, 3, false],
    ['2026-10-12', '2026-10-12', 1, 5, 0, false],
  ])
  const full = weeklyFollows(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'],
    new Map(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'].map((d) => [d, { follows: 1, unfollows: 1 }])))
  assert.deepEqual(full.map((w) => [w.days, w.complete]), [[7, true]], 'only a full, fully reported week is complete')
})

test('posts, Stories and audience load as the page shows them', async () => {
  const data = await loadDashboard(seeded(), { period: 'all', now: NOW })
  assert.deepEqual(data.posts.map((p) => p.id), ['p3', 'p2', 'p1', 'p4'], 'most viewed first')
  assert.equal(data.posts[0].metrics.views, 4000, 'the latest reading of each metric wins')
  assert.equal(data.posts[0].metrics.like_count, 321)
  assert.equal(data.posts[0].metrics.reach, 2000, 'a newer reading of another metric does not hide this one')
  assert.equal(data.posts.find((p) => p.id === 'p1').growing, true)
  assert.equal(data.posts.find((p) => p.id === 'p3').growing, false)
  assert.equal(data.summary.topPost.id, 'p3')
  assert.deepEqual(data.settledPosts.map((p) => p.id), ['p3', 'p2', 'p4'])
  assert.deepEqual(data.growingPosts.map((p) => p.id), ['p1'])
  assert.equal(data.stories[0].live, true, 'a Story under 24 hours old is still up')
  assert.equal(data.summary.follows, 45 * 4)
  assert.equal(data.summary.net, 45)
  assert.deepEqual(data.stories.map((s) => s.id), ['s1'], 'only the last seven days of Stories')
  assert.equal(data.audience.cities.length, 10)
  assert.equal(data.audience.cityCount, 12)
  assert.deepEqual(data.audience.ages, [{ age: '13-17', value: 40 }, { age: '35-44', value: 60 }])
  assert.deepEqual(data.audience.genders, { F: 80, M: 20, U: 0 })
  const week = await loadDashboard(seeded(), { period: '7', now: NOW })
  assert.deepEqual(week.posts.map((p) => p.id), ['p1'], 'a period shows only posts published in it')
  const empty = await loadDashboard(fakeD1(), { now: NOW })
  assert.equal(empty.empty, true)
})

test('the page escapes captions and says what it cannot compare', async () => {
  const data = await loadDashboard(seeded(), { period: '30', now: NOW })
  const html = dashboardPage(data, { nonce: 'abc' })
  assert.doesNotMatch(html, /<script>alert/)
  assert.match(html, /Carousel &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; friends/)
  assert.match(html, /<strong>Lately \(Oct 7–13\):<\/strong> a typical day reached <strong>[\d,]+<\/strong> accounts, <strong>[\d.]+×<\/strong> the week before/, 'lately leaves out the two provisional days')
  assert.match(html, /<strong>Last 30 days:<\/strong> a typical day reached/)
  assert.match(html, /a typical day reached <strong>[\d,]+<\/strong> accounts\. The 30 days before aren't fully recorded, so there's no comparison\./, 'no comparison without a fully recorded period before, and the page says why')
  assert.match(html, /<strong>1,234<\/strong> followers\./)
  assert.match(html, /<g class="partial">/, 'a week cut off by the period is drawn faded')
  assert.doesNotMatch(html, /Interactions/, 'every stat on a card is defined')
  assert.match(html, /The dashed end \(Oct 14 and Oct 15\) may still change/)
  assert.match(html, /stroke-dasharray/)
  assert.match(html, /80% women, 20% men\./)
  assert.match(html, />Example City 1</, 'Illinois cities drop the state')
  assert.doesNotMatch(html, /When followers are online<\/h2>/)
  assert.match(html, /Collab posts another account started don't appear here/)
  assert.match(html, /not registrations or committed athletes/)
  assert.match(html, /<script nonce="abc">/)
  assert.match(html, /\(partial\)/, 'a run that was not ok is named in the footer')
  const week = dashboardPage(await loadDashboard(seeded(), { period: '7', now: NOW }), { nonce: 'abc' })
  assert.match(week, /a typical day reached <strong>[\d,]+<\/strong> accounts, <strong>[\d.]+×<\/strong> the 7 days before\./)
  const all = dashboardPage(await loadDashboard(seeded(), { period: 'all', now: NOW }), { nonce: 'abc' })
  assert.match(all, /<strong>Since [A-Z][a-z]+ \d+:<\/strong> a typical day reached <strong>[\d,]+<\/strong> accounts\. Busiest day/, 'all recorded has nothing before it to compare')
  assert.match(week, /Lately \(Oct 7–13\)/, 'the 7-day view still loads both lately weeks')
  assert.equal(escapeHtml(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;')
})

// --- sign-in -------------------------------------------------------------------------

const env = (extra = {}) => ({ INSIGHTS_DB: seeded(), DASHBOARD_PASSPHRASE: PASSPHRASE, SIGN_IN_LIMIT: { limit: async () => ({ success: true }) }, ...extra })
const get = (path, headers = {}, e = env()) => worker.fetch(new Request(`https://dash.example.test${path}`, { headers }), e)
const post = (path, form, e = env()) => worker.fetch(new Request(`https://dash.example.test${path}`, { method: 'POST', body: new URLSearchParams(form) }), e)
const cookieFrom = (res) => res.headers.get('set-cookie').split(';')[0]

function assertHardened(res) {
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(res.headers.get('content-security-policy') ?? '', /default-src 'none'/)
}

test('a viewer signs in with the passphrase and stays signed in', async () => {
  const anonymous = await get('/')
  assertHardened(anonymous)
  assert.match(await anonymous.text(), /<label for="passphrase">/)
  const wrong = await post('/sign-in', { passphrase: 'not it' })
  assert.equal(wrong.status, 401)
  assertHardened(wrong)
  const right = await post('/sign-in', { passphrase: PASSPHRASE })
  assert.equal(right.status, 303)
  assert.match(right.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/)
  assert.match(right.headers.get('set-cookie'), new RegExp(`Max-Age=${SESSION_DAYS * 86400}`))
  const signedIn = await get('/?period=7', { cookie: cookieFrom(right) })
  assert.equal(signedIn.status, 200)
  assertHardened(signedIn)
  const csp = signedIn.headers.get('content-security-policy')
  const nonce = csp.match(/'nonce-([^']+)'/)[1]
  assert.match(await signedIn.text(), new RegExp(`<script nonce="${nonce}">`))
  const out = await post('/sign-out', {})
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/)
})

test('a tampered, expired or re-keyed session is refused', async () => {
  const cookie = (await sessionCookie(PASSPHRASE)).split(';')[0]
  const request = (c) => new Request('https://dash.example.test/', { headers: { cookie: c } })
  assert.equal(await validSession(request(cookie), PASSPHRASE), true)
  assert.equal(await validSession(request(cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))), PASSPHRASE), false)
  assert.equal(await validSession(request(cookie.replace(/v1\.\d+/, 'v1.99999999999')), PASSPHRASE), false, 'a changed expiry breaks the signature')
  assert.equal(await validSession(request(cookie), 'a new passphrase'), false, 'changing the passphrase signs everyone out')
  const old = (await sessionCookie(PASSPHRASE, Date.now() - (SESSION_DAYS + 1) * 86400000)).split(';')[0]
  assert.equal(await validSession(request(old), PASSPHRASE), false, 'expired')
  assert.equal(await passphraseMatches(PASSPHRASE, PASSPHRASE), true)
  assert.equal(await passphraseMatches('', PASSPHRASE), false)
})

test('without a passphrase nobody signs in; too many attempts are refused; other paths 404', async () => {
  const unset = await get('/', {}, env({ DASHBOARD_PASSPHRASE: undefined }))
  assert.equal(unset.status, 503)
  assert.match(await unset.text(), /not set up yet/)
  assert.equal((await post('/sign-in', { passphrase: '' }, env({ DASHBOARD_PASSPHRASE: undefined }))).status, 503)
  const limited = await post('/sign-in', { passphrase: PASSPHRASE }, env({ SIGN_IN_LIMIT: { limit: async () => ({ success: false }) } }))
  assert.equal(limited.status, 429)
  const missing = await get('/status')
  assert.equal(missing.status, 404)
  assertHardened(missing)
})
