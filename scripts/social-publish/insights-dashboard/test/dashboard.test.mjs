import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import worker from '../src/index.js'
import { sessionCookie, validSession, passphraseMatches, SESSION_DAYS } from '../src/auth.js'
import { QUERIES, loadDashboard, periodWindow } from '../src/data.js'
import { dashboardPage, escapeHtml } from '../src/page.js'
import { fakeD1, seeded, NOW, PASSPHRASE } from './fixtures.mjs'
const here = p => new URL(p, import.meta.url)
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

test('calendar windows hold their dates when collection stops; two recent days stay outside comparison', async () => {
  assert.equal(periodWindow('7',{first_day:'2026-09-01',last_day:'2026-10-10'},'2026-10-16').end,'2026-10-13')
  const week=await loadDashboard(seeded({through:39}),{period:'7',now:NOW})
  assert.deepEqual(week.window.previous,{start:'2026-09-30',end:'2026-10-06'})
  assert.equal(week.window.start,'2026-10-07');assert.equal(week.window.end,'2026-10-13')
  assert.deepEqual(week.coverage.reach.missing,['2026-10-11','2026-10-12','2026-10-13'])
  assert.equal(week.summary.typical,null);assert.equal(week.summary.ratio,null)
  const full=await loadDashboard(seeded(),{now:NOW})
  assert.equal(full.summary.typical,1390);assert.equal(full.summary.previousTypical,1320)
  assert.equal(full.series.length,7)
  for(const invalid of ['forever','toString','__proto__','constructor'])assert.equal((await loadDashboard(seeded(),{period:invalid,now:NOW})).period,'7')
})
test('follower totals require every day for each metric, with zero distinguished from missing', async () => {
  const db=seeded()
  db.sqlite.exec("DELETE FROM account_metric_days WHERE day='2026-10-10' AND metric='follows_and_unfollows:NON_FOLLOWER'")
  const d=await loadDashboard(db,{now:NOW})
  assert.equal(d.summary.follows,28);assert.equal(d.summary.unfollows,null);assert.equal(d.summary.net,null)
  assert.deepEqual(d.coverage.unfollows.missing,['2026-10-10'])
  assert.equal(d.summary.comparable,true,'missing unfollows do not invalidate reach')
  db.sqlite.exec("UPDATE account_metric_days SET value=0 WHERE metric='follows_and_unfollows:FOLLOWER'")
  assert.equal((await loadDashboard(db,{now:NOW})).summary.follows,0)
})
test('zero comparison baseline has no percentage; Business Suite never fills a Graph gap',async()=>{
  const db=seeded()
  db.sqlite.exec("UPDATE account_metric_days SET value=0 WHERE metric='reach' AND day BETWEEN '2026-09-30' AND '2026-10-06'")
  let d=await loadDashboard(db,{now:NOW});assert.equal(d.summary.previousTypical,0);assert.equal(d.summary.ratio,null)
  db.sqlite.exec("UPDATE account_metric_days SET source='business_suite' WHERE day='2026-10-10' AND metric='reach'")
  d=await loadDashboard(db,{now:NOW});assert.equal(d.summary.comparable,false);assert.deepEqual(d.coverage.reach.missing,['2026-10-10'])
})
test('all recorded has no invented previous period; sparse and empty states keep other sections',async()=>{
  const d=await loadDashboard(seeded(),{period:'all',now:NOW})
  assert.equal(d.window.start,'2026-09-01');assert.equal(d.window.end,'2026-10-13');assert.equal(d.previous.length,0)
  const db=seeded();db.sqlite.exec('DELETE FROM account_metric_days')
  const empty=await loadDashboard(db,{period:'all',now:NOW})
  assert.equal(empty.empty,true);assert.equal(empty.window,null);assert.equal(empty.stories.length,1);assert.equal(empty.audience.cityCount,12)
  assert.equal((await loadDashboard(fakeD1(),{now:NOW})).empty,true)
})
test('posts preserve each metric timestamp, absent metrics, publication boundaries and independent windows',async()=>{
  const db=seeded()
  db.sqlite.exec("INSERT INTO media VALUES ('no-metrics','630','2026-10-15T00:00:00Z','IMAGE','FEED',NULL,'2026-10-15T00:00:00Z','2026-10-15T00:00:00Z','Missing readings')")
  const d=await loadDashboard(db,{now:NOW,postsPeriod:'all'})
  const p=d.posts.find(p=>p.id==='p3')
  assert.equal(p.metrics.views,4000);assert.equal(p.metrics.like_count,321)
  assert.equal(p.observedAt.views,'2026-10-16T14:30:00.000Z');assert.equal(p.observedAt.like_count,'2026-10-16T15:00:00.000Z')
  assert.equal(Object.keys(d.posts.find(p=>p.id==='no-metrics').metrics).length,0)
  assert.equal(d.overviewPosts.length,0,'publication within the selected settled week only')
  const month=await loadDashboard(db,{period:'30',now:NOW})
  assert.ok(month.overviewPosts.some(p=>p.id==='p2'));assert.ok(!month.overviewPosts.some(p=>p.id==='p1'))
  assert.ok(month.posts.some(p=>p.id==='p1'),'Posts includes recent publications through today')
  assert.equal(d.stories[0].metrics.link_clicks,0);assert.equal(d.stories[0].metrics['navigation:tap_exit'],undefined)
  assert.equal(d.stories[0].metrics['navigation:tap_forward'],40);assert.equal(d.stories[0].metrics['navigation:swipe_forward'],12)
})
test('failure cannot replace the last successful completion and overdue uses the actual schedule',async()=>{
  const db=seeded()
  db.sqlite.exec("INSERT INTO sync_runs(account,job,trigger,started_at,finished_at,state,days_complete,days_failed,day_values_written,media_read) VALUES('630','daily','cron','2026-10-17T14:30:00Z','2026-10-17T14:31:00Z','token_invalid',0,7,0,0)")
  const d=await loadDashboard(db,{now:new Date('2026-10-17T16:00:00Z')})
  assert.equal(d.runs.daily.attempt.state,'token_invalid');assert.equal(d.runs.daily.success.finished_at,'2026-10-16T14:30:20.000Z')
  assert.equal(d.runs.daily.overdue,true);assert.equal(d.runs.daily.needsAttention,true)
  assert.equal(d.runs.daily.nextAt,'2026-10-18T14:30:00.000Z')
  const winter=await loadDashboard(db,{now:new Date('2026-11-02T13:00:00Z')})
  assert.equal(winter.runs.daily.nextAt,'2026-11-02T14:30:00.000Z')
})
test('malicious captions stay JSON data; database errors have a usable private error state',async()=>{
  const d=await loadDashboard(seeded(),{period:'30',now:NOW})
  d.posts[0].caption='</script><script>globalThis.attack=true</script>'
  const html=dashboardPage(d,{nonce:'abc'})
  assert.doesNotMatch(html,/<script>globalThis.attack/);assert.match(html,/\\u003c\/script>/)
  assert.equal((html.match(/<script /g)??[]).length,1)
  assert.equal(escapeHtml(`"'<>&`),'&quot;&#39;&lt;&gt;&amp;')
  const res=await get('/',{cookie:(await sessionCookie(PASSPHRASE)).split(';')[0]},env({INSIGHTS_DB:{prepare(){throw new Error('private database detail')}}}))
  assert.equal(res.status,503);assertHardened(res)
  const body=await res.text();assert.match(body,/Results could not be loaded/);assert.doesNotMatch(body,/private database detail/)
})
