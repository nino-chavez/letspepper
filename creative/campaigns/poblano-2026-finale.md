# Poblano Open 2026 — Finale Campaign

**Goal:** 28 registered teams by Friday, July 31. **Hook:** $2,000 first place — the largest payout in series history.

Run window: Thursday, July 24 → Saturday, August 1 (event day). Channels: letspepper.com + @letspepper.open.

## Why 28 is the story

Past fields (from `src/lib/standings-data.ts`): Grass Launch 2025 — 16 teams. Bell Pepper Open 2025 — 22. Bell Pepper Open 2026 — 19. 28 teams breaks the series record by six. The money claim and the field claim reinforce each other: biggest payout deserves the biggest field.

> **Verify before publishing any "record" caption:** the standings snapshot does not yet include the Jalapeño Open (Jul 18, 2026). Run `npm run check:rhq-drift`, regenerate the snapshot, and confirm JPO's field size was under 28 before using "biggest field ever" with a number attached.

## Message hierarchy

1. **$2,000 first place.** Concrete number, largest in series history. Lead with it everywhere.
2. **The season closes here.** Final standings, points race, last bracket of the year.
3. **28-team field.** Frame as the field we're building, not a promise — "X of 28 claimed" once real counts exist.
4. **Every team gets covered.** Full photo/video by Flickday Media is the differentiator no other local grass event has. Third beat, never the headline.

Voice gate applies to every caption below (`creative/copy/VOICE.md`): no slang, zero emoji default, exact destinations, max one pepper pun (all captions below use zero).

## Character direction

**Poblano Verde — a new male-presenting poblano — fronts every Poblano Open event surface** (site hero/card/OG, lifecycle masters, campaign masters, the `I'M IN` card). The series runs men's divisions only, so the female-presenting Poblano misrepresents the field on event marketing; the event is named for the poblano, so the stand-in had to be poblano-based, not a borrowed Bell Pepper. She stays in the brand roster (covers, brand share templates, universe band). Verde is a full seven-pose family generated as gpt-image-2 edits of her matching poses (choreography, kit, and style preserved); sources archived at `creative/mascots/sources/poblano-verde-*-chroma.png`, brief in `creative/mascots/EXPANSION-BRIEFS.md`. Swap her back in the day a women's division exists.

## Site (done in this pass)

- `/flavors/poblano-open` — hero shows a display-size `$2,000` stat lockup (data-driven via `payoutHeadline` on the tournament record); headline, prizes list, and feature chips lead with the payout; description carries the 28-team build. OG share card inherits automatically.
- Homepage — hero marquee scrolls `$2,000 FIRST PLACE` for the next event (per-event `payout` field, disappears for events without a cash headline); tournament card description and features lead with it.
- Asset CTA URL fixed: `letspepper.com/flavors/poblano-open` (the `/tournaments/...` path on prior masters 404s — re-render before reusing old story exports).

## Instagram calendar

Assets ship from `creative/exports/media-kit-v1/` after `node scripts/media-kit/render-media-kit.mjs`. New masters this pass: `event/poblano/stories/13-payout`, `14-field-target`; `event/poblano/feed/06-payout`, `07-field-target`.

Placeholders in `{braces}` are publish-time fills from the registration sheet or Rally HQ. **Do not post unresolved braces** (caption-bank rule).

### Thu Jul 24 — soft setup (today)

- Story: `01-next-up` master. Establish the date. Add countdown sticker.
- Create story highlight `POBLANO 26`; every campaign story pins into it.

### Fri Jul 25 — payout announcement (anchor post)

- **Feed:** `06-payout` (4:5).
- Caption: `$2,000 to the winning team. The largest payout in Let's Pepper history, and it's on the line at the season finale. Poblano Open · Saturday, August 1 · Nature Meadows Park, Aurora, IL. Grass triples, one division. Register at letspepper.com.`
- Pinned comment: registration link. Story: `13-payout` same day, link sticker to `/signup`.

### Sat Jul 26 — the field push

- **Feed:** `07-field-target` (4:5).
- Caption: `28 teams. That's the field we're building for the finale — the biggest bracket this series has run. The record is {record} teams. Break it with us. Poblano Open · August 1 · Aurora, IL. Register at letspepper.com. Tag the two you'd run it with.`
- `{record}` = verified prior max after the RHQ drift check (22 if JPO didn't exceed it).
- The "tag your two" line is the growth mechanic — triples means every tag is two-thirds of a roster.

### Sun Jul 27 — stakes: the points race

- **Feed:** standings carousel (screenshot `/standings` or render a data card).
- Caption: `Every placement scores season points, and this is the last event to move. {leader} leads the race at {points}. One bracket left. Poblano Open · August 1. Full standings at letspepper.com/standings.`
- Fill from regenerated snapshot (includes JPO). This post doubles as the JPO results tie-off if results haven't been posted yet.

### Mon Jul 28 — details day

- **Story sequence:** `02-registration` + schedule pattern story.
- Caption/text: `Check-in 8:30 AM. Serve by 9. Pool play into bracket — every point counts for seeding. Nature Meadows Park, Aurora, IL. Register at letspepper.com.`

### Tue Jul 29 — proof: every team gets covered

- **Reel:** best 20–30s of JPO footage from `creative/exports/jpo-capcut-kit`, payout end-card (`13-payout` as final frame).
- Caption: `{play_detail from clip map}. Every team gets this — photo and video on every court, all day. Poblano Open · August 1. Register at letspepper.com. Shot by @flickday.media.`

### Wed Jul 30 — spots update

- **Story (feed too if ≥20 claimed):** `{n} OF 28` over `14-field-target` master.
- Caption: `{n} of 28 spots claimed. Poblano Open · Saturday, August 1. Register at letspepper.com.`
- Registered teams: DM each captain the `I'M IN` share card (`share/templates/im-in`) and ask them to post + tag teammates. This is the highest-leverage action of the week — 20 teams posting beats any brand post.

### Fri Jul 31 — field set / last call

- Morning story if short of 28: `Last call. {n} spots left for tomorrow. Register at letspepper.com.`
- **Feed (evening):** `02-field-set` master.
- Caption: `The field is set. {n} teams, one bracket, $2,000 to the winner. First serve 9 AM. Courts and matchups at letspepper.com/flavors/poblano-open.`
- Story: champion-pick push — `Picks lock at first serve. letspepper.com/predictions.`

### Sat Aug 1 — event day

Run the existing lifecycle masters in order: `03-schedule-live` → `05-pool-play` → `06-bracket-live` → `07-live` (+ `08-weather` as needed) → `09-standings` → `10-gallery`. Post-event: champions feed post, play of the day, photo of the day, gallery link, participant cards. Per `ASSET-STRATEGY.md`: factual updates beat decorative posts all day.

## Cadence and mechanics summary

- One feed post per day Jul 25–27, then Jul 29 reel, Jul 30 conditional, Jul 31 field-set. Stories daily, all pinned to the `POBLANO 26` highlight.
- Registration confirm flow is an IG DM — hold response time under a few hours during the campaign week; a slow confirm kills the momentum the posts create.
- On-site loops to link from stories: `/predictions` (picks lock at first serve), `/quiz`, `/bingo`, `/photo-vote`.

## Open inputs (operator)

1. **Entry fee** — stated nowhere on site or form embed. Fine to keep off public copy, but confirm that's deliberate; "what's it cost" will be the top DM question of the week.
2. **Payout below first** — captions only claim $2,000/1st. If 2nd/3rd pay, say so on the event page prizes list; podium money helps mid-tier teams commit.
3. **28: cap or target?** Copy above frames it as the field we're building. If it's a hard cap, "spots left" language gets stronger — confirm which.
4. **JPO tie-off** — snapshot regen (`npm run check:rhq-drift`) unblocks the Jul 27 standings post and the `{record}` fill.
