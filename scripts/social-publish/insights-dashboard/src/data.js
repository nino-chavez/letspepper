/** Read-only view of Graph API observations. Business Suite has a different scope. */
import { reportDay, addDays, dayRange, reportMidnight } from '../../worker/src/insights.js'
import { followerInsight } from './follower-insight.js'

export const ACCOUNT = '630'
export const PERIODS = { 7: '7 days', 30: '30 days', all: 'All recorded' }
export const DEFAULT_PERIOD = '7'
export const PROVISIONAL_DAYS = 2
export const STORY_DAYS = 7
const METRICS = { reach: 'reach', views: 'views', interactions: 'total_interactions', follows: 'follows_and_unfollows:FOLLOWER', unfollows: 'follows_and_unfollows:NON_FOLLOWER' }
export const QUERIES = {
  bounds: `SELECT MIN(day) AS first_day, MAX(day) AS last_day, MAX(last_observed_at) AS observed_at FROM account_metric_days WHERE account = ?1 AND source = 'graph_api' AND metric = 'reach' AND day < ?2`,
  days: `SELECT day, metric, value, last_observed_at FROM account_metric_days WHERE account = ?1 AND source = 'graph_api' AND day BETWEEN ?2 AND ?3 AND metric IN ('reach','views','total_interactions','follows_and_unfollows:FOLLOWER','follows_and_unfollows:NON_FOLLOWER')`,
  posts: `SELECT m.media_id, m.published_at, m.media_type, m.media_product_type, m.permalink, m.caption, m.first_seen_at, m.last_seen_at, s.day AS read_day, s.metric, s.value, s.observed_at
    FROM media m LEFT JOIN media_metric_snapshots s ON s.media_id = m.media_id
      AND s.observed_at = (SELECT MAX(s2.observed_at) FROM media_metric_snapshots s2 WHERE s2.media_id = s.media_id AND s2.metric = s.metric)
    WHERE m.account = ?1 AND m.media_product_type = ?2 AND substr(m.published_at,1,19) >= ?3 AND substr(m.published_at,1,19) < ?4`,
  followers: `SELECT day, followers_count, observed_at FROM account_snapshots WHERE account = ?1 ORDER BY day DESC LIMIT 1`,
  audience: `SELECT day, breakdown, dimension, value, observed_at FROM audience_snapshots WHERE account = ?1 AND day = (SELECT MAX(day) FROM audience_snapshots WHERE account = ?1)`,
  lastRun: `SELECT state, started_at, finished_at FROM sync_runs WHERE account = ?1 AND job = ?2 ORDER BY id DESC LIMIT 1`,
  lastSuccess: `SELECT state, started_at, finished_at FROM sync_runs WHERE account = ?1 AND job = ?2 AND state = 'ok' ORDER BY id DESC LIMIT 1`,
  storiesSince: `SELECT MIN(first_seen_at) AS since FROM media WHERE account = ?1 AND media_product_type = 'STORY'`,
  postsSince: `SELECT MIN(published_at) AS since FROM media WHERE account = ?1 AND media_product_type IN ('FEED','REELS')`,
}
const validPeriod = (p, fallback = DEFAULT_PERIOD) => Object.hasOwn(PERIODS, p) ? p : fallback
const isoAt = (seconds) => new Date(seconds * 1000).toISOString().slice(0, 19)
export const metaTime = (v) => Date.parse(String(v).replace(/\+0000$/, 'Z'))
const latest = (values) => values.filter(v => Number.isFinite(metaTime(v))).sort((a,b) => metaTime(b) - metaTime(a))[0] ?? null

/** Calendar dates never retreat just because collection stopped. */
export function periodWindow(period, bounds, today = reportDay(new Date())) {
  const end = addDays(today, -(PROVISIONAL_DAYS + 1))
  const start = period === 'all' ? bounds?.first_day : addDays(end, -(Number(period) - 1))
  if (!start || start > end) return null
  const days = dayRange(start, end)
  return { start, end, days, previous: period === 'all' ? null : { start: addDays(start, -days.length), end: addDays(start, -1) } }
}
export function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a,b) => a-b), mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2
}
function shapePosts(rows, now) {
  const posts = new Map()
  for (const row of rows) {
    const post = posts.get(row.media_id) ?? { id: row.media_id, publishedAt: row.published_at, type: row.media_product_type, mediaType: row.media_type, permalink: row.permalink, caption: row.caption, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, metrics: {}, observedAt: {} }
    if (row.metric) { post.metrics[row.metric] = row.value; post.observedAt[row.metric] = row.observed_at }
    posts.set(row.media_id, post)
  }
  return [...posts.values()].map(p => ({ ...p, lastRead: latest(Object.values(p.observedAt)), ageDays: Math.max(0, Math.floor((now - metaTime(p.publishedAt)) / 86400000)), live: now - metaTime(p.publishedAt) < 86400000 })).sort((a,b) => metaTime(b.publishedAt) - metaTime(a.publishedAt))
}
function schedule(now, job) {
  const next = new Date(now)
  if (job === 'daily') next.setUTCHours(14,30,0,0)
  else next.setUTCMinutes(45,0,0)
  if (next <= now) next.setTime(next.getTime() + (job === 'daily' ? 86400000 : 3600000))
  const due = new Date(next.getTime() - (job === 'daily' ? 86400000 : 3600000))
  return { nextAt: next.toISOString(), dueAt: due.toISOString(), graceMs: job === 'daily' ? 3600000 : 15 * 60000 }
}
export async function loadDashboard(db, { period = DEFAULT_PERIOD, postsPeriod = '30', now = new Date() } = {}) {
  period = validPeriod(period); postsPeriod = validPeriod(postsPeriod, '30')
  const today = reportDay(now)
  const bounds = await db.prepare(QUERIES.bounds).bind(ACCOUNT,today).first()
  const window = periodWindow(period,bounds,today)
  const metadata = await db.batch([
    db.prepare(QUERIES.followers).bind(ACCOUNT), db.prepare(QUERIES.audience).bind(ACCOUNT),
    db.prepare(QUERIES.lastRun).bind(ACCOUNT,'daily'), db.prepare(QUERIES.lastSuccess).bind(ACCOUNT,'daily'),
    db.prepare(QUERIES.lastRun).bind(ACCOUNT,'stories'), db.prepare(QUERIES.lastSuccess).bind(ACCOUNT,'stories'),
    db.prepare(QUERIES.storiesSince).bind(ACCOUNT), db.prepare(QUERIES.postsSince).bind(ACCOUNT),
  ])
  const [followerRows, audienceRows, dailyAttempt, dailySuccess, storyAttempt, storySuccess, storySinceRows, postSinceRows] = metadata.map(x=>x.results)
  const postsStart = postsPeriod === 'all' ? (postSinceRows[0]?.since ? reportDay(new Date(metaTime(postSinceRows[0].since))) : today) : addDays(today,-(Number(postsPeriod)-1))
  const postsWindow = { start: postsStart, end: today }
  const storiesWindow = { start: addDays(today,-(STORY_DAYS-1)), end: today }
  const firstPostDay = window && window.start < postsStart ? window.start : postsStart
  const [dayRows, feed, reels, stories] = await db.batch([
    db.prepare(QUERIES.days).bind(ACCOUNT,window?.previous?.start ?? window?.start ?? today,window?.end ?? today),
    db.prepare(QUERIES.posts).bind(ACCOUNT,'FEED',isoAt(reportMidnight(firstPostDay)),isoAt(reportMidnight(addDays(today,1)))),
    db.prepare(QUERIES.posts).bind(ACCOUNT,'REELS',isoAt(reportMidnight(firstPostDay)),isoAt(reportMidnight(addDays(today,1)))),
    db.prepare(QUERIES.posts).bind(ACCOUNT,'STORY',isoAt(reportMidnight(storiesWindow.start)),isoAt(reportMidnight(addDays(today,1)))),
  ])
  const values = new Map()
  for (const r of dayRows.results) {
    const entry = values.get(r.day) ?? { day: r.day }
    for (const [key,metric] of Object.entries(METRICS)) if (r.metric === metric) entry[key] = r.value
    values.set(r.day,entry)
  }
  const seriesOn = days => days.map(day => ({ day, ...Object.fromEntries(Object.keys(METRICS).map(k=>[k,values.get(day)?.[k] ?? null])) }))
  const series = seriesOn(window?.days ?? [])
  const previous = seriesOn(window?.previous ? dayRange(window.previous.start,window.previous.end) : [])
  const coverage = Object.fromEntries(Object.keys(METRICS).map(key=>{
    const missing = series.filter(d=>!Number.isFinite(d[key])).map(d=>d.day)
    return [key,{ recorded:series.length-missing.length, expected:series.length, missing, complete:series.length>0 && missing.length===0 }]
  }))
  const comparable = coverage.reach.complete && previous.length > 0 && previous.every(d=>Number.isFinite(d.reach))
  const typical = coverage.reach.complete ? median(series.map(d=>d.reach)) : null
  const previousTypical = comparable ? median(previous.map(d=>d.reach)) : null
  const total = key => coverage[key].complete ? series.reduce((s,d)=>s+d[key],0) : null
  const follows = total('follows'), unfollows = total('unfollows')
  const allPosts = shapePosts([...feed.results,...reels.results],now.getTime())
  const inWindow = (p,w) => w && metaTime(p.publishedAt)>=reportMidnight(w.start)*1000 && metaTime(p.publishedAt)<reportMidnight(addDays(w.end,1))*1000
  const runs = {}
  for (const [job,attempt,success] of [['daily',dailyAttempt[0],dailySuccess[0]],['stories',storyAttempt[0],storySuccess[0]]]) {
    const timing = schedule(now,job)
    runs[job] = { attempt:attempt??null, success:success??null, nextAt:timing.nextAt, overdue:now.getTime() > metaTime(timing.dueAt)+timing.graceMs && (!success || metaTime(success.finished_at)<metaTime(timing.dueAt)), needsAttention:!!attempt && attempt.state!=='ok' }
  }
  const ages = new Map()
  for (const row of audienceRows.filter(r=>r.breakdown==='age,gender')) {
    const age=row.dimension.split(':')[0]; ages.set(age,(ages.get(age)??0)+row.value)
  }
  const cities = audienceRows.filter(r=>r.breakdown==='city').sort((a,b)=>b.value-a.value)
  return {
    period, postsPeriod, today, window, postsWindow, storiesWindow, historyStart:bounds?.first_day??null,
    empty: !series.some(d=>Object.keys(METRICS).some(k=>Number.isFinite(d[k]))),
    series, previous, coverage, summary:{ typical,previousTypical,comparable,ratio:comparable&&previousTypical>0?typical/previousTypical:null,follows,unfollows,net:Number.isFinite(follows)&&Number.isFinite(unfollows)?follows-unfollows:null },
    followerInsight:followerInsight(series,previous),
    runs, dailyThrough:bounds?.last_day??null, dailyReadAt:bounds?.observed_at??null,
    followers:followerRows[0]??null, posts:allPosts.filter(p=>inWindow(p,postsWindow)), overviewPosts:allPosts.filter(p=>inWindow(p,window)),
    stories:shapePosts(stories.results,now.getTime()), storiesSince:storySinceRows[0]?.since??null,
    audience:{ day:audienceRows[0]?.day??null, observedAt:latest(audienceRows.map(r=>r.observed_at)), cityReadAt:latest(cities.map(r=>r.observed_at)), ageReadAt:latest(audienceRows.filter(r=>r.breakdown==='age,gender').map(r=>r.observed_at)), cities:cities.slice(0,10), cityCount:cities.length, ages:[...ages].map(([age,value])=>({age,value})).sort((a,b)=>a.age.localeCompare(b.age,'en',{numeric:true})) },
  }
}
