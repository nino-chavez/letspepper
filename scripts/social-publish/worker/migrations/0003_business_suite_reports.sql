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
