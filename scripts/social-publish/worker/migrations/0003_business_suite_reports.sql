-- Business Suite's native period reach and top-post snapshot cannot be reconstructed
-- from daily API rows. Keep the validated report together with its source links and
-- capture times. It is a snapshot, never an owned-post inventory or an API substitute.
CREATE TABLE business_suite_reports (
  account TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  through_day TEXT NOT NULL,
  report_json TEXT NOT NULL CHECK (json_valid(report_json)),
  PRIMARY KEY (account, captured_at)
);

-- A failed browser capture must remain visible without replacing the last good report.
CREATE TABLE business_suite_sync_runs (
  account TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ok', 'error')),
  detail TEXT,
  PRIMARY KEY (account, started_at)
);
