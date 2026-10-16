/**
 * Canonical 630 analytics definitions. Pure ESM: usable by Workers and Node.
 * No credentials or observations belong here. The private 630 scorecard vendors
 * this file byte-for-byte with a pinned source commit and SHA-256 receipt.
 */
export const ANALYTICS_VERSION = '630-analytics-v1'
export const INSTAGRAM_TIMEZONE = 'America/Los_Angeles'
export const WEBSITE_TIMEZONE = 'America/Chicago'
export const INSTAGRAM_SETTLING_DAYS = 2
export const INSTAGRAM_DAY_METRICS = Object.freeze({ reach: 'reach', follows: 'follows_and_unfollows:FOLLOWER', unfollows: 'follows_and_unfollows:NON_FOLLOWER' })
export const WEBSITE_HANDOFF_EVENT = 'registration_link_clicked'

export const METRIC_DEFINITIONS = Object.freeze({
  'instagram.follows': { label: 'Follows', unit: 'follows', source: 'Instagram Graph API daily readings', timezone: INSTAGRAM_TIMEZONE, definition: 'Reported follows added across every day in the selected period.', denominator: null, limit: 'Counts do not identify people or explain why they followed.', action: 'Compare complete periods of equal length before investigating a change.' },
  'instagram.unfollows': { label: 'Unfollows', unit: 'unfollows', source: 'Instagram Graph API daily readings', timezone: INSTAGRAM_TIMEZONE, definition: 'Reported unfollows added across every day in the selected period.', denominator: null, limit: 'Counts cannot establish who left, aging out, bot status, bans, or hacking.', action: 'Inspect repeated changes alongside known club and season events; do not assign a cause from counts alone.' },
  'instagram.net_follows': { label: 'Net new follows', unit: 'follows', source: 'Instagram Graph API daily readings', timezone: INSTAGRAM_TIMEZONE, definition: 'Follows minus unfollows over the same complete period.', denominator: null, limit: 'This flow is separate from the change between current-follower snapshots. Missing either flow makes net change unavailable.', action: 'Read follows and unfollows separately: a small net change can hide movement in both directions.' },
  'instagram.typical_daily_reach': { label: 'Typical daily reach', unit: 'accounts per day', source: 'Instagram Graph API daily readings', timezone: INSTAGRAM_TIMEZONE, definition: 'The median daily reach across every day in the selected period.', denominator: null, limit: 'Daily unique reach cannot be added to produce period unique reach. Missing days prevent a complete-period answer.', action: 'Inspect the daily pattern and compare similar periods; a single high day is not a sustained improvement.' },
  'website.sessions': { label: 'Website visits', unit: 'visits', source: 'PostHog', timezone: WEBSITE_TIMEZONE, definition: 'Distinct nonempty anonymous session IDs with a pageview on 630volleyball.com during the selected complete days.', denominator: null, limit: 'A visit is a browser session, not a person. One person can make several visits. Internal and bot traffic are not reliably excluded.', action: 'Use visits as the denominator for registration handoff rates from the same dates and source.' },
  'website.handoff_sessions': { label: 'Visits with a registration handoff', unit: 'visits', source: 'PostHog', timezone: WEBSITE_TIMEZONE, definition: 'Website visits with a subsequent registration_link_clicked event to a LeagueApps program route or program ID within the same reporting window.', denominator: 'website.sessions', limit: 'A handoff is a click toward registration. It does not prove a completed registration, payment, or commitment.', action: 'Inspect the destination and program page when visitors reach this step. LeagueApps owns completed registrations.' },
  'website.instagram_sessions': { label: 'Visits arriving from Instagram', unit: 'visits', source: 'PostHog', timezone: WEBSITE_TIMEZONE, definition: 'Website visits whose session entry referrer is instagram.com or a subdomain, or whose entry utm_source is instagram or ig.', denominator: null, limit: 'Untagged in-app visits may appear as Direct. Arrival source does not establish which post caused a visit or registration.', action: 'Use consistent campaign tags on Instagram links and inspect the landing page.' },
  'website.instagram_handoff_sessions': { label: 'Instagram visits with a registration handoff', unit: 'visits', source: 'PostHog', timezone: WEBSITE_TIMEZONE, definition: 'Visits arriving from Instagram that also meet the registration handoff definition.', denominator: 'website.instagram_sessions', limit: 'This is observed website intent, not registrations attributed to Instagram. No follower handles are joined to website sessions.', action: 'Review the tagged landing page and its next step before changing the content plan.' },
})

export function calendarDay(now, timezone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now))
}
function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day
}
export function addDays(day, n) {
  if (!validDay(day) || !Number.isInteger(n)) throw new Error('Expected a calendar date and whole days')
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}
export function dayRange(start, end) {
  if (!validDay(start) || !validDay(end) || start > end) throw new Error('Invalid reporting dates')
  const length = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
  if (length > 3660) throw new Error('Reporting period is too long')
  return Array.from({ length }, (_, i) => addDays(start, i))
}
export function reportingWindow({ now = new Date(), days = 7, timezone = WEBSITE_TIMEZONE, settlingDays = 0 } = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 3660 || !Number.isInteger(settlingDays) || settlingDays < 0) throw new Error('Invalid reporting window')
  const end = addDays(calendarDay(now, timezone), -1 - settlingDays)
  const start = addDays(end, 1 - days)
  return { start, end, days: dayRange(start, end), previous: { start: addDays(start, -days), end: addDays(start, -1) }, timezone }
}
export function instagramWindow({ now = new Date(), days = 7 } = {}) {
  return reportingWindow({ now, days, timezone: INSTAGRAM_TIMEZONE, settlingDays: INSTAGRAM_SETTLING_DAYS })
}
export function median(values) {
  if (!values.length || !values.every(Number.isFinite)) return null
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const count = value => Number.isInteger(value) && value >= 0

/** Missing, invalid, or conflicting daily values never silently become zero. */
export function summarizeInstagramDays({ rows, days, previousDays = [] }) {
  const byDay = new Map()
  for (const row of rows) {
    const key = Object.keys(INSTAGRAM_DAY_METRICS).find(k => INSTAGRAM_DAY_METRICS[k] === row.metric)
    if (!key) continue
    const entry = byDay.get(row.day) ?? { day: row.day }
    if (Object.hasOwn(entry, key) && entry[key] !== row.value) throw new Error(`Conflicting ${key} readings for ${row.day}`)
    entry[key] = row.value
    byDay.set(row.day, entry)
  }
  const on = list => list.map(day => ({ day, ...Object.fromEntries(Object.keys(INSTAGRAM_DAY_METRICS).map(k => [k, count(byDay.get(day)?.[k]) ? byDay.get(day)[k] : null])) }))
  const series = on(days), previous = on(previousDays)
  const coverage = Object.fromEntries(Object.keys(INSTAGRAM_DAY_METRICS).map(key => {
    const missing = series.filter(r => !count(r[key])).map(r => r.day)
    return [key, { expected: days.length, recorded: days.length - missing.length, missing, complete: days.length > 0 && !missing.length }]
  }))
  const total = key => coverage[key].complete ? series.reduce((sum, r) => sum + r[key], 0) : null
  const follows = total('follows'), unfollows = total('unfollows')
  const comparable = coverage.reach.complete && previous.length === series.length && previous.every(r => count(r.reach))
  const typical = coverage.reach.complete ? median(series.map(r => r.reach)) : null
  const previousTypical = comparable ? median(previous.map(r => r.reach)) : null
  return { version: ANALYTICS_VERSION, series, previous, coverage, summary: { typical, previousTypical, comparable, ratio: comparable && previousTypical > 0 ? typical / previousTypical : null, follows, unfollows, net: count(follows) && count(unfollows) ? follows - unfollows : null }, followerInsight: followerInsight(series, previous) }
}

/** A shared answer, without an invented significance threshold or causal claim. */
export function followerInsight(current, previous = []) {
  const total = rows => rows.length && rows.every(r => ['follows', 'unfollows'].every(k => count(r[k])))
    ? rows.reduce((sum, r) => ({ follows: sum.follows + r.follows, unfollows: sum.unfollows + r.unfollows }), { follows: 0, unfollows: 0 }) : null
  const now = total(current), before = previous.length === current.length ? total(previous) : null
  if (!now) return { state: 'incomplete', heading: 'Check missing readings before acting.', detail: 'A full-period follower comparison needs both counts for every day.', action: 'Open Data status and check the missing dates. Missing does not mean zero.' }
  if (!before) return { state: 'baseline', heading: 'Use these counts as a baseline.', detail: 'An equally long, complete earlier period is unavailable. We cannot say whether departures increased.', action: 'Keep collecting complete periods. A net gain or loss alone does not explain who left or why.' }
  const follows = now.follows - before.follows, unfollows = now.unfollows - before.unfollows
  const change = (n, label) => n === 0 ? `${label} were unchanged` : `${Math.abs(n)} ${n > 0 ? 'more' : 'fewer'} ${label}`
  return { state: 'comparison', heading: follows === 0 && unfollows === 0 ? 'Period totals matched the previous period.' : `${change(follows, 'follows')}; ${change(unfollows, 'unfollows')}.`, current: now, previous: before,
    detail: `Compared with the previous ${previous.length} days. These differences do not establish a lasting pattern or explain why people left.`,
    action: unfollows > 0 ? 'Inspect the days with more departures and any known program or season changes. Counts alone do not justify changing the content plan.' : follows < 0 ? 'Inspect reach and the posts from these dates to investigate fewer arrivals. This does not establish that a particular post caused the change.' : 'Keep the current period as evidence and watch whether the pattern repeats. Do not change the content plan on these counts alone.' }
}

/** One row per visit before counting: handoff visits are a subset of pageview visits. */
export function websiteSummaryQuery(window = null) {
  if (window) dayRange(window.start, window.end)
  const at = day => `toDateTime('${day} 00:00:00', '${WEBSITE_TIMEZONE}')`
  const midnight = `toStartOfDay(now(), '${WEBSITE_TIMEZONE}')`
  const start = window ? at(window.start) : `${midnight} - INTERVAL 7 DAY`
  const end = window ? at(addDays(window.end, 1)) : midnight
  const handoff = `event = '${WEBSITE_HANDOFF_EVENT}' AND (properties.destination_host = '630volleyball.leagueapps.com') AND (match(toString(properties.destination_path), '^/[a-z-]+/[0-9]+(/|$|-)') OR match(toString(properties.program_id), '^[0-9]+$'))`
  return `SELECT count() AS visits, countIf(handoff) AS handoff_visits, countIf(instagram) AS instagram_visits, countIf(instagram AND handoff) AS instagram_handoff_visits
FROM (
  SELECT $session_id AS visit,
    countIf(${handoff}) > 0 AND maxIf(timestamp, ${handoff}) >= minIf(timestamp, event = '$pageview') AS handoff,
    max(lower(coalesce(session.$entry_utm_source, '')) IN ('instagram', 'ig') OR lower(coalesce(session.$entry_referring_domain, '')) = 'instagram.com' OR endsWith(lower(coalesce(session.$entry_referring_domain, '')), '.instagram.com')) AS instagram
  FROM events
  WHERE timestamp >= ${start} AND timestamp < ${end}
    AND properties.$host = '630volleyball.com'
    AND notEmpty(toString($session_id))
    AND event IN ('$pageview', '${WEBSITE_HANDOFF_EVENT}')
  GROUP BY visit
  HAVING countIf(event = '$pageview') > 0
)`
}
export function readWebsiteSummary(data) {
  const keys = ['visits', 'handoff_visits', 'instagram_visits', 'instagram_handoff_visits']
  if (data?.error || !Array.isArray(data?.columns) || !Array.isArray(data?.results) || data.results.length !== 1) throw new Error('Website query did not return one complete answer')
  const result = Object.fromEntries(keys.map(k => [k, data.results[0][data.columns.indexOf(k)]]))
  if (!keys.every(k => count(result[k]))) throw new Error('Website answer contains a missing or invalid count')
  if (result.handoff_visits > result.visits || result.instagram_visits > result.visits || result.instagram_handoff_visits > Math.min(result.instagram_visits, result.handoff_visits)) throw new Error('Website handoffs must be a subset of visits')
  return result
}
const WEBSITE_ANSWER = {
  heading: '{handoff_visits} of {visits} website visits reached a registration handoff.',
  detail: '{instagram_visits} visits arrived from Instagram; {instagram_handoff_visits} of those reached a registration handoff. These are visits, not people or completed registrations.',
  action: 'Inspect the landing pages and registration destinations. Use comparable periods before deciding what to change.',
  emptyAction: 'Check tracking and the reporting dates before interpreting a quiet period.',
}
const answerText = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key])

/** The saved PostHog table presents the same answer and guidance as the scorecard. */
export function websiteInsightQuery(window = null) {
  const quote = value => `'${value.replaceAll("'", "''")}'`
  const text = template => `concat(${template.split(/(\{\w+\})/g).filter(Boolean).map(part => /^\{/.test(part) ? `toString(${part.slice(1, -1)})` : quote(part)).join(', ')})`
  return `SELECT ${text(WEBSITE_ANSWER.heading)} AS answer,
  ${text(WEBSITE_ANSWER.detail)} AS context,
  if(visits = 0, ${quote(WEBSITE_ANSWER.emptyAction)}, ${quote(WEBSITE_ANSWER.action)}) AS next_step,
  visits, handoff_visits, instagram_visits, instagram_handoff_visits
FROM (
${websiteSummaryQuery(window)}
)`
}
export function websiteAnswer(summary) {
  if (!summary) return { state: 'incomplete', heading: 'Website results are unavailable.', detail: 'The source did not return a complete answer. Missing does not mean zero.', action: 'Check source health before making a website decision.' }
  const { visits, handoff_visits: handoffs, instagram_visits: ig, instagram_handoff_visits: igHandoffs } = summary
  return { state: 'recorded', heading: answerText(WEBSITE_ANSWER.heading, summary), detail: answerText(WEBSITE_ANSWER.detail, summary), action: visits === 0 ? WEBSITE_ANSWER.emptyAction : WEBSITE_ANSWER.action, handoffRate: visits > 0 ? handoffs / visits : null, instagramHandoffRate: ig > 0 ? igHandoffs / ig : null }
}
