-- Instagram insights history, written once a day by the scheduler Worker's insights
-- job (src/insights.js) and read by people, never by the publisher. INSIGHTS.md owns
-- what each table means and how to query it.
--
-- One rule runs through every table: a value Meta did not return is not stored. Meta
-- answers a missing or delayed metric with an empty data set, not 0, so there is no
-- NULL column to overwrite an observed number with, and "no row" always means "not
-- observed".

-- Account-level daily totals. `day` is Meta's reporting day in America/Los_Angeles.
-- `metric` is Meta's metric name; a breakdown value is appended after a colon, exactly
-- as Meta names it (follows_and_unfollows:FOLLOWER). `source` keeps the Graph API apart
-- from the Business Suite history seeded before the API had insights access, because
-- the two are read differently and are compared, not merged.
CREATE TABLE account_metric_days (
  account TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('graph_api', 'business_suite')),
  first_observed_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL,
  PRIMARY KEY (account, day, metric, source)
);

-- One profile reading per account per Los Angeles day; a later run that day replaces
-- it. followers_count is the only follower series that needs no insights permission.
CREATE TABLE account_snapshots (
  account TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  followers_count INTEGER NOT NULL,
  follows_count INTEGER NOT NULL,
  media_count INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (account, day)
);

-- Every feed post and Reel the job has seen. Stories are not listed by the media edge
-- and their insights last 24 hours, so they are out of scope here.
CREATE TABLE media (
  media_id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  published_at TEXT NOT NULL,
  media_type TEXT NOT NULL,
  media_product_type TEXT NOT NULL,
  permalink TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX media_by_account_published ON media (account, published_at);

-- A post's lifetime totals as read on one Los Angeles day. Reading the same post on
-- later days shows how its totals grew; a later run the same day replaces that day's
-- reading.
CREATE TABLE media_metric_snapshots (
  media_id TEXT NOT NULL REFERENCES media (media_id),
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  metric TEXT NOT NULL,
  value INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (media_id, day, metric)
);

-- One row per account per run. The alert compares a run's state with the previous
-- run's, so a standing problem notifies once, not every day.
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok', 'partial', 'missing_scope', 'token_invalid', 'error')),
  first_day TEXT,
  last_day TEXT,
  days_complete INTEGER NOT NULL,
  days_failed INTEGER NOT NULL,
  day_values_written INTEGER NOT NULL,
  media_read INTEGER NOT NULL,
  detail TEXT
);

CREATE INDEX sync_runs_by_account ON sync_runs (account, id);
