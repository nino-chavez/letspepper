import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// Every number, ID and caption below is invented. This repository is public; 630's real
// Insights live only in the database.
const here = (p) => new URL(p, import.meta.url)
const MIGRATIONS = ['0001_instagram_insights.sql', '0002_stories_audience_online.sql']
  .map((name) => readFileSync(here(`../../worker/migrations/${name}`), 'utf8'))
export const NOW = new Date('2026-10-16T15:00:00Z') // 10 a.m. Central; Oct 16 in Los Angeles
export const PASSPHRASE = 'test passphrase four words'

export function fakeD1() {
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
export function seeded({ through = 44 } = {}) {
  const db = fakeD1()
  const metric = db.sqlite.prepare("INSERT INTO account_metric_days VALUES ('630', ?, ?, ?, 'graph_api', '2026-10-16T14:30:00.000Z', '2026-10-16T14:30:00.000Z')")
  for (let i = 0; i <= through; i += 1) {
    metric.run(day(i), 'reach', 1000 + i * 10)
    metric.run(day(i), 'views', 3000 + i * 20)
    metric.run(day(i), 'total_interactions', 50 + i)
    metric.run(day(i), 'follows_and_unfollows:FOLLOWER', 4)
    metric.run(day(i), 'follows_and_unfollows:NON_FOLLOWER', 3)
  }
  const media = db.sqlite.prepare("INSERT INTO media (media_id, account, published_at, media_type, media_product_type, permalink, caption, first_seen_at, last_seen_at) VALUES (?, '630', ?, ?, ?, ?, ?, '2026-10-16T14:30:00.000Z', '2026-10-16T14:30:00.000Z')")
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
    snap.run(id, '2026-10-16', 'saved', views / 100, '2026-10-16T14:30:00.000Z')
    snap.run(id, '2026-10-16', 'reach', Math.round(views / 2), '2026-10-16T14:30:00.000Z')
    snap.run(id, '2026-10-16', product === 'REELS' ? 'reels_skip_rate' : 'follows', product === 'REELS' ? 41.5 : 3, '2026-10-16T14:30:00.000Z')
  }
  // A later run that read only the like count (as the post backfill does for posts it
  // already read that day) must not hide the insights read earlier.
  snap.run('p3', '2026-10-16', 'like_count', 321, '2026-10-16T15:00:00.000Z')
  media.run('s1', '2026-10-15T18:00:00+0000', 'VIDEO', 'STORY', null, null)
  snap.run('s1', '2026-10-16', 'link_clicks', 0, '2026-10-16T13:45:00.000Z')
  snap.run('s1', '2026-10-16', 'navigation:swipe_forward', 12, '2026-10-16T13:45:00.000Z')
  snap.run('s1', '2026-10-16', 'reach', 120, '2026-10-16T13:45:00.000Z')
  snap.run('s1', '2026-10-16', 'navigation:tap_forward', 40, '2026-10-16T13:45:00.000Z')
  media.run('s0', '2026-10-01T18:00:00+0000', 'VIDEO', 'STORY', null, null) // older than seven days
  const audience = db.sqlite.prepare("INSERT INTO audience_snapshots VALUES ('630', '2026-10-16', ?, ?, ?, '2026-10-16T14:30:00.000Z')")
  for (let i = 1; i <= 12; i += 1) audience.run('city', `Example City ${i}, Illinois`, 200 - i)
  audience.run('age,gender', '13-17:F', 30)
  audience.run('age,gender', '13-17:M', 10)
  audience.run('age,gender', '35-44:F', 50)
  audience.run('age,gender', '35-44:M', 10)
  db.sqlite.prepare("INSERT INTO account_snapshots VALUES ('630', '2026-10-16', 1234, 100, 50, '2026-10-16T14:30:00.000Z')").run()
  const run = db.sqlite.prepare("INSERT INTO sync_runs (account, job, trigger, started_at, finished_at, state, days_complete, days_failed, day_values_written, media_read) VALUES ('630', ?, 'cron', ?, ?, ?, 7, 0, 91, 4)")
  run.run('daily', '2026-10-16T14:30:00.000Z', '2026-10-16T14:30:20.000Z', 'ok')
  run.run('stories', '2026-10-16T13:45:00.000Z', '2026-10-16T13:45:05.000Z', 'partial')
  return db
}

