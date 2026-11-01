-- Identification is separate from source metrics; unknown labels stay unknown.
CREATE TABLE story_content (
  media_id TEXT PRIMARY KEY REFERENCES media(media_id),
  title TEXT,
  content_kind TEXT CHECK(content_kind IS NULL OR content_kind IN ('coaching','player_community','tournament','promotion','other')),
  sequence_key TEXT,
  slide_position INTEGER CHECK(slide_position IS NULL OR slide_position > 0),
  elements_json TEXT CHECK(elements_json IS NULL OR (json_valid(elements_json) AND json_type(elements_json)='array')),
  label_source TEXT,
  labeled_at TEXT,
  preview_key TEXT,
  preview_captured_at TEXT,
  preview_sha256 TEXT,
  preview_status TEXT NOT NULL DEFAULT 'not_captured' CHECK(preview_status IN ('not_captured','saved','unavailable','failed'))
);
-- Keep each hourly reading, rather than only the last one on a source day.
CREATE TABLE story_metric_observations (
  media_id TEXT NOT NULL REFERENCES media(media_id),
  metric TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY(media_id,metric,observed_at)
);
-- Existing readings retain their actual timestamps; no earlier hours are invented.
INSERT INTO story_content(media_id) SELECT media_id FROM media WHERE media_product_type='STORY';
INSERT INTO story_metric_observations(media_id,metric,observed_at,value)
SELECT s.media_id,s.metric,s.observed_at,s.value FROM media_metric_snapshots s
JOIN media m ON m.media_id=s.media_id WHERE m.media_product_type='STORY';
