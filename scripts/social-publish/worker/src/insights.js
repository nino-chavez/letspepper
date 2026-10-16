/**
 * Instagram insights collector: the scheduler Worker's daily read-only job, beside the
 * publisher (run) and the engagement sweep. ../../INSIGHTS.md owns why it exists, what each
 * table means and how to query it. This header owns the contract.
 *
 * Once a day (INSIGHTS_CRON) and on demand (/insights/run), for every account flagged
 * `insights: true` in the Worker's ACCOUNTS registry:
 *   1. the profile's followers_count, follows_count and media_count (instagram_basic);
 *   2. account totals for each of the last LOOKBACK_DAYS complete reporting days, one
 *      window per day, because metric_type=total_value returns a single sum per window;
 *   3. the follower audience (top cities; age by gender) and followers online by hour;
 *   4. caption and lifetime totals for each feed post and Reel published in the last
 *      MEDIA_WINDOW_DAYS, so a post's growth shows across days.
 * Every hour (STORIES_CRON) and on demand (/insights/stories) it also reads each live
 * Story's totals, because Story insights disappear 24 hours after posting; the last
 * reading before a Story expires is its near-final result.
 * Steps 2 to 4 and the Stories read need instagram_manage_insights on the account's token.
 *
 * Rules the code keeps:
 *   - A reporting day is Meta's: midnight to midnight in America/Los_Angeles, which is
 *     also how Business Suite labels days. On a DST change the window is 23 or 25 hours.
 *   - A value Meta did not return is never written. Meta answers missing or delayed
 *     data with an empty set, not 0, and can revise a day for up to 48 hours, so every
 *     run re-reads the whole lookback and a later reading replaces an earlier one.
 *   - follows_and_unfollows is stored under Meta's own breakdown names:
 *     follows_and_unfollows:FOLLOWER is follows and :NON_FOLLOWER is unfollows (checked
 *     against Business Suite's Audience > Trends for four days on 2026-10-15; INSIGHTS.md).
 *   - Every run writes one sync_runs row per account. Only scheduled runs alert: the phone
 *     alert fires when an account's state differs from its previous scheduled run's, so a
 *     standing problem notifies once. A manual run returns its result to the caller instead.
 *   - A Graph error never carries the request URL into a stored detail or a log line;
 *     the URL holds the access token.
 */

import { notify } from '../../notify.mjs'

export const INSIGHTS_CRON = '30 14 * * *' // 9:30 a.m. CDT, 8:30 a.m. CST
export const STORIES_CRON = '45 * * * *'
export const REPORT_TIME_ZONE = 'America/Los_Angeles'
export const LOOKBACK_DAYS = 7
export const MEDIA_WINDOW_DAYS = 14
// External subrequests one run may spend on Graph reads; the phone alert is not charged
// against it. Kept under the Workers Free cap of 50 per invocation, the same caution the
// publisher's SUBREQUEST_BUDGET takes: the account's plan could not be read from the API
// (2026-10-15). A daily run spends 1 profile + 2 per day + 2 audience + 1 online hours +
// 1 media list + 1 per recent post, about 31 for 630's ~12 posts a fortnight; more than 26
// posts in the window makes the run partial rather than overrun the cap. An hourly
// Stories run spends 1 list + 2 per live Story.
export const RUN_BUDGET = 45
// A Graph request that has not answered by then is a failed read, so a hung request can
// never outlive the run and leave it without a sync_runs row.
export const GRAPH_TIMEOUT_MS = 20_000
// A range run reads days only, two requests each after the profile, so one run covers
// what the budget allows. A longer backfill is several calls (INSIGHTS.md).
export const MAX_RANGE_DAYS = Math.floor((RUN_BUDGET - 1) / 2)
const MEDIA_PAGE_SIZE = 50

export const DAY_METRICS = [
  'reach', 'views', 'total_interactions', 'likes', 'comments', 'saves', 'shares',
  'replies', 'reposts', 'profile_links_taps', 'accounts_engaged',
]
export const FOLLOW_METRIC = 'follows_and_unfollows'
// Per media product type, because Meta fails the whole call for a metric the type does not
// support. Each list was read live on 2026-10-15: Reels refuse follows and profile_visits,
// and crossposted_views and facebook_views failed outright, so they are left out. Stories
// are not on the media edge; the Stories read lists them from /{ig}/stories.
export const MEDIA_METRICS = {
  FEED: ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions',
    'follows', 'profile_visits', 'profile_activity', 'reposts'],
  REELS: ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions',
    'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'reels_skip_rate', 'reposts'],
  STORY: ['reach', 'views', 'replies', 'shares', 'follows', 'profile_visits', 'total_interactions',
    'link_clicks', 'navigation'],
}
// navigation split into tap_forward, tap_back, tap_exit and swipe_forward.
export const STORY_NAVIGATION_BREAKDOWN = 'story_navigation_action_type'
export const AUDIENCE_BREAKDOWNS = ['city', 'age,gender']
// Days of online-hours history each daily run re-reads; Meta fills a day only after it ends.
const ONLINE_LOOKBACK_DAYS = 4

export const STATES = ['ok', 'partial', 'missing_scope', 'token_invalid', 'error']

const pad = (n) => String(n).padStart(2, '0')
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const part = (type) => Number(parts.find((p) => p.type === type).value)
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') }
}

// Minutes the zone is ahead of UTC at `date` (negative for the Americas).
function offsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/** The reporting day (YYYY-MM-DD) that `date` falls in. */
export function reportDay(date) {
  const p = zonedParts(date, REPORT_TIME_ZONE)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function isDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Unix seconds of 00:00 on `day` in the reporting time zone. */
export function reportMidnight(day) {
  const [y, m, d] = day.split('-').map(Number)
  const wallClock = Date.UTC(y, m - 1, d)
  // Two passes: the first offset is read at a guess that can sit on the wrong side of
  // a DST change; the second is read at the corrected instant.
  let instant = wallClock - offsetMinutes(new Date(wallClock), REPORT_TIME_ZONE) * 60000
  instant = wallClock - offsetMinutes(new Date(instant), REPORT_TIME_ZONE) * 60000
  return instant / 1000
}

/**
 * Graph since/until for one reporting day. Meta includes `until` itself: a window ending
 * at the next midnight returns that day and the next one summed (measured 2026-10-15 for
 * Oct 6, 7, 8 and 12: every total equaled Business Suite's day plus the following day).
 * Ending one second before the next midnight returns the day alone, matching Business
 * Suite exactly for reach, interactions, follows and unfollows on Oct 6, 7 and 12.
 */
export function dayWindow(day) {
  return { since: reportMidnight(day), until: reportMidnight(addDays(day, 1)) - 1 }
}

/** Every day from `from` to `to`, oldest first. */
export function dayRange(from, to) {
  const days = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)
  return days
}

/** The complete reporting days a daily run re-reads: the LOOKBACK_DAYS before today. */
export function lookbackDays(now) {
  const yesterday = addDays(reportDay(now), -1)
  return dayRange(addDays(yesterday, -(LOOKBACK_DAYS - 1)), yesterday)
}

class BudgetExhausted extends Error {}

export class GraphError extends Error {
  constructor(error, status) {
    const code = error?.code
    super(`${error?.message || `HTTP ${status}`}${code != null ? ` [code ${code}]` : ''}`)
    this.code = code
    this.status = status
  }
}

/**
 * The run state a failure puts an account in. Meta code 190 is an expired or revoked
 * token; code 10 and the 200-299 range are a permission the token was never granted.
 */
export function classify(err) {
  if (err instanceof GraphError) {
    if (err.code === 190) return 'token_invalid'
    if (err.code === 10 || (err.code >= 200 && err.code <= 299)) return 'missing_scope'
  }
  return 'error'
}

function makeGraph({ graph, token, fetchImpl, budget }) {
  return async function get(path, params) {
    if (budget.used >= budget.limit) throw new BudgetExhausted('run budget spent')
    budget.used += 1
    const query = new URLSearchParams({ ...params, access_token: token })
    let res
    try {
      res = await fetchImpl(`${graph}/${path}?${query}`, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) })
    } catch (e) {
      const reason = e?.name === 'TimeoutError' ? `no answer within ${GRAPH_TIMEOUT_MS / 1000} seconds` : `network error: ${e?.name || 'Error'}`
      throw new GraphError({ message: reason }, 0)
    }
    let json = null
    try { json = await res.json() } catch { json = null }
    if (!res.ok || !json || json.error) throw new GraphError(json?.error, res.status)
    return json
  }
}

/**
 * Every number an insights response carries, as { metric, value }. A total_value metric
 * gives its total and one entry per breakdown value; a lifetime media metric gives its
 * last value. Anything absent or non-numeric is dropped, never turned into 0. Values are
 * kept as Meta sends them: reels_skip_rate is a percentage with a decimal.
 */
export function readInsights(json) {
  const out = []
  for (const row of json?.data ?? []) {
    if (!row?.name) continue
    const total = row.total_value
    if (total) {
      if (Number.isFinite(total.value)) out.push({ metric: row.name, value: total.value })
      for (const breakdown of total.breakdowns ?? []) {
        for (const result of breakdown.results ?? []) {
          const dims = result.dimension_values
          if (Number.isFinite(result.value) && Array.isArray(dims) && dims.length) {
            out.push({ metric: `${row.name}:${dims.join(':')}`, value: result.value })
          }
        }
      }
    } else if (Array.isArray(row.values) && row.values.length) {
      const value = row.values[row.values.length - 1]?.value
      if (Number.isFinite(value)) out.push({ metric: row.name, value })
    }
  }
  return out
}

function mediaMetricsFor(media) {
  return MEDIA_METRICS[media.media_product_type] ?? null
}

/** A follower_demographics response as audience rows; Meta's top-45 cut is kept as is. */
export function readAudience(json, breakdown) {
  const out = []
  for (const row of json?.data ?? []) {
    for (const group of row?.total_value?.breakdowns ?? []) {
      for (const result of group.results ?? []) {
        const dims = result.dimension_values
        if (Number.isFinite(result.value) && Array.isArray(dims) && dims.length) out.push({ breakdown, dimension: dims.join(':'), value: result.value })
      }
    }
  }
  return out
}

/** An online_followers response as one row per hour; a day Meta has not filled is skipped. */
export function readOnlineFollowers(json) {
  const out = []
  for (const row of json?.data ?? []) {
    for (const day of row?.values ?? []) {
      if (!day?.end_time || !day.value || typeof day.value !== 'object') continue
      for (const [hour, value] of Object.entries(day.value)) {
        const h = Number(hour)
        if (Number.isInteger(h) && h >= 0 && h <= 23 && Number.isFinite(value)) out.push({ period_end: day.end_time, hour: h, value })
      }
    }
  }
  return out
}

// One statement per table: each upsert reads its rows from a single JSON parameter, so
// a run's write is a fixed handful of statements however many days and posts it covers.
const UPSERT_DAY_VALUES = `
INSERT INTO account_metric_days (account, day, metric, value, source, first_observed_at, last_observed_at)
SELECT ?1, j.value ->> 'day', j.value ->> 'metric', j.value ->> 'value', 'graph_api', ?2, ?2
FROM json_each(?3) AS j WHERE true
ON CONFLICT (account, day, metric, source) DO UPDATE SET
  value = excluded.value, last_observed_at = excluded.last_observed_at`

const UPSERT_SNAPSHOT = `
INSERT INTO account_snapshots (account, day, followers_count, follows_count, media_count, observed_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT (account, day) DO UPDATE SET
  followers_count = excluded.followers_count, follows_count = excluded.follows_count,
  media_count = excluded.media_count, observed_at = excluded.observed_at`

const UPSERT_MEDIA = `
INSERT INTO media (media_id, account, published_at, media_type, media_product_type, permalink, caption, first_seen_at, last_seen_at)
SELECT j.value ->> 'id', ?1, j.value ->> 'timestamp', j.value ->> 'media_type', j.value ->> 'media_product_type',
  j.value ->> 'permalink', j.value ->> 'caption', ?2, ?2
FROM json_each(?3) AS j WHERE true
ON CONFLICT (media_id) DO UPDATE SET
  media_type = excluded.media_type, media_product_type = excluded.media_product_type,
  permalink = excluded.permalink, caption = COALESCE(excluded.caption, media.caption),
  last_seen_at = excluded.last_seen_at`

const UPSERT_AUDIENCE = `
INSERT INTO audience_snapshots (account, day, breakdown, dimension, value, observed_at)
SELECT ?1, ?2, j.value ->> 'breakdown', j.value ->> 'dimension', j.value ->> 'value', ?3
FROM json_each(?4) AS j WHERE true
ON CONFLICT (account, day, breakdown, dimension) DO UPDATE SET
  value = excluded.value, observed_at = excluded.observed_at`

const UPSERT_ONLINE = `
INSERT INTO online_followers (account, period_end, hour, value, observed_at)
SELECT ?1, j.value ->> 'period_end', j.value ->> 'hour', j.value ->> 'value', ?2
FROM json_each(?3) AS j WHERE true
ON CONFLICT (account, period_end, hour) DO UPDATE SET
  value = excluded.value, observed_at = excluded.observed_at`

const UPSERT_MEDIA_VALUES = `
INSERT INTO media_metric_snapshots (media_id, day, metric, value, observed_at)
SELECT j.value ->> 'media_id', ?1, j.value ->> 'metric', j.value ->> 'value', ?2
FROM json_each(?3) AS j WHERE true
ON CONFLICT (media_id, day, metric) DO UPDATE SET
  value = excluded.value, observed_at = excluded.observed_at`

const INSERT_RUN = `
INSERT INTO sync_runs (account, job, trigger, started_at, finished_at, state, first_day, last_day,
  days_complete, days_failed, day_values_written, media_read, detail)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`

const PREVIOUS_CRON_STATE = "SELECT state FROM sync_runs WHERE account = ?1 AND job = ?2 AND trigger = 'cron' ORDER BY id DESC LIMIT 1"
// The Stories job leaves token problems to the daily job in both directions: it neither
// alerts on one nor compares against one, so a renewal sends one recovery alert, not two.
const PREVIOUS_STORIES_STATE = `SELECT state FROM sync_runs WHERE account = ?1 AND job = 'stories' AND trigger = 'cron'
  AND state NOT IN ('missing_scope', 'token_invalid') ORDER BY id DESC LIMIT 1`

/**
 * Read one account and return what to write, without writing it. `days` are the
 * reporting days to read; `includeMedia` (the daily job) adds the audience, followers
 * online by hour, and the profile's recent posts.
 */
export function emptyRead(days = []) {
  return { snapshot: null, dayValues: [], audience: [], online: [], media: [], mediaValues: [], daysComplete: [], daysFailed: [...days], failures: [], stoppedAtBudget: false }
}

export async function readAccount({ get, igUserId, days, includeMedia, now }) {
  const out = { ...emptyRead(), daysFailed: [] }
  const fail = (step, err) => out.failures.push({ step, state: classify(err), detail: err.message })

  try {
    const profile = await get(igUserId, { fields: 'followers_count,follows_count,media_count' })
    if ([profile.followers_count, profile.follows_count, profile.media_count].every(Number.isFinite)) {
      out.snapshot = { followers_count: profile.followers_count, follows_count: profile.follows_count, media_count: profile.media_count }
    } else {
      out.failures.push({ step: 'profile', state: 'error', detail: 'profile counts missing from the response' })
    }
  } catch (e) {
    if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; return out }
    fail('profile', e)
  }

  let insightsBlocked = false
  for (const day of days) {
    const { since, until } = dayWindow(day)
    const window = { period: 'day', metric_type: 'total_value', since: String(since), until: String(until) }
    try {
      const totals = readInsights(await get(`${igUserId}/insights`, { ...window, metric: DAY_METRICS.join(',') }))
      const follows = readInsights(await get(`${igUserId}/insights`, { ...window, metric: FOLLOW_METRIC, breakdown: 'follow_type' }))
      for (const v of [...totals, ...follows]) out.dayValues.push({ day, metric: v.metric, value: v.value })
      out.daysComplete.push(day)
    } catch (e) {
      if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; break }
      out.daysFailed.push(day)
      fail(`day ${day}`, e)
      // A token problem fails every remaining day the same way; stop spending on it.
      if (classify(e) !== 'error') { insightsBlocked = true; break }
    }
  }

  if (!includeMedia || out.stoppedAtBudget) return out
  if (!insightsBlocked) {
    try {
      for (const breakdown of AUDIENCE_BREAKDOWNS) {
        out.audience.push(...readAudience(await get(`${igUserId}/insights`, {
          metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown,
        }), breakdown))
      }
      const until = Math.floor(now.getTime() / 1000)
      out.online.push(...readOnlineFollowers(await get(`${igUserId}/insights`, {
        metric: 'online_followers', period: 'lifetime', since: String(until - ONLINE_LOOKBACK_DAYS * 86400), until: String(until),
      })))
    } catch (e) {
      if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; return out }
      fail('audience', e)
      if (classify(e) !== 'error') insightsBlocked = true
    }
  }
  let listed
  try {
    listed = await get(`${igUserId}/media`, {
      fields: 'id,timestamp,media_type,media_product_type,permalink,caption,like_count,comments_count',
      limit: String(MEDIA_PAGE_SIZE),
    })
  } catch (e) {
    if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; return out }
    fail('media list', e)
    return out
  }
  const cutoff = now.getTime() - MEDIA_WINDOW_DAYS * 86400000
  const items = (listed.data ?? []).filter((m) => m?.id && m.timestamp && Date.parse(m.timestamp) >= cutoff)
  if (items.length === (listed.data ?? []).length && items.length === MEDIA_PAGE_SIZE) {
    out.failures.push({ step: 'media list', state: 'partial', detail: `more than ${MEDIA_PAGE_SIZE} posts in ${MEDIA_WINDOW_DAYS} days; older ones were not read` })
  }
  for (const m of items) {
    out.media.push({ id: m.id, timestamp: m.timestamp, media_type: m.media_type, media_product_type: m.media_product_type, permalink: m.permalink ?? null, caption: m.caption ?? null })
    if (Number.isFinite(m.like_count)) out.mediaValues.push({ media_id: m.id, metric: 'like_count', value: m.like_count })
    if (Number.isFinite(m.comments_count)) out.mediaValues.push({ media_id: m.id, metric: 'comments_count', value: m.comments_count })
  }
  if (insightsBlocked) return out
  for (const m of items) {
    const metrics = mediaMetricsFor(m)
    if (!metrics) continue
    try {
      const values = readInsights(await get(`${m.id}/insights`, { metric: metrics.join(',') }))
      for (const v of values) out.mediaValues.push({ media_id: m.id, metric: v.metric, value: v.value })
    } catch (e) {
      if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; break }
      fail(`media ${m.id}`, e)
      if (classify(e) !== 'error') break
    }
  }
  return out
}

/**
 * Read every live Story: one list call, then its totals and its navigation split. A Story
 * appears in /stories only while it is live, so this is the only chance to read it.
 */
export async function readStories({ get, igUserId }) {
  const out = emptyRead()
  const fail = (step, err) => out.failures.push({ step, state: classify(err), detail: err.message })
  let listed
  try {
    listed = await get(`${igUserId}/stories`, { fields: 'id,timestamp,media_type,media_product_type,permalink' })
  } catch (e) {
    if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; return out }
    fail('stories list', e)
    return out
  }
  for (const story of (listed.data ?? []).filter((m) => m?.id && m.timestamp)) {
    out.media.push({ id: story.id, timestamp: story.timestamp, media_type: story.media_type, media_product_type: 'STORY', permalink: story.permalink ?? null, caption: null })
    try {
      const totals = readInsights(await get(`${story.id}/insights`, { metric: MEDIA_METRICS.STORY.join(',') }))
      const navigation = readInsights(await get(`${story.id}/insights`, {
        metric: 'navigation', breakdown: STORY_NAVIGATION_BREAKDOWN, metric_type: 'total_value',
      })).filter((v) => v.metric.startsWith('navigation:'))
      for (const v of [...totals, ...navigation]) out.mediaValues.push({ media_id: story.id, metric: v.metric, value: v.value })
    } catch (e) {
      if (e instanceof BudgetExhausted) { out.stoppedAtBudget = true; break }
      fail(`story ${story.id}`, e)
      if (classify(e) !== 'error') break
    }
  }
  return out
}

/** Fold a read's failures into one run state and a stored detail line. */
export function runState(read) {
  const states = read.failures.map((f) => f.state)
  let state = 'ok'
  if (states.includes('token_invalid')) state = 'token_invalid'
  else if (states.includes('missing_scope')) state = 'missing_scope'
  else if (states.length || read.stoppedAtBudget) {
    const wroteSomething = read.snapshot || read.daysComplete.length || read.audience.length || read.online.length || read.media.length || read.mediaValues.length
    state = wroteSomething ? 'partial' : 'error'
  }
  const details = read.failures.map((f) => `${f.step}: ${f.detail}`)
  if (read.stoppedAtBudget) details.push(`stopped at the ${RUN_BUDGET}-request run budget`)
  return { state, detail: details.length ? details.join('; ').slice(0, 2000) : null }
}

// No ntfy tags: the app renders a tag that matches an emoji short code as an emoji, and
// shows the rest as an extra line to read (notify.mjs, "Header shapes").
const JOB_LABELS = { daily: 'daily Instagram insights read', stories: 'hourly Stories read' }
const ALERTS = {
  ok: (handle, prev, _detail, job) => ({
    title: `${handle} insights are recording again`,
    message: `The ${JOB_LABELS[job]} for ${handle} worked. The previous run was "${prev}".`,
    priority: 'default',
  }),
  partial: (handle, _prev, detail, job) => ({
    title: `${handle} insights: some reads failed`,
    message: `The ${JOB_LABELS[job]} for ${handle} saved part of its data. ${detail ?? ''}`.trim(),
    priority: 'default',
  }),
  missing_scope: (handle) => ({
    title: `${handle} insights: token lacks permission`,
    message: `The saved token for ${handle} cannot read Instagram insights. Follower counts are still recorded. Renew the token with instagram_manage_insights (630 repo: docs/internal/ops/META-PUBLISHING.md).`,
    priority: 'high',
  }),
  token_invalid: (handle) => ({
    title: `${handle} insights: token expired or revoked`,
    message: `Meta rejected the saved token for ${handle}, so nothing was recorded. Renew it (630 repo: docs/internal/ops/META-PUBLISHING.md).`,
    priority: 'high',
  }),
  error: (handle, _prev, detail, job) => ({
    title: `${handle} insights: the ${job === 'stories' ? 'Stories' : 'daily'} read failed`,
    message: `Nothing new was recorded for ${handle}. ${detail ?? ''}`.trim(),
    priority: 'high',
  }),
}

/**
 * The alert for a state change, or null when the state is unchanged or a first run is clean.
 * A token problem is reported by the daily job only, so one expired token sends one alert,
 * not one per job.
 */
export function alertFor({ handle, previous, state, detail, job = 'daily' }) {
  if (previous === state) return null
  if (previous == null && state === 'ok') return null
  if (job === 'stories' && (state === 'missing_scope' || state === 'token_invalid')) return null
  return ALERTS[state](`@${handle}`, previous, detail, job)
}

/**
 * Collect insights for every account flagged `insights: true`.
 * `from`/`to` (both or neither) read that range instead of the lookback and skip media;
 * the range is capped at MAX_RANGE_DAYS and must end before today.
 */
export async function runInsights(env, { accounts, graph, trigger = 'cron', now = new Date(), only = null, from = null, to = null, fetchImpl = fetch } = {}) {
  if (!env.INSIGHTS_DB) throw new Error('INSIGHTS_DB is not bound')
  const today = reportDay(now)
  let days
  if (from || to) {
    if (!isDay(from) || !isDay(to) || from > to) throw new RangeError('from and to must be YYYY-MM-DD days with from <= to')
    if (to >= today) throw new RangeError(`to must be before today (${today} in ${REPORT_TIME_ZONE})`)
    days = dayRange(from, to)
    if (days.length > MAX_RANGE_DAYS) throw new RangeError(`a range covers at most ${MAX_RANGE_DAYS} days`)
  } else {
    days = lookbackDays(now)
  }
  const job = from || to ? 'range' : 'daily'
  const results = []
  for (const [account, acct] of Object.entries(accounts)) {
    if (!acct.insights || (only && only !== account)) continue
    const reader = (get) => readAccount({ get, igUserId: acct.ig_user_id, days, includeMedia: job === 'daily', now })
    results.push(await collectAccount(env, { account, acct, graph, job, trigger, now, today, days, reader, fetchImpl }))
  }
  if (only && !results.length) throw new RangeError(`account ${only} does not collect insights`)
  return { days: { first: days[0], last: days[days.length - 1] }, accounts: results }
}

/** Read every live Story for each insights account (the hourly job). */
export async function runStories(env, { accounts, graph, trigger = 'cron', now = new Date(), fetchImpl = fetch } = {}) {
  if (!env.INSIGHTS_DB) throw new Error('INSIGHTS_DB is not bound')
  const today = reportDay(now)
  const results = []
  for (const [account, acct] of Object.entries(accounts)) {
    if (!acct.insights) continue
    const reader = (get) => readStories({ get, igUserId: acct.ig_user_id })
    results.push(await collectAccount(env, { account, acct, graph, job: 'stories', trigger, now, today, days: [], reader, fetchImpl }))
  }
  return { accounts: results }
}

async function collectAccount(env, { account, acct, graph, job, trigger, now, today, days, reader, fetchImpl }) {
  const startedAt = now.toISOString()
  const tokenBinding = acct.ig_token_binding || 'IG_ACCESS_TOKEN'
  const token = env[tokenBinding]
  let read
  if (!token) {
    read = emptyRead(days)
    read.failures.push({ step: 'token', state: 'error', detail: `${tokenBinding} is not set` })
  } else {
    read = await reader(makeGraph({ graph, token, fetchImpl, budget: { limit: RUN_BUDGET, used: 0 } }))
  }
  const { state, detail } = runState(read)
  const finishedAt = new Date().toISOString()
  const db = env.INSIGHTS_DB
  const previousQuery = job === 'stories' ? db.prepare(PREVIOUS_STORIES_STATE).bind(account) : db.prepare(PREVIOUS_CRON_STATE).bind(account, job)
  const previous = trigger === 'cron' ? ((await previousQuery.first())?.state ?? null) : null

  const statements = []
  if (read.snapshot) {
    statements.push(db.prepare(UPSERT_SNAPSHOT).bind(account, today, read.snapshot.followers_count, read.snapshot.follows_count, read.snapshot.media_count, startedAt))
  }
  if (read.dayValues.length) statements.push(db.prepare(UPSERT_DAY_VALUES).bind(account, startedAt, JSON.stringify(read.dayValues)))
  if (read.audience.length) statements.push(db.prepare(UPSERT_AUDIENCE).bind(account, today, startedAt, JSON.stringify(read.audience)))
  if (read.online.length) statements.push(db.prepare(UPSERT_ONLINE).bind(account, startedAt, JSON.stringify(read.online)))
  if (read.media.length) statements.push(db.prepare(UPSERT_MEDIA).bind(account, startedAt, JSON.stringify(read.media)))
  if (read.mediaValues.length) statements.push(db.prepare(UPSERT_MEDIA_VALUES).bind(today, startedAt, JSON.stringify(read.mediaValues)))
  statements.push(db.prepare(INSERT_RUN).bind(
    account, job, trigger, startedAt, finishedAt, state, days[0] ?? null, days[days.length - 1] ?? null,
    read.daysComplete.length, read.daysFailed.length, read.dayValues.length, read.media.length, detail,
  ))
  await db.batch(statements)

  const alert = trigger === 'cron' ? alertFor({ handle: acct.handle, previous, state, detail, job }) : null
  let alerted = null
  if (alert) alerted = await notify({ topic: env.NTFY_TOPIC, ...alert, fetchImpl })
  return {
    account, job, state, previous, detail,
    daysComplete: read.daysComplete.length, throughDay: read.daysComplete[read.daysComplete.length - 1] ?? null,
    daysFailed: read.daysFailed, dayValues: read.dayValues.length,
    followers: read.snapshot?.followers_count ?? null, audience: read.audience.length, onlineHours: read.online.length,
    mediaRead: read.media.length, mediaValues: read.mediaValues.length,
    alerted: alerted ? alerted.ok : null,
  }
}

const LATEST_RUN = `SELECT job, trigger, started_at, state, first_day, last_day, days_complete, days_failed,
  day_values_written, media_read, detail FROM sync_runs WHERE account = ?1 AND job = ?2 ORDER BY id DESC LIMIT 1`
const LATEST_OK = "SELECT started_at FROM sync_runs WHERE account = ?1 AND job = ?2 AND state = 'ok' ORDER BY id DESC LIMIT 1"
const LATEST_SNAPSHOT = 'SELECT day, followers_count FROM account_snapshots WHERE account = ?1 ORDER BY day DESC LIMIT 1'
const DAY_COVERAGE = `SELECT source, MIN(day) AS first_day, MAX(day) AS last_day, COUNT(DISTINCT day) AS days
  FROM account_metric_days WHERE account = ?1 GROUP BY source`

/** Freshness and coverage per insights account, for /insights/status. */
export async function insightsStatus(env, { accounts }) {
  if (!env.INSIGHTS_DB) throw new Error('INSIGHTS_DB is not bound')
  const db = env.INSIGHTS_DB
  const out = {}
  for (const [account, acct] of Object.entries(accounts)) {
    if (!acct.insights) continue
    const [run, ok, storiesRun, storiesOk, snapshot, coverage] = await db.batch([
      db.prepare(LATEST_RUN).bind(account, 'daily'),
      db.prepare(LATEST_OK).bind(account, 'daily'),
      db.prepare(LATEST_RUN).bind(account, 'stories'),
      db.prepare(LATEST_OK).bind(account, 'stories'),
      db.prepare(LATEST_SNAPSHOT).bind(account),
      db.prepare(DAY_COVERAGE).bind(account),
    ])
    out[account] = {
      handle: acct.handle,
      lastRun: run.results[0] ?? null,
      lastOkAt: ok.results[0]?.started_at ?? null,
      lastStoriesRun: storiesRun.results[0] ?? null,
      lastStoriesOkAt: storiesOk.results[0]?.started_at ?? null,
      latestSnapshot: snapshot.results[0] ?? null,
      coverage: coverage.results,
    }
  }
  return out
}
