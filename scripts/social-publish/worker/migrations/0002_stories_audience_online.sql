-- Stories, audience and online hours (INSIGHTS.md). Same rule as 0001: a value Meta did not
-- return is not stored.

-- Post captions, so a post can be recognized and later labeled by what it was about.
ALTER TABLE media ADD COLUMN caption TEXT;

-- Which job wrote a run: the daily read, a by-hand range backfill, or the hourly Stories
-- read. Alerts compare a scheduled run only with the previous scheduled run of its own job.
ALTER TABLE sync_runs ADD COLUMN job TEXT NOT NULL DEFAULT 'daily' CHECK (job IN ('daily', 'range', 'stories'));

-- Runs written before this column existed: a range backfill is the run whose last day is
-- earlier than the day before it started (Los Angeles time; every such run was in PDT).
UPDATE sync_runs SET job = 'range' WHERE last_day < date(started_at, '-7 hours', '-1 day');

-- Follower audience as Meta reports it on the day read: its top 45 cities, and age by
-- gender. `dimension` is Meta's dimension values joined with ':' (for example '18-24:F').
-- Top-45 lists cover only part of the followers, so these rows are never summed into a
-- follower total.
CREATE TABLE audience_snapshots (
  account TEXT NOT NULL,
  day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  breakdown TEXT NOT NULL CHECK (breakdown IN ('city', 'age,gender')),
  dimension TEXT NOT NULL,
  value INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (account, day, breakdown, dimension)
);

-- Followers online by hour, exactly as Meta labels them: `period_end` is the value's
-- end_time and `hour` its hour key. Which time zone those hours are in is not yet checked
-- against Business Suite (INSIGHTS.md), so nothing converts them.
CREATE TABLE online_followers (
  account TEXT NOT NULL,
  period_end TEXT NOT NULL,
  hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  value INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (account, period_end, hour)
);
