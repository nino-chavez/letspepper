# Jalapeño Open CapCut Kit

This is the centralized, import-ready working kit for Jalapeño Open highlight
Reels. Everything here is copied from the production creative export or the
verified JPO graphic set, so the folder can be moved or imported without relying
on project symlinks.

## Start here

For the cleanest result, import the `.mov` files in `01-motion-alpha` directly.
They are ProRes 4444 overlays with transparency. If CapCut does not preserve the
alpha channel, use the matching `.mp4` from `02-motion-screen` and set its blend
mode to **Screen**.

Recommended first import:

- `01-motion-alpha/jalapeno-entry.mov`
- `01-motion-alpha/brand-intro.mov`
- `01-motion-alpha/ace-stamp.mov`
- `01-motion-alpha/block-stamp.mov`
- `01-motion-alpha/dig-stamp.mov`
- `03-jpo-event/bug.png`
- `03-jpo-event/intro-reel.png`
- `03-jpo-event/outro-reel.png`
- `10-guides/reel-safe-zones.png`

## Folder map

- `01-motion-alpha` — transparent motion overlays; preferred format.
- `02-motion-screen` — black-background fallbacks for Screen blend mode.
- `03-jpo-event` — Jalapeño Open intro, outro, bug, and result treatments.
- `04-moment-stamps` — short post-play punctuation.
- `05-bugs-and-credits` — persistent marks and creator-credit treatments.
- `06-lower-thirds` — quick identity, match, round, score, and credit layouts.
- `07-trackers` — optional ball-location aids.
- `08-audio` — original, sample-free impact and transition cues.
- `09-luts` — restrained outdoor-footage starting points.
- `10-guides` — temporary 9:16 safe-zone overlay; remove before export.

## Edit rules

- Use mascot and moment graphics on a cut, dead ball, or reaction. Clear them
  before the next live touch.
- Keep a persistent corner bug around 18–28% opacity.
- Use one emphasis device at a time. A mascot, stamp, tracker, and large caption
  competing on the same frame makes the footage harder to follow.
- Use 25% speed for clean slow motion from the JPO 119.88 fps originals on a
  29.97/30 fps timeline.
- Start LUTs at 20–40% strength after correcting exposure and white balance.

## Copy and factual guardrails

The reusable graphics avoid forced trend slang. Before using a factual stamp or
lower third, verify the play, team, player, round, score, result, rights, and
footage credit.

- Do not use `ace`, `stuff-block`, `pancake`, `match-point`, `final-point`,
  `comeback`, or `upset` unless the footage supports the claim.
- Do not frame the losing player as the joke.
- `flickday-credit` and the Flickday static credits are optional: use them only
  when Flickday Media supplied the footage.
- Prefer the actual play or result over generic hype language.

## Current limitation

The kit contains one Jalapeño mascot motion entrance. The static Jalapeño pose
library has additional serve, block, dig, celebration, champion, and exhausted
art; those are the next candidates for motion treatment after testing this pack
over real JPO footage.
