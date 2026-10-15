import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { businessSuiteRows, observedAt, importSql } from '../import-business-suite-insights.mjs'

const MIGRATION = readFileSync(new URL('../worker/migrations/0001_instagram_insights.sql', import.meta.url), 'utf8')

// Audience > Trends text as the capture stores it: label, zero-width space, count or dash.
const trends = (follows, unfollows) => `Insights\nFollows\n​\n${follows}\n100%\nUnfollows\n​\n${unfollows}\n14.3%\nFollowers`

function capture() {
  return {
    derived: {
      views_including_facebook_crossposts: { daily: { '2026-10-06': 12540, '2026-10-07': 8087 } },
      reach_daily_do_not_sum_for_unique_period: { daily: { '2026-10-06': 4806, '2026-10-07': 3941 } },
      interactions: { daily: { '2026-10-06': 353 } },
      profile_visits: { daily: { '2026-10-06': 120 } },
      link_clicks: { daily: { '2026-10-06': 5 } },
      follows: { daily: { '2026-10-06': 6, '2026-10-07': 4 } },
    },
    followers: {
      '2026-10-06': { captured_at: '2026-10-15T18:42:36.749Z', text: trends(6, 6) },
      '2026-10-07': { captured_at: '2026-10-15T18:40:47.867Z', text: trends(4, '1,002') },
      '2026-10-08': { captured_at: '2026-10-15T18:43:00.000Z', text: trends('–', '–') },
    },
    weekly: [{ start: '2026-10-06', end: '2026-10-08', follows: 10, unfollows: 1008 }],
  }
}

test('rows carry Business Suite names, keep thousands, and leave dashes out', () => {
  const rows = businessSuiteRows(capture())
  const oct7 = Object.fromEntries(rows.filter((r) => r.day === '2026-10-07').map((r) => [r.metric, r.value]))
  assert.deepEqual(oct7, { follows: 4, reach: 3941, unfollows: 1002, views_including_facebook_crossposts: 8087 })
  assert.equal(rows.filter((r) => r.day === '2026-10-08').length, 0)
  assert.ok(rows.some((r) => r.metric === 'content_interactions' && r.value === 353))
})

test('a week that does not add up refuses the whole import', () => {
  const broken = capture()
  broken.weekly[0].unfollows = 1009
  assert.throws(() => businessSuiteRows(broken), /unfollows for 2026-10-06–2026-10-08: the days add up to 1008, Business Suite's weekly total is 1009/)
})

test('observedAt is the earliest capture time', () => {
  assert.equal(observedAt(capture().followers), '2026-10-15T18:40:47.867Z')
  assert.throws(() => observedAt({ a: {} }), /no captured_at/)
})

test('the SQL loads into the real schema, beside API rows, and re-runs cleanly', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(MIGRATION)
  db.prepare(`INSERT INTO account_metric_days VALUES ('630', '2026-10-06', 'reach', 4700, 'graph_api', 't', 't')`).run()
  const c = capture()
  const sql = importSql({ account: "630's", rows: businessSuiteRows(c), observed: observedAt(c.followers) })
  db.exec(sql)
  db.exec(sql)
  const reach = db.prepare("SELECT source, value FROM account_metric_days WHERE day = '2026-10-06' AND metric = 'reach' ORDER BY source").all().map((r) => ({ ...r }))
  assert.deepEqual(reach, [{ source: 'business_suite', value: 4806 }, { source: 'graph_api', value: 4700 }])
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM account_metric_days WHERE account = '630''s'").get().n, 11)
})
