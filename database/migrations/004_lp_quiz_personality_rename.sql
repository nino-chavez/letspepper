-- =============================================================================
-- Let's Pepper: align quiz personalities to the series event/heat names
-- Run against Supabase SQL Editor (shared photography project: skywzpcekhntecegyjoj)
-- =============================================================================
--
-- The "What Pepper Are You?" quiz used serrano/chipotle, off the canonical heat
-- ladder. Align to the series events (poblano, jalapeño) keeping habanero/reaper.
-- Drop the CHECK first so the row rename doesn't violate the old allowlist; keep
-- the existing tally counts.

ALTER TABLE lp_quiz_tallies DROP CONSTRAINT lp_quiz_tallies_personality_check;

UPDATE lp_quiz_tallies SET personality = 'poblano' WHERE personality = 'serrano';
UPDATE lp_quiz_tallies SET personality = 'jalapeno' WHERE personality = 'chipotle';

ALTER TABLE lp_quiz_tallies
  ADD CONSTRAINT lp_quiz_tallies_personality_check
  CHECK (personality IN ('bell', 'poblano', 'jalapeno', 'habanero', 'reaper'));
