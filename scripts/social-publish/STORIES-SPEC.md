# Stories firehose — design spec (not yet built)

**Goal:** serve the "where's my highlight?" participation engine — get the *full*
set of event clips out fast, tagged to participants, organized so anyone can find
their team — WITHOUT clogging the feed. Feed stays the curated 2/day craft channel;
Stories carry breadth.

**Why Stories (not feed):** Stories tolerate volume, expire in 24h (no grid
clutter, no feed-algo fatigue), and are exactly where participants hunt for
themselves. Highlights make them permanent and browsable by team/round.

## Hard constraint: no Graph API for Stories publishing
The IG Content Publishing API does **not** publish Stories. So this is **owned
Playwright automation** driving a logged-in session — which carries
action-block/ban risk if run like a bot. The whole design is risk-mitigated.

## Risk mitigations (non-negotiable)
- **Human cadence:** post N stories then long randomized pauses; never burst.
  Daily cap per account (e.g. ≤ 20–30 stories/day), randomized 30–90s gaps.
- **Real session, real device fingerprint:** reuse the browse-tool profile that's
  already logged in (not a fresh headless context).
- **Attended first runs:** operator present for login/checkpoints; not unattended
  until proven stable. Stories are time-sensitive (post in the days after the
  event), so a short attended burst fits the use case anyway.
- **Manual fallback (recommended default):** if automation looks fragile, generate
  a **Highlights-ready export** — clips grouped into folders by team/round with a
  posting checklist — and post via the IG app. Same organization, zero ban-risk.
  Automation is the optimization, not the requirement.

## Organization (the "where's my highlight" UX)
- **Highlights buckets** by **team** (and/or **round / day**). Naming from the
  standings roster (e.g. "1st · Colin Merk", "QF · Court 3").
- Each story: clip + a sticker/label with team + round + the **gallery link**
  (`letspepper.com/gallery`) as the canonical full-footage answer.
- Tag participants where known (drives reshare — the growth lever).

## Data needed (the real blocker, operator-supplied)
- **clip → team/round** map: even a rough per-clip label (which team, which round)
  unlocks bucketing + team-account tagging. Without it, breadth is undifferentiated.
- **player handles** per team (optional, for tagging): from registration/roster.
- Source: the standings roster (`render-standings`/story-assets already encode
  finish order + names) is the closest existing structured source to bootstrap from.

## Pipeline shape (mirrors the reels pipeline)
1. `build-stories-queue.mjs` — scan the event clips, join the clip→team map,
   produce `stories-queue/<event>.json` (item: file, team, round, tags, status).
2. R2 (reuse `letspepper-reels` or a `-stories` prefix) — clips already uploaded
   for reels can be reused.
3. `post-stories.mjs` (Playwright) — drive the logged-in IG session: open Story
   composer → upload → add team/round/gallery sticker → tag → post; human-paced,
   capped, attended. Records status per item (no double-post, same as reels).
4. Optional: after a team's clips are up, add them to that team's **Highlight**.

## Decision points the operator owns
- Automate (Playwright) vs manual-from-export (lower risk). Default: export +
  manual for the first event, automate once the data + cadence are proven.
- Which accounts run the firehose (letspepper for event coverage; flickday/nino
  for craft/BTS — same per-account routing as feed).

## Status
Spec only. Nothing built or executed against Instagram. Next concrete step is the
**clip→team/round map** — it gates both bucketing and tagging regardless of
automate-vs-manual.
