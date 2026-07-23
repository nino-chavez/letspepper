# Let's Pepper Creative System

This directory contains the production sources and approved language for the
Let's Pepper media system. Website-ready derivatives remain in `public/`; large
editor-facing exports are rendered into `creative/exports/`.

## Structure

- `copy/` — voice rules, approved copy, and cringe/sensitivity review notes.
- `config/` — structured inputs for deterministic renderers.
- `editor-kits/` — CapCut setup, placement rules, and delivery documentation.
- `exports/` — rendered PNG, video, audio, LUT, and contact-sheet deliverables.
- `mascots/` — generation prompts, character briefs, and review notes for new identities.

## Production rule

An asset is not production-ready until it passes all four gates:

1. **Readable:** works at phone size and over both bright and dark footage.
2. **Useful:** has a defined editing or publishing job; it is not decoration for its own sake.
3. **Respectful:** celebrates play without humiliating opponents, sexualizing characters, or joking about injury or identity.
4. **Current:** sounds like a confident sports brand, not a brand impersonating a comment section.

Run the copy and asset preflight before publishing:

```bash
node scripts/media-kit/lint-copy.mjs
node scripts/media-kit/preflight.mjs
```

Render the current kit:

```bash
node scripts/media-kit/render-media-kit.mjs
node scripts/media-kit/build-motion.mjs
node scripts/media-kit/build-audio.mjs
node scripts/media-kit/build-contact-sheets.mjs
```

