# Let's Pepper CapCut Kit

The files in `creative/exports/media-kit-v1/capcut/` are deliberately modular.
Use them as short stamps, credits, trackers, lower thirds, and cover frames—not as
a permanent layer over the rally.

## Start with the Clip Desk

The local Clip Desk turns a reviewed rally into a verified CapCut handoff. It previews
the video, keeps missing facts visible, recommends the correct asset paths, writes an
approved caption draft, and exports both a searchable clip map and JSON edit plans.
It does not upload the video or publish a post.

From the project root:

```sh
python3 -m http.server 4173
```

Then open:

`http://localhost:4173/creative/editor-kits/capcut/clip-mapper/`

For batch planning without the browser, first save a filled copy of
`clip-map-template.csv`, then run:

```sh
node scripts/media-kit/build-edit-plan.mjs \
  --input creative/editor-kits/capcut/my-event-clips.csv \
  --output creative/editor-kits/capcut/edit-plans.json
```

The CSV may be saved while incomplete. A clip is only included in the queue draft when
its match context, score, footage credit, permission, and copy review are recorded.

## Review the Jalapeño Open library

The JPO Footage Desk adds capture metadata, three-frame filmstrips, editable A/B/pass
ratings, local source playback, and a shortlist export before clips reach the Clip Desk.
It is available at:

`http://localhost:4173/creative/editor-kits/capcut/jpo-review/`

Its source MP4s remain in the external JPO library; the project stores only review
derivatives and decisions. See `jpo-review/README.md` for the inventory and rebuild
commands.

### Reader contract for this tool

- **Reader:** the person cutting a real rally for Let's Pepper.
- **Job:** identify the clip once, then receive a clear and correctly credited edit plan.
- **Assumed knowledge:** basic volleyball terms and ordinary CapCut editing.
- **Plainness:** practitioner language; labels name the decision the editor must make.
- **Locked facts:** event/date, teams, player identities, handles, round, score, rights,
  credits, and actual asset paths. The tool may validate these facts but never invent them.
- **Copy sources:** `creative/copy/approved-copy.json`, this guide, the clip map, and the
  generated media-kit manifest.

## Recommended track stack

From top to bottom in CapCut:

1. Moment stamp or mascot sting (0.35–0.9 seconds)
2. Player/team lower third (1.5–2.5 seconds)
3. Ball tracker (only while the ball is genuinely hard to find)
4. Persistent corner bug (18–28% opacity after its intro)
5. Footage credit (first or last 2 seconds)
6. Color adjustment / supplied LUT at 20–40% strength
7. Source footage

Do not place a large mascot over a live touch. Enter on the cut, during dead ball,
or immediately after the point; exit before the next serve.

## 9:16 placement system

- Keep primary headlines between `y=260–560` when the footage has open sky.
- Keep the ball corridor from roughly `x=180–900, y=160–1180` clear during play.
- Keep player bodies and the net clear from `y=760–1580`.
- Keep essential text above `y=1580`; Reels UI and captions occupy the bottom.
- Keep essential text left of `x=900`; platform controls occupy the right rail.
- Use `guides/reel-safe-zones.png` as a temporary guide layer and remove it before export.

## Overlay choices

- `bugs/` — persistent marks. Pick the light or dark version after checking footage.
- `moments/` — sub-second editorial stamps after a play.
- `lower-thirds/` — editable layout references and quick static IDs.
- `trackers/` — restrained ball-finding aids; do not imply computer vision.
- `covers/` — first-frame and Reel-cover masters with center-safe crops.
- `motion/alpha/` — ProRes 4444 overlays with transparency.
- `motion/screen/` — black-background MP4 fallbacks; use Screen blend mode.

## Color

The LUTs are starting points, not one-click corrections. Correct exposure and white
balance first, apply a LUT at 20–40%, then protect skin tones and white volleyball
panels. The five LUTs address the recurring footage conditions in the current corpus:
overcast grass, harsh noon, backlit players, golden hour, and flat phone video.

## Copy and credits

Do not improvise trend slang into the baked graphics. Approved headlines and CTAs
live in `creative/copy/approved-copy.json`. Credit actual footage as
`FOOTAGE · FLICKDAY MEDIA` only when Flickday supplied it; otherwise use the real
creator's handle. Do not crop or stylize a partner logo without permission.

## Export check

- Watch once with audio off: every graphic must be understandable.
- Watch once at arm's length: every headline must be readable.
- Confirm no tracker covers a face or the contact point.
- Confirm the losing player is not framed as the joke.
- Confirm event, date, URL, score, and credit against the verified event record.
- Remove the safe-zone guide and any placeholder lower-third data.
