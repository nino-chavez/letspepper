# Instagram insights

`letspepper-reels-worker` reads Instagram insights and stores them in the `social-insights`
D1 database. Two jobs do the reading: a daily one at 9:30 a.m. Central, and an hourly
Stories one at 45 minutes past each hour. Both only read. Each runs on its own cron, so
neither can publish, and a failure in either cannot stop a post.

It covers every account marked `insights: true` in the Worker's `ACCOUNTS` registry
(`worker/src/index.js`). Today that is @630volleyball.

Code: `worker/src/insights.js`. Schema: `worker/migrations/`. Tests:
`worker/test/insights.test.mjs`. The test fixtures keep the shape of real Meta responses
but carry invented numbers, IDs and city names: this repository is public, and 630's real
Insights live only in the database.

## What it records

| Table | One row per | Holds |
|---|---|---|
| `account_metric_days` | account, day, metric, source | Daily account totals |
| `account_snapshots` | account, day | `followers_count`, `follows_count`, `media_count` as read that day |
| `media` | post or Story | Every feed post, Reel and Story the jobs have seen, with the post's caption |
| `media_metric_snapshots` | post, day, metric | A post's or Story's lifetime totals, as last read that day |
| `audience_snapshots` | account, day, breakdown, dimension | Followers by city (Meta's top 45) and by age and gender, as read that day |
| `online_followers` | account, Meta day, hour | Followers online in each hour, as Meta labels it |
| `sync_runs` | account, run | Which job ran, what it read, its state, and any error |

A day is Meta's reporting day: midnight to midnight in America/Los_Angeles, the same days
Business Suite shows. A value Meta did not return is not stored, so a missing row means
"not observed", never zero.

Each daily run reads the account's profile counts. It re-reads the last seven complete
days, because Meta can revise a day for up to 48 hours. It reads the follower audience and
the last four days of online hours. It also reads the caption and lifetime totals of every
post published in the last 14 days. A later reading replaces an earlier one, and
`first_observed_at` keeps the first.

Each hourly run reads every Story that is live. A Story's insights disappear 24 hours after
it is posted, so the last hourly reading before then is its near-final result. Within one
day, a later reading replaces an earlier one.

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

Post metrics are lifetime totals. Each list was checked against live calls on 2026-10-15,
because Meta refuses the whole request when one metric does not apply:

| Kind | Metrics |
|---|---|
| Feed post | `views`, `reach`, `saved`, `shares`, `likes`, `comments`, `total_interactions`, `follows`, `profile_visits`, `profile_activity`, `reposts` |
| Reel | `views`, `reach`, `saved`, `shares`, `likes`, `comments`, `total_interactions`, `ig_reels_avg_watch_time` and `ig_reels_video_view_total_time` (milliseconds), `reels_skip_rate` (a percentage with a decimal), `reposts` |
| Story | `reach`, `views`, `replies`, `shares`, `follows`, `profile_visits`, `total_interactions`, `link_clicks`, `navigation`, and `navigation:tap_forward`, `:tap_back`, `:tap_exit`, `:swipe_forward` |

Reels do not report `follows` or `profile_visits`, and `crossposted_views` and
`facebook_views` failed outright, so none of those is read. `like_count` and
`comments_count` come from the post itself and need no insights permission.

Audience rows keep Meta's cut: its top 45 cities, and age by gender (`dimension` reads
like `18-24:F`). The cities cover only part of the followers, so never add them up as a
follower count. Online-hours rows keep Meta's own `end_time` and hour number. Which time
zone those hours are in has not been checked against Business Suite yet, so read them as
Meta's labels until it is.

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

`GET /insights/status?key=<TRIGGER_KEY>` shows each account's last daily run and last good
one, the same for the Stories job, the latest follower count, and which days each source
covers.

## Running it by hand

`GET /insights/run?key=<TRIGGER_KEY>` runs the daily read now.
`GET /insights/stories?key=<TRIGGER_KEY>` reads the live Stories now.

`GET /insights/run?key=<TRIGGER_KEY>&from=YYYY-MM-DD&to=YYYY-MM-DD` reads a range of past
days and skips posts. Optional `&account=630` limits it to one account. A range must end
before today in Los Angeles and covers at most 22 days. Backfill a longer period in
22-day pieces.

One run spends at most 45 Graph requests, which keeps it under the Workers Free plan's
cap of 50. A daily run spends about 31 for 630. If more than 26 posts fall in the 14-day
window, the run saves what it read and reports `stopped at the 45-request run budget`. A
Stories run spends one request plus two per live Story. A Graph request that has not
answered within 20 seconds counts as a failed read, so a hung request cannot keep a run
from recording itself.

A run started by hand returns its result to the caller. It never sends a phone alert and
never changes what the next scheduled run alerts about.

## Alerts

Every run records its job (`daily`, `range` or `stories`) and one of these states per
account in `sync_runs`:

| State | Means |
|---|---|
| `ok` | Everything requested was read |
| `partial` | Some reads failed or the run budget ran out; the rest was saved |
| `missing_scope` | The token lacks `instagram_manage_insights`. Profile counts and post likes are still saved |
| `token_invalid` | Meta rejected the token as expired or revoked |
| `error` | Nothing new was saved; `detail` says why |

A scheduled run sends a phone alert to `NTFY_TOPIC` only when an account's state differs
from the previous scheduled run of the same job. A problem that lasts several days alerts
once, and its recovery alerts once. A clean first run sends nothing. A token problem
(`missing_scope`, `token_invalid`) is alerted by the daily job only, so one expired token
sends one alert rather than one an hour.

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

- Which accounts followed or unfollowed. Meta reports counts only.
- Clicks on the profile's website link. Business Suite shows them, but the API's
  `profile_links_taps` returned 0 every day for 630 while Business Suite showed clicks on
  most days, so the number is stored but should not be read as link clicks.
- What a post was about. Captions are stored; labeling posts by topic is a later step.
- A dashboard. Query the tables, or read `/insights/status`.
