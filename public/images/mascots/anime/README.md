# Let's Pepper Anime Mascot System

Production-ready transparent mascot illustrations for the website, social posts, Reel overlays, print graphics, and campaign art.

The library was generated with the built-in GPT Image workflow, using one accepted character anchor per pepper and a shared set of volleyball mechanics references. Green characters were generated against magenta chroma; the red Ghost Pepper uses green chroma. Only final alpha PNGs and review contact sheets live in this public directory.

## Public paths

The site can address every pose with:

```text
/images/mascots/anime/{character}/{pose}.png
```

Characters:

- `jalapeno`
- `bell-pepper`
- `poblano`
- `ghost-pepper`

Anchor-only expansion characters:

- `habanero`
- `reaper`
- `pepper-x`
- `chipotle`
- `pepper-belle`
- `pepperoncini`
- `banana-pepper`
- `shishito`

Anchor-only characters use `/images/mascots/anime/{character}/anchor.png`. They
are approved identity anchors, not implied seven-pose libraries.

Poses:

- `menace-walk`
- `block`
- `jump-serve`
- `diving-dig`
- `celebration`
- `champion`
- `exhausted`

See `manifest.json` for programmatic names, roles, directories, and contact sheets.

## Character language

| Character | Silhouette | Athletic role | Emotional register |
| --- | --- | --- | --- |
| Jalapeño | Long tapered green pod, curled stem | Balanced all-rounder | Focused confidence |
| Bell Pepper | Broad four-lobed body, heavyweight musculature | Opposite / blocker | Dominant power |
| Poblano | Deep-green broad-to-tapered body, lean female athlete | Libero / defender | Fearless precision |
| Ghost Pepper | Long wrinkled ember-red pod, wiry build | Jump-server / speed ace | Unnerving calm |

These are characters in one sports universe, not recolors. Keep the silhouettes, proportions, clothing, volleyball palette, and role-specific attitude distinct.

## Shared generation prompt

> Use case: stylized-concept. Create one transparent mascot asset for a consistent website and CapCut social-Reel pose library. Image 1 is the absolute character identity, palette, clothing, silhouette, and rendering anchor. Any additional image is only a volleyball mechanics or emotional-pose reference; never copy its species identity. Render premium gritty sports-anime art with hard controlled ink contours, sharp cel shading, selective glossy vegetable highlights, crosshatched shadows, restrained film grain, deep blacks, and species-appropriate rim light. Use mature underground sports editorial energy, not cute mascot styling. Show exactly one anatomically coherent athlete with two arms, two legs, believable five-fingered hands, the full body and all requested props visible, generous padding, no crop. Use a perfectly flat removable chroma background with no floor, cast shadow, gradient, texture, scenery, aura, or detached effects. No text, numbers, logos, watermark, badge, extra character, photorealism, 3D-toy rendering, retro/rubber-hose language, or chibi proportions.

Character identity additions:

- **Bell Pepper:** broad four-lobed green pepper head/body, thick bent stem, huge compact male-presenting musculature, bare vegetable torso, black shorts, white socks, black shoes; never add a jersey or human chest details.
- **Poblano:** deep nearly-black green broad-to-tapered poblano head/body, hooked stem, subtle folds, lean powerful female-presenting anatomy, charcoal racerback jersey, black shorts, white socks, black shoes; never make her cylindrical or sexualized.
- **Ghost Pepper:** ember-red/orange elongated irregular wrinkled pod with a pointed twisted lower tip, small dark stem, pale eyes, lean ropey musculature, charcoal jersey, black shorts, off-white socks, black shoes; intense but never horror, gore, or translucent.

The exact original Jalapeño pose prompts and QA notes are retained in `jalapeno/README.md`. Bell, Poblano, and Ghost reuse those same mechanics while applying the identity additions above.

## Recommended usage

### Website

- Event and tournament hero sections: `menace-walk` or a character-specific action pose
- Winner and standings modules: `champion`
- Matchup cards: two opposing `menace-walk` or action silhouettes
- Empty states and loading moments: `block`, `jump-serve`, or `diving-dig`
- Post-event recaps: `celebration` and `exhausted`
- About/brand pages: `family-overview.png`

For layout, reserve clear negative space for copy and keep the mascot outside primary text columns. Use the source PNGs for social/print. The site must reference the committed WebP derivatives in `web/` instead (production `/_next/image` is a passthrough on Cloudflare Pages) — generate them with `pnpm derive:mascots` (`scripts/site/derive-mascot-images.mjs`), adding a job there when a new pose gets a site reference.

### Social and Reel overlays

- 6–12 frame entrance or exit stamp: `menace-walk`
- Point-winning sting: `celebration`
- Block, ace, or dig callout: the matching mechanics pose
- Champion/finalist cards: `champion`
- Loss, grind, or bracket-survival reaction: `exhausted`
- Story polls and matchup graphics: opposing characters cropped at the waist

At Reel size, start near 18–28% of canvas height for a corner stamp and 40–65% for a deliberate hero transition. Test every placement over both bright and dark footage.

## Expansion status

Eight new identity anchors now cover missing editorial jobs: high-energy launches
(Habanero), championships (Reaper), predictions and quiz wildcards (Pepper X),
captaincy and history (Chipotle), the women's series and assists (Pepper Belle),
rules and commentary (Pepperoncini), setter/explainer content (Banana Pepper), and
utility/upset content (Shishito).

Do not automatically generate seven poses for each. The next production gate is usage:
after a character appears successfully in at least three real posts or web modules,
add one signature action and one reaction pose. This prevents a large but repetitive
library and keeps Reaper rare enough to retain championship value.
