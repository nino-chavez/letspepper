-- Owner-supplied, complete, all-time exports. One atomic immutable row per export.
-- Raw files stay outside the public repository; provenance keeps their SHA-256 hashes.
CREATE TABLE follower_handle_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  account TEXT NOT NULL CHECK(account = '630volleyball'),
  exported_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  handle_count INTEGER NOT NULL CHECK(handle_count > 0),
  handles_json TEXT NOT NULL CHECK(json_valid(handles_json) AND json_type(handles_json) = 'array' AND json_array_length(handles_json) = handle_count),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  UNIQUE(account, exported_at)
);
