# Instagram insights

`letspepper-reels-worker` reads Instagram insights once a day and stores them in the
`social-insights` D1 database. The job only reads. It runs on its own daily cron, so it
cannot publish, and a failure in it cannot stop a post.

It covers every account marked `insights: true` in the Worker's `ACCOUNTS` registry
(`worker/src/index.js`). Today that is @630volleyball.

Code: `worker/src/insights.js`. Schema: `worker/migrations/`. Tests:
`worker/test/insights.test.mjs`.

## What it records

| Table | One row per | Holds |
|---|---|---|
| `account_metric_days` | account, day, metric, source | Daily account totals |
| `account_snapshots` | account, day | `followers_count`, `follows_count`, `media_count` as read that day |
| `media` | post | Every feed post and Reel the job has seen |
| `media_metric_snapshots` | post, day, metric | A post's lifetime totals as read that day |
| `sync_runs` | account, run | What each run read, its state, and any error |

A day is Meta's reporting day: midnight to midnight in America/Los_Angeles, the same days
Business Suite shows. A value Meta did not return is not stored, so a missing row means
"not observed", never zero.

Each daily run reads the account's profile counts. It re-reads the last seven complete
days, because Meta can revise a day for up to 48 hours. It also reads lifetime totals for
posts published in the last 14 days. A later reading replaces an earlier one, and
`first_observed_at` keeps the first.

## Metric names

Rows from the API carry `source = 'graph_api'` and Meta's own metric names: `reach`,
`views`, `total_interactions`, `likes`, `comments`, `saves`, `shares`, `replies`,
`reposts`, `profile_links_taps`, `accounts_engaged`. Follows and unfollows keep Meta's
breakdown names:

| Stored metric | Means |
|---|---|
| `follows_and_unfollows:FOLLOWER` | Follows that day |
| `follows_and_unfollows:NON_FOLLOWER` | Unfollows that day, including accounts that left Instagram |

On 2026-10-15 those two matched Business Suite's Audience > Trends for Oct 6, 7, 8 and 12.
The same check fixed the day window. Meta includes the window's end, so a window ending at
the next midnight returned two days summed. The job ends each window one second earlier.
With that window, reach and interactions for Oct 6, 7 and 12 equal Business Suite's.

Post metrics are lifetime totals: `views`, `reach`, `saved`, `shares`, `likes`,
`comments`, `total_interactions`. Reels add `ig_reels_avg_watch_time` and
`ig_reels_video_view_total_time`, both in milliseconds. `like_count` and `comments_count`
come from the post itself and need no insights permission.

Daily reach counts unique accounts for that day only. Never add daily reach together to get
a weekly or monthly reach.

## Business Suite history

Before the token could read insights, Sep 1 to Oct 14, 2026 was copied from Business Suite.
Those rows carry `source = 'business_suite'` and Business Suite's own measures:

| Stored metric | Business Suite measure |
|---|---|
| `views_including_facebook_crossposts` | Views, including Facebook crossposts. Not comparable with API `views` |
| `reach` | Daily accounts reached |
| `content_interactions` | Content interactions |
| `profile_visits` | Profile visits |
| `link_clicks` | Link clicks |
| `follows`, `unfollows` | Audience > Trends, per day |

The two sources stay in separate rows and are compared, not merged.
`import-business-suite-insights.mjs` turns a capture folder into the import SQL. It
refuses any capture whose daily follows and unfollows do not add up to Business Suite's
weekly totals.

## Reading the data

Run queries from the repo root.

```bash
pnpm exec wrangler d1 execute INSIGHTS_DB --remote --config scripts/social-publish/worker/wrangler.jsonc \
  --command "SELECT day,
       MAX(CASE WHEN metric = 'follows_and_unfollows:FOLLOWER' THEN value END) AS follows,
       MAX(CASE WHEN metric = 'follows_and_unfollows:NON_FOLLOWER' THEN value END) AS unfollows,
       MAX(CASE WHEN metric = 'reach' THEN value END) AS reach,
       MAX(CASE WHEN metric = 'total_interactions' THEN value END) AS interactions
     FROM account_metric_days
     WHERE account = '630' AND source = 'graph_api' AND day >= date('now', '-30 days')
     GROUP BY day ORDER BY day"
```

`GET /insights/status?key=<TRIGGER_KEY>` shows each account's last run and last good run.
It also shows the latest follower count and which days each source covers.

## Running it by hand

`GET /insights/run?key=<TRIGGER_KEY>` runs the daily read now.

`GET /insights/run?key=<TRIGGER_KEY>&from=YYYY-MM-DD&to=YYYY-MM-DD` reads a range of past
days and skips posts. Optional `&account=630` limits it to one account. A range covers at
most 60 days and must end before today in Los Angeles.

One run spends at most 45 Graph requests, which covers about 22 days of a range. A range
that runs out says `stopped at the 45-request run budget`. Run it again from the day after
that account's `throughDay` in the response.

## Alerts

Every run records one of these states per account in `sync_runs`:

| State | Means |
|---|---|
| `ok` | Everything requested was read |
| `partial` | Some reads failed or the run budget ran out; the rest was saved |
| `missing_scope` | The token lacks `instagram_manage_insights`. Profile counts and post likes are still saved |
| `token_invalid` | Meta rejected the token as expired or revoked |
| `error` | Nothing new was saved; `detail` says why |

A phone alert goes to `NTFY_TOPIC` only when an account's state differs from its previous
run's. A problem that lasts several days alerts once, and its recovery alerts once.

## The token

The job reads 630 with `IG_630_ACCESS_TOKEN`, the Worker's copy of `Meta 630 Publisher` in
1Password. That token must include `instagram_manage_insights`. The 630 repo owns the
renewal steps in `docs/internal/ops/META-PUBLISHING.md`. A renewal is not finished until
the Worker's copy is replaced too:

```bash
op read 'op://Developer Secrets/Meta 630 Publisher/credential' \
  | pnpm exec wrangler secret put IG_630_ACCESS_TOKEN --config scripts/social-publish/worker/wrangler.jsonc
```

Meta's data-access window ends 90 days after the last sign-in to the app. `debug_token`
reports it as `data_access_expires_at`. Renew before that date, or the job's state turns
to `token_invalid`.

## Not covered

- Stories. The media list does not include them, and their insights last 24 hours.
- Audience demographics.
- Which accounts followed or unfollowed. Meta reports counts only.
- A dashboard. Query the tables, or read `/insights/status`.
