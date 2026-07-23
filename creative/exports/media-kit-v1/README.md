# Let's Pepper Media Kit v1

This is the production export of the creative system in `creative/`. Start with the
contact sheets, then import only the assets needed for the edit or campaign.

For a Reel, start in the local Clip Desk at
`creative/editor-kits/capcut/clip-mapper/`. It turns verified clip facts into the
specific overlay, audio, credit, cover, and caption paths listed below.

## Delivered systems

- `capcut/` — 9:16 guide, eight bugs, fourteen moment stamps, seven lower thirds,
  five trackers, six Reel covers, ten alpha motion stings plus Screen-mode fallbacks,
  and five outdoor-footage LUTs.
- `event/poblano/` — the complete twelve-stage Story lifecycle and five 4:5 feed cards.
- `share/` — seven fan-share formats and six quiz-result cards.
- `web/og/` — five Open Graph/link-preview masters.
- `social/highlights/` — ten Instagram Highlight covers.
- `audio/` — ten original, sample-free 48kHz stereo cues.
- `contact-sheets/` — fast visual review of every major family.
- `reports/` — copy lint, alpha-edge previews, and production preflight.

The editable rules and CapCut track stack live in
`creative/editor-kits/capcut/README.md`. Approved copy lives in
`creative/copy/approved-copy.json`; voice and sensitivity policy live in
`creative/copy/VOICE.md`.

Run `pnpm creative:build` to reproduce deterministic deliverables. Mascot images are
AI-generated source art and are processed separately with
`scripts/media-kit/process-mascot-anchors.mjs`.
