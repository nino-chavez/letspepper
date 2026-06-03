-- =============================================================================
-- Let's Pepper: Cross-surface fan identity bridge (Rally HQ ADR-0007)
-- Run against Supabase SQL Editor (letspepper project: skywzpcekhntecegyjoj)
-- =============================================================================
--
-- Maps this site's local `device_id` to the Rally HQ `fan_token` — the anonymous
-- cross-surface identity that lets one human be recognized on both letspepper.com
-- and rallyhq.app. The mapping is 1:1 per device and stable ACROSS events: a
-- device mints its fan_token once (on first engagement) and reuses it everywhere.
-- Rally HQ owns the fan record; this table is only the local lookup.

CREATE TABLE lp_device_fans (
  device_id  UUID PRIMARY KEY,
  fan_token  UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only, matching every other lp_ table: RLS on with no policies
-- denies anon/authenticated outright; the server's service-role key bypasses it.
ALTER TABLE lp_device_fans ENABLE ROW LEVEL SECURITY;
