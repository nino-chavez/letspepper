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

## The dashboard

`630-instagram-insights` (`insights-dashboard/`) is a separate, read-only Worker over the
same database, for Nino and 630's director. Its Overview starts with three questions:
are more accounts seeing us, which posts deserve a closer look, and how did follower
numbers change? Persistent navigation opens Posts, Stories, Audience, and Data status.
The contextual help drawer explains each measure, how to read it, what to inspect next,
and what it cannot establish.

Overview defaults to seven reporting days. The window ends three days before today's
Los Angeles reporting date, leaving the two newest completed reporting days out. The
30-day option follows the same rule. Missing collection never moves these dates backward.
All recorded starts with the first recorded reach day and has no invented earlier period.
Reach is compared only when both complete periods are recorded. Follows and unfollows
each require all selected dates; net change requires both. Missing readings break chart
lines, remain visible in the tables, and are listed in Data status. Zero remains zero.

Posts has its own publication-date filter, ending today. An Overview action opens the
posts from the exact Overview dates and resets unrelated search/format filters. Rankings
use lifetime totals at each metric's own last reading; older posts are not labeled final.
Post details show those timestamps and the original Instagram link when available.
The list includes collected posts even when no metrics were returned. Collab posts started
by other accounts may be absent.

Stories covers publications in the last seven reporting days, independently of Overview.
It keeps link clicks and each navigation action separate; missing actions are not zero.
Expired Stories retain their last capture without claiming it is final. Audience combines
the selected follower-flow dates with separately dated follower-count and category
snapshots. City lists are partial; age does not identify parents or athletes. Online-hour
advice and the mismatched profile-link measure remain withheld. Ask the club director
for the current registration scorecard; no verified public scorecard destination is wired.

Data status separates the latest attempt from the last fully successful completion.
It computes the next check from the actual daily 14:30 UTC and hourly :45 schedules,
with Central-time labels that follow daylight saving. It flags overdue updates after a
one-hour daily or fifteen-minute hourly allowance. Individual metric timestamps remain
the source for freshness; a successful run does not refresh every old post.

Follower guidance compares follows and unfollows separately across complete periods of
equal length. It describes observed differences and suggests what to inspect; it does
not assign a cause or label a change statistically significant. Business Suite uses
its source-labeled daily readings through the last reported follower day. An incomplete
earlier period remains a baseline, even when native period totals are available.

An open dashboard checks for saved readings by reloading after five minutes. It waits
until the tab is visible and has been idle for one minute, with no focused form field
or open help/details. The current URL preserves page and filter choices. This refresh
reads the database; it does not trigger a new collection from Instagram.

### Dated follower handles

`/followers` reads complete owner exports from `follower_handle_snapshots`. The first
export is a baseline, with no additions or absences claimed. Later exports compare with
the preceding dated export. The reader can select a historical export, inspect Added or
Absent in later export, and search or page through the handles. This route uses the same
sign-in as the rest of the dashboard. It only reads the database.

These lists update after an owner export is imported, not through the daily aggregate
collector. A changed handle can appear as an addition and an absence. Absence alone
cannot establish an unfollow, age, graduation, ban, block, deletion, hacking, or bot
status. Activity between exports is invisible. Use known club records for program-stage
questions; do not infer age from a handle or photo.

**First real import remains pending.** Synthetic tests validate the importer and
comparison behavior. They do not establish that an actual owner export has been
obtained, that its format matches, or that Meta included every account.

To import an official export:

1. In Accounts Center, verify the selected profile is `630volleyball`. Request Followers
   and following, all time, JSON, to the owner's device. Preserve every archive part and
   the export preparation timestamp shown by the source. Do not substitute today's
   import time for an unknown export timestamp.
2. Keep raw archives and extracted files outside this public repository, under the
   private `630-instagram-tracking/owner-exports/<export-date>/` directory. Never commit
   real handles, screenshots, or raw JSON. Inspect the archive's profile identity and
   file inventory. The handle array itself does not identify the owning account.
3. Create `manifest.json` beside the extracted directory. The example below is a
   template: its timestamp is invented, and both verification flags must stay false
   until the account and complete file set have been checked against the owner export.

```json
{
  "version": 1,
  "account": "630volleyball",
  "source": "instagram_accounts_center",
  "exported_at": "2026-10-01T12:00:00Z",
  "date_range": "all_time",
  "format": "json",
  "account_verified": false,
  "all_parts_verified": false,
  "follower_files": ["connections/followers_and_following/followers_1.json"]
}
```

4. List every follower JSON path relative to the extracted directory. The importer
   scans for `followers.json` or `followers_N.json`, verifies the reviewed inventory and
   numbered sequence, and rejects malformed entries, duplicates and empty lists. It
   accepts arrays of `string_list_data` records, or a `relationships_followers` wrapper.
   An unfamiliar real format must be reviewed before extending the parser. These checks
   cannot detect a final export part that was never supplied or an omission by Meta;
   the complete-archive review is required. Preserve that review with the private files.
5. Run `node scripts/social-publish/import-follower-export.mjs --directory <extracted>
   --manifest <manifest.json> --receipt <new-validation-receipt.json>` from the repo.
   It validates only. Check the count against the source and investigate any discrepancy;
   the current profile total may have changed since the export was prepared.
6. With the existing Cloudflare account-ops secret supplied as `CLOUDFLARE_ACCOUNT_ID`
   and `CLOUDFLARE_API_TOKEN`, repeat with `--apply` and a new receipt filename. The
   importer uses bound parameters and one atomic row. It reads the saved handles and
   provenance back before writing a success receipt. Repeating the same import is
   idempotent; different content at the same export timestamp is rejected.
7. Verify `/followers` shows the export date, count and baseline/comparison state. Keep
   the receipt beside the source archives. Update the private tracker only after that
   readback succeeds. Request another export when the next comparison is needed.

The immutable row stores normalized handles and SHA-256 hashes of each source file.
One JSON value avoids partial multi-batch imports; the importer rejects values above
1.5 MB. This is smaller than a separate membership table for this account's current
size, while preserving the same set comparisons. No new write endpoint, cron, token,
or collection of follower profile attributes is introduced.

One passphrase signs a viewer in for 30 days. It lives in 1Password as
`Cloudflare 630-instagram-insights` and is the Worker's `DASHBOARD_PASSPHRASE` secret;
changing it signs everyone out. Sign-in attempts are limited to ten a minute per address.
Every response is uncached, unindexed, and served under a content security policy.

The Worker never writes: its queries are all `SELECT`, and a test fails otherwise. Its
`wrangler.jsonc` declares no migrations; this Worker's schema stays owned by
`worker/wrangler.jsonc`. `.github/workflows/deploy-insights-dashboard.yml` tests it on pull
requests and deploys it from `main`. Its tests use invented data only. Run `pnpm social:dashboard:test` for read-model,
request/authentication, and production-packaging checks. The packaging check runs the
pinned Wrangler bundle and includes a deliberately broken name-helper configuration. Run `node --experimental-default-type=module
scripts/social-publish/insights-dashboard/test/browser.mjs` under Node 22 for the
Playwright walk against a local workerd runtime and disposable D1 database. The browser
walk packages through Wrangler and freezes only its fixture clock, exercises desktop and phone states, and writes
captures to `.artifacts/insights-redesign/live-build` (locally ignored). It does not access
Instagram or production data.

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

`GET /insights/posts?key=<TRIGGER_KEY>&since=YYYY-MM-DD` reads every post published since
that day: caption and lifetime totals, paging back through the post list up to 200 posts.
The daily run reads only the last 14 days of posts, so this is how older posts get their
rows. Posts already read that Los Angeles day are skipped, so when a call reports
`postsRemaining` above 0, call it again until it reaches 0. It is recorded as a `range` run
and never alerts.

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
once, and its recovery alerts once. A clean first run sends nothing. Token problems
(`missing_scope`, `token_invalid`) belong to the daily job: the Stories job neither alerts
on one nor compares against one, so an expired token sends one alert and its renewal one
recovery alert.

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
- Posts another account published with 630 as a Collab collaborator. The API lists only
  posts the account itself published, so those never get rows. Checked on 2026-10-16 against
  Business Suite's top 12 posts since Sep 1 (captured 2026-10-15): 11 were in the API's
  list, and the missing one, a Collab carousel another account started, had the most views
  of the 12.
- What a post was about. Captions are stored; labeling posts by topic is a later step.
- Online hours on the dashboard, until two weeks are recorded and their time zone is
  checked.

## Unified Business Suite reports

The private dashboard also reads native Business Suite reports from the same D1
 database. `business_suite_reports` keeps each validated report, its native period
reach, Instagram-only and Facebook-crosspost views, link clicks, current follower
snapshot, historical weekly backfill, and top-12 lifetime post snapshot. Daily
observations also upsert into `account_metric_days` with `source = 'business_suite'`.
API rows remain independent. A newer observation wins; missing values cannot erase
observed values. Reports and real captions stay in private storage, never this repo.

`capture-business-suite.mjs` owns the browser capture. It checks the asset, Instagram
selection, rendered dates, six chart series, Audience > Trends follower totals, and
the Instagram Feed filter with descending displayed views. It rereads 14 source days
through yesterday in Los Angeles. `refresh-business-suite.mjs` imports the validated
report through the D1 query API with bound parameters, then reads back the saved report and affected daily values.
`business-suite-report.mjs` owns parsing and identity checks. `business-suite-import.mjs`
owns bound writes, following the API collector’s JSON parameter pattern. Set both
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` from the existing Cloudflare
account-ops 1Password item. The runner reads the database ID from `INSIGHTS_DB`;
it does not discover accounts or put the report inside SQL text.
See [D1 query parameters](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
and [D1 value and SQL limits](https://developers.cloudflare.com/d1/platform/limits/).

The daily local automation points at that runner. Its durable private tracker records
the previous validated report path, evidence directory and sync receipt. The Google
Sheet is a retained historical reference after database cutover; no dashboard query
reads it. A browser sign-in or source-layout failure preserves the previous database
report and is reported as failed. A successful API collection is separate from a
successful Business Suite refresh.

The authenticated `/business-suite` dashboard view shows account-period totals and
per-day averages, source links, delayed follower dates, daily readings and the labeled
historical backfill. `/business-suite?view=posts` shows only the top-12 lifetime snapshot,
including unverified ownership and missing links. It is not a full post inventory.
The existing Overview, Posts, Stories and Audience pages retain API definitions.
Native period reach is read from its source card; it is never calculated by summing
 daily reach. Handle comparisons use complete dated owner exports on `/followers`. Partial browser
observations cannot establish absences and are not imported as complete snapshots.

## Shared counting rules

`analytics-contract.mjs` owns the first shared Instagram and website definitions,
calendar windows, calculations, and operator answers. The dashboard imports it
at build time. The private 630 scorecard uses a byte-identical copy pinned to a
letspepper commit and SHA-256; its verifier rejects edits to that copy.

Instagram daily follows and unfollows are summed only when their respective
period is complete. Net follows needs both complete flows. Typical reach is the
median daily reach, never the sum of unique daily audiences. The seven-day
window follows the Pacific calendar and leaves out two recently completed days;
a stopped collector does not move those dates backward. Native Business Suite
periods remain separate observations, with their source and dates visible.

Website visits are distinct anonymous sessions containing a canonical-host
pageview during seven complete Central-time days. A registration handoff is a
subsequent `registration_link_clicked` event to a LeagueApps program route or
program ID, in the same session and reporting window. Instagram arrivals use
the session's entry referrer or `instagram`/`ig` campaign source. Missing data
stays unavailable; a zero denominator has no rate. These observations do not
identify people or prove registrations, causes, or follower identities.

The existing PostHog dashboard is linked from Audience. Its shared query and the
weekly scorecard use the same definitions. The help drawer explains the date,
source, and counting differences under “The same counting rules in each report.”

Verification: `pnpm social:dashboard:test` includes missing, invalid, conflicting,
zero, calendar, and query-response cases. The browser suite checks the compiled
Worker on desktop and phone, including the shared help drawer. For real-source
parity, `verify-shared-analytics.mjs` accepts an explicit private scorecard module
and a private receipt path. It compares both consumers and independently checks
D1 flow sums and coverage. Supply the existing D1/PostHog read credentials through
1Password environment injection; never put them in a command argument or file.
