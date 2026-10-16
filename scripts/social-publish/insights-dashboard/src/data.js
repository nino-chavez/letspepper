/**
 * Everything the 630 Instagram dashboard shows, read from the social-insights D1 database
 * the scheduler Worker's insights jobs write (../../INSIGHTS.md). This module only reads:
 * every statement in it is a SELECT, and a test fails if one is not.
 *
 * Numbers come from the Graph API rows only (source 'graph_api'). The Business Suite
 * history is kept for comparison and never mixed in here.
 */

import { reportDay, addDays, dayRange, reportMidnight } from '../../worker/src/insights.js'

export const ACCOUNT = '630'
export const PERIODS = { 7: 'Last 7 days', 30: 'Last 30 days', all: 'All recorded' }
export const DEFAULT_PERIOD = '30'
// Meta can revise a day for up to 48 hours, so the newest two days are shown as provisional.
export const PROVISIONAL_DAYS = 2
export const STORY_DAYS = 7
// A post's lifetime totals keep growing for about a week; younger posts are marked as such.
export const GROWING_DAYS = 7

const DAY_METRICS = {
  reach: 'reach',
  views: 'views',
  interactions: 'total_interactions',
  follows: 'follows_and_unfollows:FOLLOWER',
  unfollows: 'follows_and_unfollows:NON_FOLLOWER',
}

export const QUERIES = {
  bounds: `SELECT MIN(day) AS first_day, MAX(day) AS last_day FROM account_metric_days
    WHERE account = ?1 AND source = 'graph_api' AND metric = 'reach' AND day < ?2`,
  days: `SELECT day, metric, value FROM account_metric_days
    WHERE account = ?1 AND source = 'graph_api' AND day BETWEEN ?2 AND ?3
      AND metric IN ('reach', 'views', 'total_interactions', 'follows_and_unfollows:FOLLOWER', 'follows_and_unfollows:NON_FOLLOWER')`,
  // The newest reading of each metric for each post. Runs read different metrics (the post
  // backfill re-reads only like and comment counts for posts it already read that day), so
  // a post's newest run alone can lack its insights.
  posts: `SELECT m.media_id, m.published_at, m.media_type, m.media_product_type, m.permalink, m.caption,
      s.day AS read_day, s.metric, s.value
    FROM media m JOIN media_metric_snapshots s ON s.media_id = m.media_id
      AND s.observed_at = (SELECT MAX(s2.observed_at) FROM media_metric_snapshots s2 WHERE s2.media_id = s.media_id AND s2.metric = s.metric)
    WHERE m.account = ?1 AND m.media_product_type = ?2 AND substr(m.published_at, 1, 19) >= ?3 AND substr(m.published_at, 1, 19) < ?4`,
  followers: `SELECT day, followers_count FROM account_snapshots WHERE account = ?1 ORDER BY day DESC LIMIT 1`,
  audienceDay: `SELECT MAX(day) AS day FROM audience_snapshots WHERE account = ?1`,
  audience: `SELECT breakdown, dimension, value FROM audience_snapshots WHERE account = ?1 AND day = ?2`,
  lastRun: `SELECT state, started_at FROM sync_runs WHERE account = ?1 AND job = ?2 ORDER BY id DESC LIMIT 1`,
  storiesSince: `SELECT MIN(first_seen_at) AS since FROM media WHERE account = ?1 AND media_product_type = 'STORY'`,
}

const isoAt = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 19)

/** The day window a period covers, ending at the newest complete day with data. */
export function periodWindow(period, bounds) {
  if (!bounds?.last_day) return null
  const end = bounds.last_day
  const start = period === 'all' ? bounds.first_day : maxDay(bounds.first_day, addDays(end, -(Number(period) - 1)))
  const days = dayRange(start, end)
  const previous = { start: addDays(start, -days.length), end: addDays(start, -1) }
  return { start, end, days, previous }
}

const maxDay = (a, b) => (a > b ? a : b)
const minDay = (a, b) => (a < b ? a : b)
const sum = (values) => values.reduce((total, v) => total + v, 0)
/** The middle value: a typical day that a few spikes do not drag around. */
export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function byDay(rows) {
  const out = new Map()
  for (const row of rows) {
    const entry = out.get(row.day) ?? {}
    for (const [key, metric] of Object.entries(DAY_METRICS)) if (row.metric === metric) entry[key] = row.value
    out.set(row.day, entry)
  }
  return out
}

/** Monday-to-Sunday weeks, clipped to the window, with follows and unfollows summed. */
export function weeklyFollows(days, valuesByDay) {
  const weeks = []
  for (const day of days) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() // 0 = Sunday
    const last = weeks[weeks.length - 1]
    if (!last || weekday === 1) weeks.push({ start: day, end: day, days: 0, follows: 0, unfollows: 0, complete: true })
    const week = weeks[weeks.length - 1]
    week.end = day
    week.days += 1
    const v = valuesByDay.get(day) ?? {}
    if (Number.isFinite(v.follows)) week.follows += v.follows
    else week.complete = false
    if (Number.isFinite(v.unfollows)) week.unfollows += v.unfollows
    else week.complete = false
  }
  // A week cut short by either end of the period is not comparable with a full one.
  for (const week of weeks) if (week.days < 7) week.complete = false
  return weeks
}

function shapePosts(rows) {
  const posts = new Map()
  for (const row of rows) {
    const post = posts.get(row.media_id) ?? {
      id: row.media_id, publishedAt: row.published_at, type: row.media_product_type,
      mediaType: row.media_type, permalink: row.permalink, caption: row.caption, readDay: row.read_day, metrics: {},
    }
    post.metrics[row.metric] = row.value
    posts.set(row.media_id, post)
  }
  return [...posts.values()]
}

const metaTime = (value) => Date.parse(String(value).replace(/\+0000$/, 'Z'))

/**
 * Load the dashboard for one period. Returns null-free, display-ready numbers plus the
 * flags the page needs to say what is missing (no comparison, provisional days, empty
 * sections) rather than show a zero.
 */
export async function loadDashboard(db, { period = DEFAULT_PERIOD, now = new Date() } = {}) {
  if (!(period in PERIODS)) period = DEFAULT_PERIOD
  const today = reportDay(now)
  const bounds = await db.prepare(QUERIES.bounds).bind(ACCOUNT, today).first()
  const window = periodWindow(period, bounds)
  const [followers, audienceDay, dailyRun, storiesRun, storiesSince] = await db.batch([
    db.prepare(QUERIES.followers).bind(ACCOUNT),
    db.prepare(QUERIES.audienceDay).bind(ACCOUNT),
    db.prepare(QUERIES.lastRun).bind(ACCOUNT, 'daily'),
    db.prepare(QUERIES.lastRun).bind(ACCOUNT, 'stories'),
    db.prepare(QUERIES.storiesSince).bind(ACCOUNT),
  ])
  const base = {
    period, periodLabel: PERIODS[period], today, window, historyStart: bounds?.first_day ?? null,
    followers: followers.results[0] ?? null,
    runs: { daily: dailyRun.results[0] ?? null, stories: storiesRun.results[0] ?? null },
    storiesSince: storiesSince.results[0]?.since ?? null,
  }
  if (!window) return { ...base, empty: true }

  const storySince = isoAt(reportMidnight(addDays(today, -(STORY_DAYS - 1))))
  const [dayRows, feed, reels, stories, audience] = await db.batch([
    // Back far enough for both the period before and the two "lately" weeks.
    db.prepare(QUERIES.days).bind(ACCOUNT, minDay(window.previous.start, addDays(window.end, -(PROVISIONAL_DAYS + 13))), window.end),
    db.prepare(QUERIES.posts).bind(ACCOUNT, 'FEED', isoAt(reportMidnight(window.start)), isoAt(reportMidnight(addDays(window.end, 1)))),
    db.prepare(QUERIES.posts).bind(ACCOUNT, 'REELS', isoAt(reportMidnight(window.start)), isoAt(reportMidnight(addDays(window.end, 1)))),
    db.prepare(QUERIES.posts).bind(ACCOUNT, 'STORY', storySince, isoAt(reportMidnight(addDays(today, 1)))),
    db.prepare(QUERIES.audience).bind(ACCOUNT, audienceDay.results[0]?.day ?? ''),
  ])

  const values = byDay(dayRows.results)
  const series = window.days.map((day) => ({ day, ...values.get(day), provisional: day > addDays(window.end, -PROVISIONAL_DAYS) }))
  const reachOn = (days) => days.map((day) => values.get(day)?.reach)
  const covered = (days) => reachOn(days).every(Number.isFinite)
  const previousDays = dayRange(window.previous.start, window.previous.end)
  const comparable = covered(previousDays) && covered(window.days)
  const typical = median(reachOn(window.days).filter(Number.isFinite))
  const previousTypical = comparable ? median(reachOn(previousDays)) : null
  const busiest = series.reduce((best, d) => (Number.isFinite(d.reach) && (!best || d.reach > best.reach) ? d : best), null)
  // "Lately" is always the last seven settled days against the seven before, whatever the
  // period: it answers whether things are better or worse right now, and leaves out the
  // newest days, which Instagram may still revise.
  const settledEnd = addDays(window.end, -PROVISIONAL_DAYS)
  const lastWeek = dayRange(addDays(settledEnd, -6), settledEnd)
  const weekBefore = dayRange(addDays(settledEnd, -13), addDays(settledEnd, -7))
  const lately = covered(lastWeek)
    ? { start: lastWeek[0], end: settledEnd, typical: median(reachOn(lastWeek)), before: covered(weekBefore) ? median(reachOn(weekBefore)) : null }
    : null

  const follows = sum(series.map((d) => d.follows).filter(Number.isFinite))
  const unfollows = sum(series.map((d) => d.unfollows).filter(Number.isFinite))
  const posts = [...shapePosts(feed.results), ...shapePosts(reels.results)]
    .sort((a, b) => (b.metrics.views ?? -1) - (a.metrics.views ?? -1))
  for (const post of posts) post.growing = metaTime(post.publishedAt) > now.getTime() - GROWING_DAYS * 86400000
  const storyList = shapePosts(stories.results).sort((a, b) => metaTime(b.publishedAt) - metaTime(a.publishedAt))
  for (const story of storyList) story.live = metaTime(story.publishedAt) > now.getTime() - 86400000

  const cities = audience.results.filter((r) => r.breakdown === 'city').sort((a, b) => b.value - a.value)
  const ages = new Map()
  const genders = { F: 0, M: 0, U: 0 }
  for (const row of audience.results.filter((r) => r.breakdown === 'age,gender')) {
    const [age, gender] = row.dimension.split(':')
    ages.set(age, (ages.get(age) ?? 0) + row.value)
    if (gender in genders) genders[gender] += row.value
  }

  return {
    ...base,
    empty: false,
    series,
    weeks: weeklyFollows(window.days, values),
    summary: {
      typical, previousTypical, comparable, busiest,
      ratio: comparable && previousTypical ? typical / previousTypical : null,
      lately: lately ? { ...lately, ratio: lately.before ? lately.typical / lately.before : null } : null,
      follows, unfollows, net: follows - unfollows,
      topPost: posts.find((p) => Number.isFinite(p.metrics.views)) ?? null,
    },
    posts,
    settledPosts: posts.filter((p) => !p.growing),
    growingPosts: posts.filter((p) => p.growing).sort((a, b) => metaTime(b.publishedAt) - metaTime(a.publishedAt)),
    stories: storyList,
    audience: {
      day: audienceDay.results[0]?.day ?? null,
      cities: cities.slice(0, 10),
      cityCount: cities.length,
      ages: [...ages.entries()].map(([age, value]) => ({ age, value })).sort((a, b) => a.age.localeCompare(b.age, 'en', { numeric: true })),
      genders,
    },
  }
}
