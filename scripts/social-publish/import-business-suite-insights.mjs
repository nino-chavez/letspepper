#!/usr/bin/env node
/**
 * Turn a Business Suite insights capture into SQL for the social-insights D1 database,
 * stored with source 'business_suite' beside (never merged into) the Graph API rows the
 * scheduler Worker's insights job writes. INSIGHTS.md owns the metric names and why the
 * two sources stay apart.
 *
 *   node scripts/social-publish/import-business-suite-insights.mjs <evidence-dir> --account 630 > import.sql
 *   pnpm exec wrangler d1 execute INSIGHTS_DB --remote \
 *     --config scripts/social-publish/worker/wrangler.jsonc --file import.sql
 *
 * <evidence-dir> holds the capture's daily-derived.json, daily-followers.json and
 * weekly-followers.json. The script refuses to write anything unless every week's daily
 * follows and unfollows add up to Business Suite's own weekly totals. A day Business Suite
 * showed as a dash is left out, not written as 0. Re-running the same capture is harmless:
 * each row upserts on (account, day, metric, source).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Business Suite series → stored metric name. The names say what Business Suite measured,
// which is not always the Graph API metric of the same idea: its views include Facebook
// crossposts, and its daily reach must never be summed into a period reach.
const DERIVED_SERIES = {
  views_including_facebook_crossposts: 'views_including_facebook_crossposts',
  reach_daily_do_not_sum_for_unique_period: 'reach',
  interactions: 'content_interactions',
  profile_visits: 'profile_visits',
  link_clicks: 'link_clicks',
  follows: 'follows',
}

// Audience > Trends prints "Unfollows", a zero-width space, then the count or a dash.
const UNFOLLOWS = /\nUnfollows\n​\n([\d,]+)\n/

const asCount = (v) => (Number.isFinite(v) ? Math.round(v) : null)

/** The rows to import, after the weekly check. Throws when a week does not reconcile. */
export function businessSuiteRows({ derived, followers, weekly }) {
  const rows = []
  for (const [series, metric] of Object.entries(DERIVED_SERIES)) {
    for (const [day, value] of Object.entries(derived[series]?.daily ?? {})) {
      const count = asCount(value)
      if (count != null) rows.push({ day, metric, value: count })
    }
  }
  for (const [day, capture] of Object.entries(followers)) {
    const match = UNFOLLOWS.exec(capture?.text ?? '')
    if (match) rows.push({ day, metric: 'unfollows', value: Number(match[1].replaceAll(',', '')) })
  }

  for (const week of weekly) {
    for (const metric of ['follows', 'unfollows']) {
      const sum = rows
        .filter((r) => r.metric === metric && r.day >= week.start && r.day <= week.end)
        .reduce((total, r) => total + r.value, 0)
      if (sum !== week[metric]) {
        throw new Error(`${metric} for ${week.start}–${week.end}: the days add up to ${sum}, Business Suite's weekly total is ${week[metric]}`)
      }
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day) || a.metric.localeCompare(b.metric))
}

/** The earliest capture time in the follower pages, used as when Business Suite was read. */
export function observedAt(followers) {
  const times = Object.values(followers).map((c) => c?.captured_at).filter(Boolean).sort()
  if (!times.length) throw new Error('daily-followers.json carries no captured_at times')
  return times[0]
}

const sqlString = (s) => `'${String(s).replaceAll("'", "''")}'`

/** One upsert statement carrying every row as a JSON literal. */
export function importSql({ account, rows, observed }) {
  return `INSERT INTO account_metric_days (account, day, metric, value, source, first_observed_at, last_observed_at)
SELECT ${sqlString(account)}, j.value ->> 'day', j.value ->> 'metric', j.value ->> 'value', 'business_suite', ${sqlString(observed)}, ${sqlString(observed)}
FROM json_each(${sqlString(JSON.stringify(rows))}) AS j WHERE true
ON CONFLICT (account, day, metric, source) DO UPDATE SET
  value = excluded.value, last_observed_at = excluded.last_observed_at;
`
}

function main(argv) {
  const dir = argv[0]
  const accountAt = argv.indexOf('--account')
  const account = accountAt > 0 ? argv[accountAt + 1] : null
  if (!dir || !account) {
    console.error('usage: import-business-suite-insights.mjs <evidence-dir> --account <slug>')
    process.exit(2)
  }
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
  const followers = read('daily-followers.json')
  const rows = businessSuiteRows({ derived: read('daily-derived.json'), followers, weekly: read('weekly-followers.json') })
  process.stdout.write(importSql({ account, rows, observed: observedAt(followers) }))
  const days = new Set(rows.map((r) => r.day))
  console.error(`${rows.length} values across ${days.size} days; weekly follows and unfollows reconcile`)
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2))
