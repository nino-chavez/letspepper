# JPO Footage Review

This is the lightweight review layer for the July 18, 2026 Jalapeño Open video
library. The 19.58 GiB source directory remains the read-only master; the project
stores metadata, small review frames, contact sheets, editorial decisions, and Clip
Desk handoffs.

## What is here

- `inventory.json` and `inventory.csv` — 138 source clips with Sony sidecar metadata.
- `thumbs/` — three representative frames per clip.
- `contact-sheets/` — midpoint sheets and three-frame filmstrip sheets covering the
  whole library in capture order.
- `storyboards/` — denser review sheets for the initial high-potential candidates.
- `review-seed.json` — editable initial A/B/pass recommendations. These are visual
  judgments, not match facts.
- `jpo-clip-map.csv` — every source clip prefilled only with known event metadata.
- `index.html` — the local JPO Footage Desk.

## Open the Footage Desk

From the project root:

```sh
python3 -m http.server 4173
```

Then open:

`http://localhost:4173/creative/editor-kits/capcut/jpo-review/`

The thumbnails work immediately. Choose the JPO source folder once in the browser to
preview original MP4s; the browser only receives local file handles for that session.
The app never uploads or rewrites the originals.

Review decisions persist in browser storage. Export review JSON periodically if the
decisions matter, because clearing browser data removes the local working state.

## Rebuild the inventory

```sh
node scripts/media-kit/build-jpo-review.mjs \
  --source /Users/nino/Workspace/create/import/video/jpo
```

Use `--inventory-only` when thumbnails do not need to be regenerated. Existing review
frames are reused unless `--force-thumbnails` is supplied.

To build dense storyboards for a new candidate set:

```sh
node scripts/media-kit/build-jpo-storyboards.mjs \
  --clips C2260,C2285,C2353
```

## Technical read

- 138/138 MP4s have matching Sony XML sidecars.
- All footage is native portrait on display: the files store landscape pixels with a
  90-degree rotation flag.
- 136 clips display at 1080×1920; C2398 and C2399 display at 2160×3840.
- Every clip is 119.88 fps, Rec.709, H.264, with stereo 48 kHz LPCM audio.
- The camera is a Sony ILCE-7M5. The library uses the FE 50mm F1.4 GM and FE 85mm
  F1.4 GM II.
- Total recorded duration is 26:33 across seven capture blocks from 9:22 AM to 3:45 PM.

For a 29.97/30 fps CapCut timeline, 25% speed converts the 119.88 fps source into clean
slow motion without invented frames. Use 50% for lighter emphasis. Reserve optical flow
for a specific shot that still needs interpolation; it should not be the default.

## Recommended edit structure

Use the source footage as the event proof and graphics as punctuation:

1. Open directly on a readable action or reaction for 0.4–0.8 seconds.
2. Establish one point at real speed before slowing the decisive touch.
3. Use 25% speed for roughly 0.6–1.4 seconds around the contact, dive, or block.
4. Return to real time for the reaction whenever the clip contains one.
5. Put the mascot sting, moment stamp, or team ID on a cut, dead ball, or reaction—not
   over the live contact.
6. Keep the co-brand bug restrained and confirm the actual footage credit.
7. Close with one action: gallery, results, registration, or follow. Do not stack them.

The initial shortlist deliberately mixes full rallies, serves, net action, defensive
saves, a player cutaway, and reaction beats. That gives the edit rhythm; selecting only
spikes would make the library feel repetitive despite the amount of coverage.

## Copy boundary

The footage is strong enough that public copy does not need trend slang to manufacture
energy. Prefer verified names, the actual play, score or result, and a short factual
prompt. Do not bake phrases such as “cooked,” “no cap,” “main character,” “aura,” or
“POV” into reusable overlays. If a platform-native phrase genuinely fits a specific
post, keep it in the caption and review it in context rather than turning it into brand
voice.

