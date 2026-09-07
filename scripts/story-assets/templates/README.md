# Social templates

Four data-driven social cards for the Let's Pepper series. Each one renders at both
Instagram sizes — 1080×1350 for the feed and 1080×1920 for a story — from a single
HTML file and a single JSON payload.

None of the four carries a player photo, a player name, or anyone's registration or
payment state, so all four are publishable under `standards/asset-render-standard.md`
as written.

This is the first asset family in the repo driven by
[render-kit](../../../../../tools/render-kit/README.md) rather than a bespoke Playwright
script. That matters beyond tidiness: the render standard's rule R-0 (render work is
dispatched to a model tier, not run inline) is enforced mechanically for `render-kit`
invocations by `~/.claude/hooks/render-dispatch-guard.py`, and only advisory for the
repo's own `render-*.mjs` scripts. Work in this directory is on the mechanical path.

## render.sh

    ./render.sh [name ...]

Re-renders every template at both sizes, or only the names given.

- With no arguments, renders all four: `registration-push`, `weather-notice`,
  `sponsor-thanks`, `series-schedule`.
- Writes `<name>-feed.png` and `<name>-story.png` beside the template.
- Injects `format` per size into a copy of the payload, so one data file drives both.
- Exits non-zero when render-kit reports `failed to load`. render-kit writes the PNG
  and exits 0 in that case, so a missing font or logo would otherwise ship as a
  silently wrong render.

Change a fact by editing `<name>.data.json`, never the HTML. No fact is hard-coded in
a template.

## The four templates

### registration-push

A sign-up drive for one event. The word stack is the composition: one word repeated
four or five times, every row outlined, one row solid in the event's heat color.

- `word`, `repeat` (4–5), `highlight` — the repeated word, how many rows, which row
  is solid. Rows are fitted to the margins and to the available height at render
  time, so a long word bleeds to the edge and a short one sits inset.
- `heat` — `mild`, `medium`, or `hot`. Sets the accent from the heat system in
  `DESIGN-SYSTEM.md`.
- `eyebrow`, `handle`, `stamp` — the small tracked lines above the stack.
- `facts` — two to four `{label, value}` rows. Entry fees and prize amounts do not
  belong here; the repo publishes accolades, not a purse
  (`bell-pepper-2026.mjs:42-43`).
- `cta`, `url` — the button and the small line under it.

### weather-notice

Grass tournaments live on weather, so this one is typographic and icon-free: the
status word carries the card, followed by one line of reason, one line of what to do,
and where updates will be posted.

- `kind` — `update`, `delay`, `moved`, or `cancelled`. The four map onto the heat
  ladder as an urgency ladder: green, yellow, orange, then Habanero red.
- Habanero `#ef4444` is marked reserved in `DESIGN-SYSTEM.md`. `cancelled` is its one
  authorised use in this directory, on the argument that a called-off event is the
  only thing on a social card that outranks the flagship heat.
- `headline` — the status word itself, fitted to the measure and capped so a short
  word like DELAY does not tower over the rest of the canvas.
- `event`, `eyebrow`, `stamp` — which event, and when the call was made.
- `reason`, `next`, `updates_at` — why, what a team should do, and where to look.

The lane is weather, but the card never says weather. `cancelled` covers an organizer
decision too, and the shipped sample is one of those: the 2026 Poblano Pepper Open was
called for low registration, not for a storm.

### sponsor-thanks

A partner grid. Four to eight tiles, two columns up to six and three beyond.

- `tiles` — each `{name, logo?}`. A tile with a `logo` path shows the image; a tile
  without one sets its name as a wordmark, so the grid is complete before every logo
  file is. `slot: true` renders a dashed empty placeholder.
- `headline` — split on `|` to put the second word in the heat color.
- `eyebrow`, `closing` — the season line above and the closing line below.

### series-schedule

The season calendar. A dated list on the near-black ground: date tile left, event and
venue in the middle, heat chip on the end.

- `rows` — each `{m, d, name, where, chip, heat, status?}`. `heat` tints that row's
  date tile, left edge, and chip.
- `status: "cancelled"` keeps a called-off event in its place and stops it
  advertising: struck name, Habanero chip, no heat tint. The site treats cancellation
  the same way, for the same reason — deleting the row leaves the old promotion as the
  only signal (`src/lib/tournaments.ts:44-45`).
- `title` — split on `|` to put the second word in the heat color.
- `mascot` — optional path to an anime pose. The shipped payload uses the Bell Pepper
  champion pose.
- `cta`, `footer` — the closing lines under the rule.

## The facts gate

Every payload carries `facts_confirmed`. When it is `false`, the template renders a
full-width Habanero bar reading `SAMPLE DATA — NOT FOR PUBLICATION` across the top of
the card. This is the same device the 630 VolleyKids draft uses for its unconfirmed
audience field.

Set it `true` only when every string that reaches a pixel has a source — the date and
the venue, but also the call to action, the footer, and the chip labels. A card whose
dates are right and whose CTA invites registration for an event that is over is still
a card carrying a false fact.

Each payload also names its `source` and the date it was `pulled`, which is what gate 3
of the render standard asks for.

Two of the four ship confirmed:

- **`weather-notice`** and **`series-schedule`** are sourced from
  `src/lib/tournaments.ts`, the record the live event pages, the sitemap, and the OG
  share cards all read. Each payload's `source` field cites the lines.
- **`registration-push`** and **`sponsor-thanks`** are unsourced samples and render
  under the bar. No Let's Pepper event is open for registration, and the repo holds no
  sponsor roster, so both would have required inventing the facts they display.

## Render faults are visible, not silent

A JavaScript error part-way through populating a card leaves a tidy-looking canvas with
the facts missing, and render-kit screenshots it and exits 0. Every template populates
inside a guard that paints a full-bleed red panel instead, naming the failure. The
guard also fires when a required field ends up empty.

To see it, blank a required field in a payload and render — for example `reason` in
`weather-notice.data.json`.

## Fonts and offline rendering

`_base.css` holds the shared foundation: the faces, the brand tokens, the ground and
grain, the safe-area frame, and the gate bar. The five families load with `@font-face`
from the committed woff2 files in `../fonts/`, the way `preflight.mjs`'s `localFonts()`
helper loads them. Nothing is fetched at render time; a Google Fonts import can bake
fallback type when the network is slow.

render-kit writes its temporary HTML beside the template, so those relative paths — and
the mascot path in `series-schedule.data.json` — resolve.

## Formats

`RENDER_DATA.format` switches the body class between `feed` and `story`; `render.sh`
sets it. One HTML file serves both.

- **feed** — 1080×1350, 64px side margins.
- **story** — 1080×1920, with the top and bottom 250px left empty for Instagram's own
  chrome. The gate bar is the one element that never sits in that reserve, because a
  warning under the chrome is a warning that gets missed.

## Before publishing

Rendering is not publishing. Gate 0 of the render standard asks for a human look at any
asset headed for social or print, at every model tier. Open the PNG.
