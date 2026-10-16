#!/usr/bin/env node
/** Read-only real-data parity check. Credentials enter through environment only. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadDashboard } from './insights-dashboard/src/data.js'
import { ANALYTICS_VERSION, reportingWindow, websiteSummaryQuery, websiteInsightQuery, readWebsiteSummary, websiteAnswer } from './analytics-contract.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((v, i, a) => v.startsWith('--') ? [v.slice(2), a[i + 1]] : []).filter(x => x.length))
if (!args.scorecard || !args.output) throw new Error('Use --scorecard <build-weekly-scorecard.mjs> --output <private receipt.json> [--now <ISO>]')
const now = new Date(args.now ?? Date.now())
const scorecard = await import(pathToFileURL(resolve(args.scorecard)))
for (const key of ['INSTAGRAM_INSIGHTS_D1_TOKEN', 'POSTHOG_API_HOST', 'POSTHOG_PERSONAL_API_KEY']) if (!process.env[key]) throw new Error(`Missing ${key}`)
const cfUrl = 'https://api.cloudflare.com/client/v4/accounts/b6ffcf200d56bab5749e243f024658d2/d1/database/c192b5be-8142-4695-a37f-e92eeb0a12a0/query'
async function request(url, key, body) {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status}`)
  return response.json()
}
async function d1(sql, params) {
  assert.match(sql.trim(), /^SELECT\b/i, 'verification is read-only')
  const data = await request(cfUrl, process.env.INSTAGRAM_INSIGHTS_D1_TOKEN, { sql, params })
  if (!data.success || data.result?.[0]?.success === false || !Array.isArray(data.result?.[0]?.results)) throw new Error('D1 did not return a result table')
  return data.result[0].results
}
const db = {
  prepare(sql) { return { bind(...params) { return { sql, params, first: async () => (await d1(sql, params))[0] ?? null } } } },
  batch(statements) { return Promise.all(statements.map(async s => ({ results: await d1(s.sql, s.params) }))) },
}
const dashboard = await loadDashboard(db, { now })
const collected = await scorecard.collectInstagram({ windowDays: 7, instagram: { account: '630', cloudflareAccountId: 'b6ffcf200d56bab5749e243f024658d2', d1DatabaseId: 'c192b5be-8142-4695-a37f-e92eeb0a12a0', provisionalDays: 2, staleAfterDays: 3 } }, now.toISOString(), now)
assert.equal(collected.summary.week.start, dashboard.window.start)
assert.equal(collected.summary.week.end, dashboard.window.end)
for (const [reportKey, dashboardKey] of [['follows', 'follows'], ['unfollows', 'unfollows'], ['typicalReach', 'typical']]) assert.equal(collected.summary[reportKey], dashboard.summary[dashboardKey], reportKey)
assert.deepEqual(collected.summary.followerInsight, dashboard.followerInsight, 'same operator answer')
// Independent database arithmetic catches a shared implementation producing the same wrong answer.
const sql = `SELECT metric, COUNT(*) AS days, SUM(value) AS total FROM account_metric_days WHERE account = ?1 AND source = 'graph_api' AND day BETWEEN ?2 AND ?3 AND metric IN ('follows_and_unfollows:FOLLOWER','follows_and_unfollows:NON_FOLLOWER') GROUP BY metric`
const flows = await d1(sql, ['630', dashboard.window.start, dashboard.window.end])
for (const [key, metric] of [['follows', 'follows_and_unfollows:FOLLOWER'], ['unfollows', 'follows_and_unfollows:NON_FOLLOWER']]) {
  const row = flows.find(r => r.metric === metric)
  assert.equal(dashboard.summary[key], row?.days === dashboard.window.days.length ? row.total : null, 'independent D1 sum and coverage')
}
const window = reportingWindow({ now })
const query = websiteSummaryQuery(window)
const endpoint = `${process.env.POSTHOG_API_HOST.replace(/\/$/, '')}/api/projects/579364/query/`
const website = readWebsiteSummary(await request(endpoint, process.env.POSTHOG_PERSONAL_API_KEY, { query: { kind: 'HogQLQuery', query } }))
const posthog = await scorecard.collectPostHog({ posthog: { projectName: '630 Volleyball Website' } }, window, now.toISOString())
// The collector's canonical result is compared separately from legacy visitor/event rows.
assert.deepEqual(posthog.websiteSummary, website, 'scorecard and PostHog canonical website answer')
assert.ok(Array.isArray(posthog.byEntryChannel), 'arrival-channel query must succeed for release verification')
for (const [metric, field, filter] of [['visits', 'visits', () => true], ['handoff_visits', 'handoffVisits', () => true], ['instagram_visits', 'visits', r => r.network === 'Instagram'], ['instagram_handoff_visits', 'handoffVisits', r => r.network === 'Instagram']]) {
  assert.equal(posthog.byEntryChannel.filter(filter).reduce((sum, row) => sum + row[field], 0), website[metric], `arrival-channel sum: ${metric}`)
}
const savedAnswer = await request(endpoint, process.env.POSTHOG_PERSONAL_API_KEY, { query: { kind: 'HogQLQuery', query: websiteInsightQuery(window) } })
assert.deepEqual(readWebsiteSummary(savedAnswer), website)
for (const [column, key] of [['answer', 'heading'], ['context', 'detail'], ['next_step', 'action']]) assert.equal(savedAnswer.results[0][savedAnswer.columns.indexOf(column)], websiteAnswer(website)[key], `saved PostHog ${column}`)

const receipt = { version: ANALYTICS_VERSION, verifiedAt: new Date().toISOString(), clock: now.toISOString(), instagram: { window: dashboard.window, summary: dashboard.summary, answer: dashboard.followerInsight, sourceReadAt: dashboard.dailyReadAt, independentQuery: sql, independentRows: flows }, website: { window, query, summary: website, answer: websiteAnswer(website), channels: posthog.byEntryChannel }, checks: ['dashboard-scorecard dates', 'Instagram flow totals', 'independent D1 sums and coverage', 'identical follower explanation', 'PostHog-scorecard website counts', 'arrival-channel totals', 'identical saved PostHog written answer'], boundary: 'Read-only real source data. These are observations, not proof of registrations or causes.' }
await writeFile(args.output, JSON.stringify(receipt, null, 2) + '\n')
console.log(JSON.stringify({ receipt: args.output, instagram: dashboard.summary, website }))
