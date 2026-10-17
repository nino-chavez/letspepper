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
  'leagueapps.reserved_registrations': { label: 'Registrations with reserved spots', unit: 'registrations', source: 'LeagueApps private registration export', timezone: WEBSITE_TIMEZONE, definition: 'Participant registrations created during the selected complete days that currently have a reserved spot in LeagueApps. Each registration is counted once. Staff, team-only entries, deleted entries, and voided or refunded entries are excluded.', denominator: null, limit: 'All channels and programs. Counts registrations, not unique athletes. A reserved spot does not prove full payment or season commitment. Staff-created entries and roster imports can affect the count. Website and Instagram attribution is not established.', action: 'Review pending entries in LeagueApps. Compare program openings and roster uploads before interpreting the week-to-week change.' },
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
export function websiteVisitsQuery(window = null, { channels = false } = {}) {
  if (window) dayRange(window.start, window.end)
  const at = day => `toDateTime('${day} 00:00:00', '${WEBSITE_TIMEZONE}')`
  const midnight = `toStartOfDay(now(), '${WEBSITE_TIMEZONE}')`
  const start = window ? at(window.start) : `${midnight} - INTERVAL 7 DAY`
  const end = window ? at(addDays(window.end, 1)) : midnight
  const handoff = `event = '${WEBSITE_HANDOFF_EVENT}' AND (properties.destination_host = '630volleyball.leagueapps.com') AND (match(toString(properties.destination_path), '^/[a-z-]+/[0-9]+(/|$|-)') OR match(toString(properties.program_id), '^[0-9]+$'))`
  return `SELECT $session_id AS visit,
    countIf(${handoff}) > 0 AND maxIf(timestamp, ${handoff}) >= minIf(timestamp, event = '$pageview') AS handoff,
    max(lower(coalesce(session.$entry_utm_source, '')) IN ('instagram', 'ig') OR lower(coalesce(session.$entry_referring_domain, '')) = 'instagram.com' OR endsWith(lower(coalesce(session.$entry_referring_domain, '')), '.instagram.com')) AS instagram${channels ? `,\n    max(coalesce(session.$channel_type, '')) AS channel,\n    max(lower(coalesce(session.$entry_utm_source, '')) IN ('facebook', 'fb') OR lower(coalesce(session.$entry_referring_domain, '')) = 'facebook.com' OR endsWith(lower(coalesce(session.$entry_referring_domain, '')), '.facebook.com')) AS facebook` : ''}
  FROM events
  WHERE timestamp >= ${start} AND timestamp < ${end}
    AND properties.$host = '630volleyball.com'
    AND notEmpty(toString($session_id))
    AND event IN ('$pageview', '${WEBSITE_HANDOFF_EVENT}')
  GROUP BY visit
  HAVING countIf(event = '$pageview') > 0`
}
export function websiteSummaryQuery(window = null) {
  return `SELECT count() AS visits, countIf(handoff) AS handoff_visits, countIf(instagram) AS instagram_visits, countIf(instagram AND handoff) AS instagram_handoff_visits\nFROM (\n${websiteVisitsQuery(window)}\n)`
}
export function websiteEntryChannelQuery(window) {
  return `SELECT channel, multiIf(instagram, 'Instagram', facebook, 'Facebook', '') AS network, count() AS visits, countIf(handoff) AS handoff_visits\nFROM (\n${websiteVisitsQuery(window, {channels:true})}\n) GROUP BY channel, network`
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

// Aggregates only. Never persist the input rows, identifiers, or this in-memory map.
export const REGISTRATION_EVENT = '630_leagueapps_registration_snapshot'
export const REGISTRATION_VERSION = '630-registrations-v2'
export const REGISTRATION_HELP = METRIC_DEFINITIONS['leagueapps.reserved_registrations']
const registrationBuckets = ['reserved', 'pending', 'waitlist', 'excluded', 'other']
export const REGISTRATION_GROUPS = Object.freeze({ bookings: 'Clinics, camps & tryouts', setup: 'Team & roster setup', commitments: 'Season acceptances & commitments', unclassified: 'Needs classification' })
// Program IDs, not editable names, distinguish a tryout from a team acceptance.
// LeagueApps metadata and program descriptions checked 2026-10-16. New classes
// and camps have a safe type fallback; ambiguous club teams remain unclassified.
export const REGISTRATION_FAMILIES = Object.freeze({
  girls_ms: { label: 'Girls middle-school fall clinics', group: 'bookings', masters: [5121753] },
  girls_hs: { label: 'Girls high-school fall clinics', group: 'bookings', masters: [5121283] },
  tryouts: { label: 'Season tryouts', group: 'bookings', masters: [4937480] },
  breeze_tryout: { label: 'Breeze women’s tryout', group: 'bookings', programs: [5123249] },
  volleykids: { label: 'VolleyKids', group: 'bookings', masters: [5121892] },
  thanksgiving_hs_boys: { label: 'Thanksgiving: high-school boys', group: 'bookings', programs: [5171727] },
  thanksgiving_ms_boys: { label: 'Thanksgiving: middle-school boys', group: 'bookings', programs: [5171697] },
  thanksgiving_hs_girls: { label: 'Thanksgiving: high-school girls', group: 'bookings', programs: [5171728] },
  boys_hs_team: { label: 'Boys high-school team acceptance', group: 'setup', programs: [5156173] },
  boys_ms_team: { label: 'Boys middle-school team acceptance', group: 'setup', programs: [5156174] },
  team_setup: { label: 'Other season team setup', group: 'setup', masters: [5156167] },
  season_invoices: { label: 'Season invoices, including strength training', group: 'setup', masters: [5184029] },
  season_acceptance: { label: 'Season acceptance', group: 'commitments', masters: [4937433] },
  breeze_commitment: { label: 'Breeze commitment fee', group: 'commitments', programs: [5123247] },
  other_clinics: { label: 'Other classes and clinics', group: 'bookings', types: ['CLASS'] },
  other_camps: { label: 'Other camps', group: 'bookings', types: ['CAMP'] },
  unclassified: { label: 'Programs needing classification', group: 'unclassified' },
})
export function registrationFamily(row) {
  for (const field of ['programs', 'masters', 'types']) {
    const value = field === 'programs' ? row.programId : field === 'masters' ? row.masterProgramId : row.programType
    const found = Object.entries(REGISTRATION_FAMILIES).find(([, family]) => family[field]?.includes(value))
    if (found) return found[0]
  }
  return 'unclassified'
}
// LeagueApps program dates are calendar labels encoded at midnight Eastern.
// Converting those labels to Central incorrectly moves them to the previous day.
const programDay = value => Number.isSafeInteger(value) && value > 0 ? new Date(value).toISOString().slice(0, 10) : null
const emptyRegistrationCounts = () => Object.fromEntries(registrationBuckets.map(key => [key, 0]))
const cohort = () => ({ ...emptyRegistrationCounts(), people: new Set(), missingIdentity: 0, endedBeforeCurrent: 0, future: 0, datesMissing: 0, openedInPeriod: 0 })
const finishCohort = ({ people, ...values }) => ({ ...values, athletes: values.missingIdentity ? null : people.size })
export function createRegistrationRollup(window = reportingWindow()) {
  const rows = new Map()
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: WEBSITE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
  return {
    add(row) {
      // Refuse schema drift rather than treating a missing flag as "not staff".
      if (![0, 1, false, true].includes(row.isStaff) || typeof row.deleted !== 'boolean') throw new Error('LeagueApps participant flags are invalid')
      if (!Number.isSafeInteger(row.registrationId) || !Number.isSafeInteger(row.created) || row.created <= 0 || !Number.isSafeInteger(row.lastUpdated)) throw new Error('LeagueApps registration fields are invalid')
      const day = formatter.format(row.created)
      const period = day >= window.start && day <= window.end ? 'current'
        : day >= window.previous.start && day <= window.previous.end ? 'previous' : null
      const prior = rows.get(row.registrationId)
      if (prior && prior.updated > row.lastUpdated) return
      let bucket = null
      if (period && !row.deleted && !row.isStaff && ['PLAYER', 'FREEAGENT'].includes(row.role)) {
        bucket = ['VOID', 'REFUND'].includes(row.paymentStatus) ? 'excluded'
          : ({ SPOT_RESERVED: 'reserved', SPOT_PENDING: 'pending', WAITING_LIST: 'waitlist' })[row.registrationStatus] || 'other'
      }
      // Store only the minimum needed to reconcile duplicate IDs and newer statuses.
      rows.set(row.registrationId, { updated: row.lastUpdated, period, bucket,
        family: registrationFamily(row),
        athlete: Number.isSafeInteger(row.userId) && row.userId > 0 ? row.userId : null,
        start: programDay(row.programStartDate), end: programDay(row.programEndDate), open: programDay(row.registrationStartDate),
      })
    },
    finish(asOf = new Date().toISOString()) {
      if (!Number.isFinite(Date.parse(asOf))) throw new Error('Invalid LeagueApps observation time')
      const result = { version: REGISTRATION_VERSION, status: 'verified', window, asOf, current: emptyRegistrationCounts(), previous: emptyRegistrationCounts() }
      const groups = Object.fromEntries(Object.keys(REGISTRATION_GROUPS).map(key => [key, { current: cohort(), previous: cohort() }]))
      const families = Object.fromEntries(Object.keys(REGISTRATION_FAMILIES).map(key => [key, { current: cohort(), previous: cohort() }]))
      for (const row of rows.values()) if (row.period && row.bucket) {
        result[row.period][row.bucket]++
        const group = REGISTRATION_FAMILIES[row.family].group
        for (const target of [groups[group][row.period], families[row.family][row.period]]) {
          target[row.bucket]++
          if (row.bucket !== 'reserved') continue
          if (row.athlete) target.people.add(row.athlete)
          else target.missingIdentity++
          if (row.end && row.end < window.start) target.endedBeforeCurrent++
          if (row.start && row.start > window.end) target.future++
          if (!row.start || !row.end) target.datesMissing++
          const period = row.period === 'current' ? window : window.previous
          if (row.open && row.open >= period.start && row.open <= period.end) target.openedInPeriod++
        }
      }
      for (const [key, values] of Object.entries({ groups, families })) result[key] = Object.fromEntries(Object.entries(values).map(([id, periods]) => [id, Object.fromEntries(Object.entries(periods).map(([period, values]) => [period, finishCohort(values)]))]))
      return result
    },
  }
}

// The vendor's cursor is inclusive. A short page does not establish completion.
// Callers supply the authenticated page read and consume rows in memory only.
export async function walkLeagueAppsExport(fetchPage, onRow, { maxPages = 35 } = {}) {
  let cursor = { lastUpdated: 0, lastId: 0 }, rowsRead = 0
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchPage(cursor)
    if (!Array.isArray(response)) throw new Error('LeagueApps export was not an array')
    const rows = response.filter(row => !(row.id === cursor.lastId && row.lastUpdated === cursor.lastUpdated))
    if (!rows.length) return { rowsRead, pages: page }
    for (const row of rows) onRow(row)
    rowsRead += rows.length
    const last = rows.at(-1)
    if (!Number.isSafeInteger(last.id) || !Number.isSafeInteger(last.lastUpdated)
      || last.lastUpdated < cursor.lastUpdated || (last.lastUpdated === cursor.lastUpdated && last.id <= cursor.lastId)) throw new Error('LeagueApps export cursor did not advance')
    cursor = { lastUpdated: last.lastUpdated, lastId: last.id }
  }
  throw new Error('LeagueApps export exceeded its page limit; totals are incomplete')
}

export const REGISTRATION_COUNT_HELP = 'Counts reserved participant registrations created in the stated dates. Staff, team-only, deleted, voided and refunded entries are excluded. Statuses are current at refresh. One athlete can book several sessions.'
export const REGISTRATION_ATHLETE_HELP = 'Distinct LeagueApps athlete accounts with reserved spots, counted once within each group or program and period. The same athlete can appear in several rows or both weeks. These are not necessarily new athletes. Missing athlete IDs make the athlete count unavailable.'
export const REGISTRATION_SPLIT_HELP = 'Team invitations and season-invoice records are setup. Season acceptances and commitment fees are shown separately. Program IDs distinguish these from tryouts; classes and camps use their program type. Unknown club-team programs need classification. Setup does not prove an import, and bookings do not establish website or Instagram attribution.'

// The first session-level cohort is intentionally explicit. A season date range
// or an all-session pass must never masquerade as a single dated clinic.
export const SESSION_COHORT = Object.freeze({ master: 5121283, passes: [5121284], label: 'Girls high-school clinics' })
// Add a limit only after operations verifies the total coached capacity, including
// pass holders. Each entry needs { limit, countPending, checkedOn, validThrough }.
// This is not inferred from a waitlist flag or from the number of registrations.
export const SESSION_CAPACITIES = Object.freeze({})
const ALL_SESSION_PASSES = [5121284, 5121754]
export const SESSION_HELP = 'Booked athletes are distinct reserved athlete accounts for that date, including eligible all-session pass holders once. Pending, staff, deleted, voided and refunded entries are excluded. These are bookings, not attendance or necessarily new athletes.'
export const SESSION_PACE_HELP = 'Compare the latest eight clinics on earlier calendar days in this series on the same weekday and at the same time. Count their currently reserved bookings created by the same number of days before the clinic and the same Central time of day. This reconstructs booking pace, not historical registration status. Fewer than three earlier clinics is a limited baseline. A difference does not prove a cause.'
export const SESSION_CAPACITY_HELP = 'Places left uses a verified, dated total capacity that includes pass holders. Pending athletes count only when the verified rule includes them. Not set means remaining capacity is unknown, not unlimited. Confirm the desired group size with the coach before outreach.'
export const ATTENDANCE_HELP = 'Attendance is not yet verified for these clinics. A booking, payment or all-session pass does not prove the athlete attended. Use recorded check-ins separately; missing attendance must never appear as zero.'
const dayDifference = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000)
const timeLabel = value => typeof value === 'string' && /^(?:[1-9]|1[0-2]):[0-5]\d(AM|PM) to (?:[1-9]|1[0-2]):[0-5]\d(AM|PM)$/.test(value) ? value : null
const endClock = time => { const [, h, m, half] = time.match(/to (\d{1,2}):(\d{2})(AM|PM)$/); return `${String(Number(h) % 12 + (half === 'PM' ? 12 : 0)).padStart(2, '0')}:${m}:00` }
const localClock = value => new Intl.DateTimeFormat('en-GB', { timeZone: WEBSITE_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(value))
const weekday = day => new Date(`${day}T12:00:00Z`).getUTCDay()
const money = value => Number.isFinite(value) && value >= 0
const dollars = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
const shortDay = day => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

// Accept only the known date/time-shaped form answer, never arbitrary family text.
function requestedTryout(row, start, end) {
  if (registrationFamily(row) !== 'tryouts' || !start || !end) return null
  const match = String(row['Please choose a make-up tryout date'] || '').match(/^(\d{1,2})\/(\d{1,2})\s*\/\s*(\d{1,2}(?::\d{2})?)\s*-\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)$/i)
  if (!match) return null
  const candidates = [...new Set([start.slice(0, 4), end.slice(0, 4)])].map(year => `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`).filter(day => validDay(day) && day >= start && day <= end)
  if (candidates.length !== 1) return null
  const clock = value => { const [h, m = '00'] = value.split(':'); return Number(h) >= 1 && Number(h) <= 12 && Number(m) < 60 ? `${Number(h)}:${m}${match[5].toUpperCase()}` : null }
  const from = clock(match[3]), to = clock(match[4])
  return from && to ? { date: candidates[0], time: `${from} to ${to}` } : null
}

/** All source records stay in memory. Only the explicit aggregate shape leaves. */
export function createSessionOperations({ programs = null, capacities = SESSION_CAPACITIES } = {}) {
  const records = new Map()
  return {
    add(row) {
      // The registration rollup validates the export schema before this consumer.
      const prior = records.get(row.registrationId)
      if (prior && prior.updated > row.lastUpdated) return
      const start = programDay(row.programStartDate), end = programDay(row.programEndDate)
      const eligible = !row.deleted && !row.isStaff && ['PLAYER', 'FREEAGENT'].includes(row.role) && !['VOID', 'REFUND'].includes(row.paymentStatus)
      const selected = requestedTryout(row, start, end)
      const program = programs?.find(p => p.programId === row.programId)
      records.set(row.registrationId, { updated: row.lastUpdated, eligible, program: row.programId, master: row.masterProgramId,
        family: registrationFamily(row), athlete: Number.isSafeInteger(row.userId) && row.userId > 0 ? row.userId : null,
        created: row.created, status: row.registrationStatus, start, end,
        date: selected?.date || (start === end ? start : null), time: selected?.time || (start === end ? timeLabel(program?.scheduleTimes) : null),
        balance: money(row.outstandingBalance) ? row.outstandingBalance : null,
      })
    },
    finish(asOf = new Date().toISOString()) {
      const today = calendarDay(asOf, WEBSITE_TIMEZONE), clock = localClock(asOf)
      const rows = [...records.values()].filter(r => r.eligible)
      const sessions = []
      const catalog = Array.isArray(programs) ? programs.filter(p => p.masterProgramId === SESSION_COHORT.master && !p.isMaster && !p.deleted && !SESSION_COHORT.passes.includes(p.programId)) : null
      const dated = catalog?.map(p => ({ id: p.programId, date: programDay(p.startTime), end: programDay(p.endTime), time: timeLabel(p.scheduleTimes) })).filter(p => p.date && p.date === p.end && p.time) || []
      const unique = (list, status, cutoff = null) => {
        const selected = list.filter(r => r.status === status && (!cutoff || calendarDay(r.created, WEBSITE_TIMEZONE) < cutoff || (calendarDay(r.created, WEBSITE_TIMEZONE) === cutoff && localClock(r.created) <= clock)))
        return selected.some(r => !r.athlete) ? null : new Set(selected.map(r => r.athlete)).size
      }
      const forSession = p => rows.filter(r => r.program === p.id || (SESSION_COHORT.passes.includes(r.program) && r.start <= p.date && r.end >= p.date))
      for (const p of dated.filter(p => p.date > today || (p.date === today && clock <= endClock(p.time))).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
        const leadDays = dayDifference(p.date, today), own = forSession(p)
        const booked = unique(own, 'SPOT_RESERVED'), pending = unique(own, 'SPOT_PENDING')
        const earlier = dated.filter(b => b.date < today && weekday(b.date) === weekday(p.date) && b.time === p.time).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
        const baseline = earlier.map(b => unique(forSession(b), 'SPOT_RESERVED', addDays(b.date, -leadDays)))
        const comparable = booked !== null && baseline.every(count)
        const cap = capacities[p.id]
        const known = cap && count(cap.limit) && typeof cap.countPending === 'boolean' && validDay(cap.checkedOn) && validDay(cap.validThrough) && cap.checkedOn <= today && cap.validThrough >= p.date
        // Union pending and reserved identities: duplicate registrations do not
        // occupy two places, including a pending pass plus a reserved day ticket.
        const occupants = own.filter(r => r.status === 'SPOT_RESERVED' || (known && cap.countPending && r.status === 'SPOT_PENDING'))
        const occupied = occupants.some(r => !r.athlete) ? null : new Set(occupants.map(r => r.athlete)).size
        sessions.push({ id: p.id, date: p.date, time: p.time, leadDays, booked, pending,
          baselineCount: comparable ? baseline.length : 0, baselineMin: comparable && baseline.length ? Math.min(...baseline) : null,
          baselineMax: comparable && baseline.length ? Math.max(...baseline) : null,
          capacity: known ? cap.limit : null, occupied: known ? occupied : null,
          remaining: known && occupied !== null ? Math.max(0, cap.limit - occupied) : null,
          overCapacity: known && occupied !== null ? Math.max(0, occupied - cap.limit) : null,
          countPending: known ? cap.countPending : null, capacityCheckedOn: known ? cap.checkedOn : null,
        })
      }
      const paymentGroups = new Map()
      for (const r of rows.filter(r => REGISTRATION_FAMILIES[r.family].group === 'bookings' && r.status === 'SPOT_PENDING' && r.end && r.end >= today)) {
        const key = `${r.program}/${r.date}/${r.time}`
        const group = paymentGroups.get(key) || { program: r.program, family: r.family, date: r.date, time: r.time, count: 0, unpaid: 0, balance: 0, missingBalance: 0, oldest: calendarDay(r.created, WEBSITE_TIMEZONE), pass: ALL_SESSION_PASSES.includes(r.program) }
        group.count++
        if (r.balance === null) group.missingBalance++
        else if (r.balance > 0) { group.unpaid++; group.balance = Math.round((group.balance + r.balance) * 100) / 100 }
        group.oldest = [group.oldest, calendarDay(r.created, WEBSITE_TIMEZONE)].sort()[0]
        paymentGroups.set(key, group)
      }
      return { version: '630-session-operations-v1', asOf, day: today, sessionsStatus: catalog && dated.length === catalog.length ? 'verified' : 'unavailable', sessions,
        payments: [...paymentGroups.values()].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.program - b.program) }
    },
  }
}

/** Validate and select every property; enriched source objects cannot leak PII. */
export function safeSessionOperations(value) {
  if (!value || value.version !== '630-session-operations-v1' || !Number.isFinite(Date.parse(value.asOf)) || value.day !== calendarDay(value.asOf, WEBSITE_TIMEZONE) || !['verified', 'unavailable'].includes(value.sessionsStatus) || !Array.isArray(value.sessions) || !Array.isArray(value.payments)) return null
  const sessions = [], payments = []
  for (const r of value.sessions) {
    if (!count(r.id) || !validDay(r.date) || !timeLabel(r.time) || !count(r.leadDays) || r.leadDays !== dayDifference(r.date, value.day)
      || !['booked', 'pending', 'baselineMin', 'baselineMax', 'capacity', 'occupied', 'remaining', 'overCapacity'].every(k => r[k] === null || count(r[k])) || !count(r.baselineCount)
      || (r.baselineCount ? r.baselineMin === null || r.baselineMax === null || r.baselineMin > r.baselineMax : r.baselineMin !== null || r.baselineMax !== null)
      || (r.capacity === null ? r.countPending !== null || r.capacityCheckedOn !== null || r.remaining !== null || r.occupied !== null || r.overCapacity !== null : typeof r.countPending !== 'boolean' || !validDay(r.capacityCheckedOn)
        || (r.occupied === null ? r.remaining !== null || r.overCapacity !== null : r.remaining !== Math.max(0, r.capacity-r.occupied) || r.overCapacity !== Math.max(0, r.occupied-r.capacity)))) return null
    sessions.push(Object.fromEntries(['id','date','time','leadDays','booked','pending','baselineCount','baselineMin','baselineMax','capacity','occupied','remaining','overCapacity','countPending','capacityCheckedOn'].map(k=>[k,r[k]])))
  }
  for (const r of value.payments) {
    if (!count(r.program) || !Object.hasOwn(REGISTRATION_FAMILIES, r.family) || REGISTRATION_FAMILIES[r.family].group !== 'bookings' || ![r.count, r.unpaid, r.missingBalance].every(count) || r.unpaid + r.missingBalance > r.count || !money(r.balance) || !validDay(r.oldest) || (r.date !== null && !validDay(r.date)) || (r.time !== null && !timeLabel(r.time)) || typeof r.pass !== 'boolean') return null
    payments.push(Object.fromEntries(['program','family','date','time','count','unpaid','balance','missingBalance','oldest','pass'].map(k=>[k,r[k]])))
  }
  return { version: value.version, asOf: value.asOf, day: value.day, sessionsStatus: value.sessionsStatus, sessions, payments }
}
export function pendingPaymentAction(value) {
  const operations = safeSessionOperations(value)
  if (!operations) return 'Pending-payment details are unavailable. Open LeagueApps to review pending bookings.'
  if (!operations.payments.length) return 'No pending bookings found for programs whose end date is still ahead.'
  return operations.payments.map(r => `${REGISTRATION_FAMILIES[r.family].label}${r.pass ? ' (all-session pass)' : ''}${r.date ? ` — ${shortDay(r.date)}${r.time ? `, ${r.time} Central` : ''}` : r.pass ? ' — confirm remaining clinic dates' : ' — session date needs confirmation'}: ${r.count} pending; ${r.missingBalance ? 'balance partly unavailable' : `${dollars(r.balance)} outstanding`}. Oldest booking: ${r.oldest}. ${r.unpaid ? 'Privately confirm the intended session and help complete payment; unpaid does not prove a failed card.' : 'Check the pending status in LeagueApps before confirming a place.'}`).join(' ')
}
export function sessionRows(value) {
  const operations = safeSessionOperations(value)
  if (!operations || operations.sessionsStatus !== 'verified') return [{ session: 'Girls high-school clinics', booked: 'Unavailable', pace: 'Session details unavailable', capacity: 'Unknown', action: 'Check the LeagueApps refresh. Missing is not zero.' }]
  if (!operations.sessions.length) return [{ session: 'Girls high-school clinics', booked: 'No upcoming dates', pace: 'Not applicable', capacity: 'Not applicable', action: 'No future dated clinics in the current program list.' }]
  return operations.sessions.map(r => ({
    session: `${shortDay(r.date)} · ${r.time} Central`, booked: r.booked === null ? 'Unavailable — missing athlete IDs' : `${r.booked} athlete${r.booked === 1 ? '' : 's'}`,
    pace: r.baselineCount ? `${r.baselineMin === r.baselineMax ? r.baselineMin : `${r.baselineMin}–${r.baselineMax}`} at ${r.leadDays} days out · ${r.baselineCount} earlier clinics${r.baselineCount < 3 ? ' (limited)' : ''}` : 'No comparable baseline',
    capacity: r.capacity === null ? 'Not set — places left unknown' : r.remaining === null ? `${r.capacity} maximum; occupancy unavailable` : `${r.remaining} left of ${r.capacity}${r.overCapacity ? `; ${r.overCapacity} over capacity` : ''}. ${r.countPending ? 'Pending included' : 'Reserved only'}. Checked ${r.capacityCheckedOn}.`,
    action: r.overCapacity ? 'Resolve capacity with the coach before outreach.' : r.booked === null || r.baselineCount < 3 ? 'Check the coach’s target; comparison is incomplete.' : r.booked < r.baselineMin ? 'Below earlier pace. Confirm places and coach’s target before outreach.' : 'At or above earlier pace. No urgent outreach signal from bookings alone.',
  }))
}

function validRegistrationSnapshot(snapshot) {
  if (snapshot?.status !== 'verified' || snapshot.version !== REGISTRATION_VERSION || !snapshot.groups || !snapshot.families) return false
  const validCohort = c => c && registrationBuckets.every(k => count(c[k])) && ['missingIdentity', 'endedBeforeCurrent', 'future', 'datesMissing', 'openedInPeriod'].every(k => count(c[k]) && c[k] <= c.reserved)
    && (c.missingIdentity ? c.athletes === null : count(c.athletes) && c.athletes <= c.reserved)
  return ['current', 'previous'].every(period => registrationBuckets.every(key => count(snapshot[period]?.[key])
    && Object.keys(REGISTRATION_GROUPS).reduce((sum, group) => sum + (snapshot.groups[group]?.[period]?.[key] ?? NaN), 0) === snapshot[period][key])
    && Object.keys(REGISTRATION_GROUPS).every(group => validCohort(snapshot.groups[group]?.[period])
      && registrationBuckets.every(key => Object.entries(REGISTRATION_FAMILIES).filter(([, family]) => family.group === group).reduce((sum, [id]) => sum + (snapshot.families[id]?.[period]?.[key] ?? NaN), 0) === snapshot.groups[group][period][key]))
    && Object.keys(REGISTRATION_FAMILIES).every(id => validCohort(snapshot.families[id]?.[period])))
}
const athleteText = value => value === null ? 'athlete count unavailable' : `${value} distinct athlete${value === 1 ? '' : 's'}`
const cohortText = (c, noun = 'bookings') => `${c.reserved} ${c.reserved === 1 ? noun.replace(/s$/, '') : noun}; ${athleteText(c.athletes)}`
function programContext(current, previous) {
  const parts = []
  if (previous.endedBeforeCurrent) parts.push(`${previous.endedBeforeCurrent} earlier booking${previous.endedBeforeCurrent === 1 ? ' was' : 's were'} for sessions that ended before this week.`)
  if (!current.datesMissing && !previous.datesMissing && (current.future || previous.future)) parts.push(`For dates still ahead: ${current.future} booking${current.future === 1 ? '' : 's'}, previously ${previous.future}.`)
  if (current.openedInPeriod || previous.openedInPeriod) parts.push('A recorded program opening overlaps this comparison; check launch timing.')
  if (current.datesMissing || previous.datesMissing) parts.push('Some session dates are missing; check the program calendar.')
  if (current.pending) parts.push(`${current.pending} pending; review in LeagueApps.`)
  if (current.athletes === null || previous.athletes === null) parts.push('Some athlete IDs are missing; do not read this as zero athletes.')
  if (!parts.length) parts.push('Compare remaining places and program timing before changing outreach.')
  return parts.join(' ')
}
export function registrationProgramRows(snapshot) {
  if (!validRegistrationSnapshot(snapshot)) return []
  return Object.entries(REGISTRATION_FAMILIES).filter(([, family]) => family.group === 'bookings').flatMap(([id, family]) => {
    const { current, previous } = snapshot.families[id]
    if (![current, previous].some(c => c.reserved || c.pending || c.waitlist || c.excluded || c.other)) return []
    return [{ program: family.label, current: cohortText(current), previous: cohortText(previous), context: programContext(current, previous) }]
  })
}
export function registrationAnswer(snapshot) {
  if (!validRegistrationSnapshot(snapshot)) return { state: 'unavailable', heading: 'Registration totals are unavailable.', detail: 'A complete LeagueApps refresh is needed. Missing data does not mean zero registrations.', action: 'Check the LeagueApps refresh, then reload this report.' }
  const { current: c, previous: p, groups, families } = snapshot
  const compare = (key, noun) => `${cohortText(groups[key].current, noun)}. Previous period: ${cohortText(groups[key].previous, noun)}.`
  const operations = safeSessionOperations(snapshot.sessionOperations)
  const candidates = Object.entries(REGISTRATION_FAMILIES).filter(([id, family]) => {
    const { current, previous } = families[id]
    return !(id === 'girls_hs' && operations?.sessionsStatus === 'verified') && family.group === 'bookings' && current.athletes !== null && previous.athletes > 0 && current.athletes < previous.athletes && (current.future || previous.future || current.datesMissing || previous.datesMissing)
  }).sort(([a], [b]) => (families[b].previous.athletes - families[b].current.athletes) - (families[a].previous.athletes - families[a].current.athletes) || families[a].current.athletes / families[a].previous.athletes - families[b].current.athletes / families[b].previous.athletes)
  const priority = candidates[0]
  const actions = []
  if (operations?.sessionsStatus === 'verified' && operations.sessions.length) {
    const next = operations.sessions.slice(0, 2)
    actions.push(`${SESSION_COHORT.label}: ${next.map(r => `${shortDay(r.date)} has ${r.booked === null ? 'an unavailable athlete count' : `${r.booked} booked athletes`}`).join('; ')}. ${next.every(r => r.booked !== null && r.baselineCount >= 3 && r.booked >= r.baselineMin) ? 'These clinics are at or above earlier booking pace; the weekly drop alone is not an urgent outreach signal.' : 'Check the upcoming-clinics table before changing outreach.'} Confirm the coach’s target and capacity.`)
  }
  if (groups.unclassified.current.reserved || groups.unclassified.previous.reserved || groups.unclassified.current.pending) actions.push('Classify the unassigned programs with the report owner before comparing demand.')
  if (priority) {
    const [id, family] = priority, { current, previous } = families[id]
    actions.push(`Review ${family.label}: ${current.athletes} athletes booked, previously ${previous.athletes}. Check remaining places and session timing before changing outreach.`)
  } else if (!operations?.sessions.length) actions.push('Review remaining places by program; this comparison alone does not establish a demand problem.')
  if (operations?.payments.length) actions.push(`Review the pending-payment follow-up below for ${operations.payments.reduce((n, r) => n + r.count, 0)} pending bookings.`)
  else if (groups.bookings.current.pending) actions.push(`Review ${groups.bookings.current.pending} pending program booking${groups.bookings.current.pending === 1 ? '' : 's'} in LeagueApps.`)
  return {
    state: 'recorded', heading: compare('bookings', 'bookings'), detail: compare('setup', 'setup records'),
    commitments: compare('commitments', 'commitment records'), classification: compare('unclassified', 'unclassified records'),
    totals: `${c.reserved} total reserved records; previous period: ${p.reserved}. Team and roster setup: ${groups.setup.current.reserved}, previously ${groups.setup.previous.reserved}. Read program bookings separately from setup.`,
    waiting: `${groups.bookings.current.pending} program booking${groups.bookings.current.pending === 1 ? '' : 's'} pending; ${groups.bookings.current.waitlist} waitlisted. Across all groups: ${c.pending} pending, ${c.waitlist} waitlisted, ${c.excluded} voided or refunded, ${c.other} other statuses. Pending and excluded records are outside the booking and athlete totals.`,
    action: actions.join(' '),
    payments: pendingPaymentAction(operations),
  }
}

/** An explicit allowlist; even an accidentally enriched snapshot cannot publish PII. */
export function registrationSnapshotProperties(snapshot, trigger) {
  const answer = registrationAnswer(snapshot), verified = answer.state === 'recorded'
  const operations = verified ? safeSessionOperations(snapshot.sessionOperations) : null
  return {
    $process_person_profile: false, $geoip_disable: true, $ip: null,
    registration_version: REGISTRATION_VERSION, source: 'leagueapps', club: '630volleyball',
    status: verified ? 'verified' : 'unavailable',
    period_start: snapshot.window.start, period_end: snapshot.window.end,
    as_of: snapshot.asOf, trigger: trigger === 'cron' ? 'cron' : 'manual',
    ...Object.fromEntries(['current', 'previous'].flatMap(period => registrationBuckets.map(key => [
      `${period}_${key}`, verified ? snapshot[period][key] : null,
    ]))),
    ...Object.fromEntries(Object.keys(REGISTRATION_GROUPS).flatMap(group => ['current', 'previous'].flatMap(period => ['reserved', 'athletes', 'missingIdentity'].map(key => [
      `${period}_${group}_${key}`, verified ? snapshot.groups[group][period][key] : null,
    ])))),
    answer: answer.heading, context: answer.detail, next_step: answer.action,
    commitments: answer.commitments || '', classification: answer.classification || '', totals: answer.totals || '', waiting: answer.waiting || '',
    program_breakdown_json: JSON.stringify(registrationProgramRows(snapshot)),
    session_breakdown_json: JSON.stringify(sessionRows(operations)),
    pending_payments: pendingPaymentAction(operations),
    // Numeric source for independent report verification. Explicit keys prevent
    // accidentally enriched source objects from carrying identities into analytics.
    registration_counts_json: verified ? JSON.stringify({ sessionOperations: operations, ...Object.fromEntries(['groups', 'families'].map(kind => [kind,
      Object.fromEntries(Object.keys(kind === 'groups' ? REGISTRATION_GROUPS : REGISTRATION_FAMILIES).map(id => [id,
        Object.fromEntries(['current', 'previous'].map(period => [period, Object.fromEntries([...registrationBuckets, 'athletes', 'missingIdentity', 'endedBeforeCurrent', 'future', 'datesMissing', 'openedInPeriod'].map(key => [key, snapshot[kind][id][period][key]]))]))
      ]))
    ])) }) : null,
  }
}
export function registrationVerificationQuery() {
  return `SELECT properties.status AS status, properties.period_start AS period_start, properties.period_end AS period_end,
    properties.registration_counts_json AS counts,
    formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS observed_at
    FROM events WHERE event = '${REGISTRATION_EVENT}' AND properties.registration_version = '${REGISTRATION_VERSION}'
    AND properties.club = '630volleyball' AND timestamp >= now() - INTERVAL 7 DAY ORDER BY timestamp DESC LIMIT 1`
}
export function registrationExpectedTables(source = null, now = new Date()) {
  const window = reportingWindow({ now }), unavailable = registrationAnswer(null)
  const fresh = source?.status === 'verified' && source.period_start === window.start && source.period_end === window.end
    && Date.parse(source.observed_at) >= new Date(now).getTime() - 36 * 3600000
  let snapshot = null
  if (fresh) {
    const counts = JSON.parse(source.counts)
    snapshot = { version: REGISTRATION_VERSION, status: 'verified', window, ...counts }
    for (const period of ['current', 'previous']) snapshot[period] = Object.fromEntries(registrationBuckets.map(key => [key, Object.keys(REGISTRATION_GROUPS).reduce((sum, group) => sum + (counts.groups?.[group]?.[period]?.[key] ?? NaN), 0)]))
    if (!validRegistrationSnapshot(snapshot)) throw new Error('Registration numeric source is invalid')
  }
  const a = snapshot ? registrationAnswer(snapshot) : unavailable
  const values = [
    `${window.start} through ${window.end} (Central). Previous: ${window.previous.start} through ${window.previous.end}. Dashboard filters do not change these dates.`,
    a.heading, a.detail, a.commitments || unavailable.detail, a.classification || unavailable.detail, a.totals || unavailable.detail, a.action, a.waiting || unavailable.detail,
    pendingPaymentAction(snapshot?.sessionOperations), ATTENDANCE_HELP,
    REGISTRATION_ATHLETE_HELP, REGISTRATION_COUNT_HELP, REGISTRATION_SPLIT_HELP,
    source ? `${source.observed_at.replace('T', ' ').replace('Z', '')} (UTC). Refreshes daily at 11:15 UTC. ${snapshot ? 'Complete export recorded.' : 'Unavailable or out of date; do not treat these totals as zero.'}` : 'No refresh recorded yet.',
  ]
  const programs = snapshot ? registrationProgramRows(snapshot).map(row => [row.program, row.current, row.previous, row.context]) : [['Program bookings unavailable', 'Unavailable', 'Unavailable', 'Check the LeagueApps refresh; missing data does not mean zero.']]
  if (!programs.length) programs.push(['No program bookings in either period', '0 bookings; 0 athletes', '0 bookings; 0 athletes', 'Complete export recorded. Team setup and season commitments appear in the summary.'])
  return { summary: REGISTRATION_QUESTIONS.map((q, i) => [q, values[i]]), programs, sessions: sessionRows(snapshot?.sessionOperations).map(r => [r.session, r.booked, r.pace, r.capacity, r.action]) }
}
const sqlQuote = value => `'${value.replaceAll("'", "''")}'`
const registrationMidnight = `toStartOfDay(now(), '${WEBSITE_TIMEZONE}')`
function latestRegistrationQuery() {
  return `SELECT count() AS snapshots,
    ${['status', 'period_start', 'period_end', 'answer', 'context', 'next_step', 'commitments', 'classification', 'totals', 'waiting', 'program_breakdown_json', 'session_breakdown_json', 'pending_payments'].map(key => `argMax(properties.${key}, timestamp) AS ${key}`).join(',\n    ')},
    formatDateTime(max(timestamp), '%Y-%m-%d %H:%i:%S', 'UTC') AS as_of,
    snapshots > 0 AND status = 'verified'
      AND period_start = toString(toDate(${registrationMidnight} - INTERVAL 7 DAY))
      AND period_end = toString(toDate(${registrationMidnight} - INTERVAL 1 DAY))
      AND max(timestamp) >= now() - INTERVAL 36 HOUR AS usable
  FROM events
  WHERE event = '${REGISTRATION_EVENT}' AND properties.registration_version = '${REGISTRATION_VERSION}'
    AND properties.club = '630volleyball' AND timestamp >= now() - INTERVAL 7 DAY`
}
export const REGISTRATION_QUESTIONS = Object.freeze(['Which dates?', 'Clinics, camps & tryouts', 'Team & roster setup', 'Season acceptances & commitments', 'Needs classification', 'Why did the total change?', 'What needs action?', 'Anything waiting?', 'Pending-payment follow-up', 'Bookings or attendance?', 'How are athletes counted?', 'What counts?', 'How is the split decided?', 'When did this refresh?'])
export function registrationInsightQuery() {
  const unavailable = registrationAnswer(null)
  const values = [
    `concat(toString(toDate(${registrationMidnight} - INTERVAL 7 DAY)), ' through ', toString(toDate(${registrationMidnight} - INTERVAL 1 DAY)), ' (Central). Previous: ', toString(toDate(${registrationMidnight} - INTERVAL 14 DAY)), ' through ', toString(toDate(${registrationMidnight} - INTERVAL 8 DAY)), '. Dashboard filters do not change these dates.')`,
    `if(usable, toString(answer), ${sqlQuote(unavailable.heading)})`,
    ...['context', 'commitments', 'classification', 'totals'].map(key => `if(usable, toString(${key}), ${sqlQuote(unavailable.detail)})`),
    `if(usable, toString(next_step), ${sqlQuote(unavailable.action)})`,
    `if(usable, toString(waiting), ${sqlQuote(unavailable.detail)})`,
    `if(usable AND notEmpty(toString(pending_payments)), toString(pending_payments), ${sqlQuote(pendingPaymentAction(null))})`, sqlQuote(ATTENDANCE_HELP),
    sqlQuote(REGISTRATION_ATHLETE_HELP), sqlQuote(REGISTRATION_COUNT_HELP), sqlQuote(REGISTRATION_SPLIT_HELP),
    `if(snapshots > 0, concat(toString(as_of), ' (UTC). Refreshes daily at 11:15 UTC. ', if(usable, 'Complete export recorded.', 'Unavailable or out of date; do not treat these totals as zero.')), 'No refresh recorded yet.')`,
  ]
  return `SELECT row.1 AS Question, row.2 AS Answer FROM (\n${latestRegistrationQuery()}\n) ARRAY JOIN [\n${REGISTRATION_QUESTIONS.map((question, i) => `tuple(${sqlQuote(question)}, ${values[i]})`).join(',\n')}\n] AS row`
}
export function registrationProgramsQuery() {
  const unavailable = JSON.stringify([{ program: 'Program bookings unavailable', current: 'Unavailable', previous: 'Unavailable', context: 'Check the LeagueApps refresh; missing data does not mean zero.' }])
  const empty = JSON.stringify([{ program: 'No program bookings in either period', current: '0 bookings; 0 athletes', previous: '0 bookings; 0 athletes', context: 'Complete export recorded. Team setup and season commitments appear in the summary.' }])
  return `SELECT JSONExtractString(item, 'program') AS Program, JSONExtractString(item, 'current') AS Current, JSONExtractString(item, 'previous') AS Previous, JSONExtractString(item, 'context') AS Context
FROM (\n${latestRegistrationQuery()}\n)
ARRAY JOIN JSONExtractArrayRaw(coalesce(if(usable, if(toString(program_breakdown_json) = '[]', ${sqlQuote(empty)}, toString(program_breakdown_json)), ${sqlQuote(unavailable)}), ${sqlQuote(unavailable)})) AS item`
}

export function registrationSessionsQuery() {
  const unavailable = sqlQuote(JSON.stringify(sessionRows(null)))
  return `SELECT JSONExtractString(item, 'session') AS Session, JSONExtractString(item, 'booked') AS Booked, JSONExtractString(item, 'pace') AS Earlier, JSONExtractString(item, 'capacity') AS Capacity, JSONExtractString(item, 'action') AS Action
FROM (\n${latestRegistrationQuery()}\n)
ARRAY JOIN JSONExtractArrayRaw(coalesce(if(usable AND notEmpty(toString(session_breakdown_json)), toString(session_breakdown_json), ${unavailable}), ${unavailable})) AS item`
}
