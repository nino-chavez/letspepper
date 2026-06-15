# Let's Pepper Team Kit — Image-Gen Prompt Package

For Firefly / Gemini (app) / any image tool with reference-image support. Generate the hero art there (taste loop + inpainting + native ≥2K belong in the tool); bring winners back here for the deterministic tail (key → assemble → spec → mockups). Display lettering is always generated INSIDE the art — never typeset afterward.

## Intent the art must serve

Sponsored "Let's Pepper" teams wear this at other orgs' tournaments all summer. The kit is field marketing: the back is a billboard read across the net and in every photo; the quality of the art IS the pitch (out-craft club apparel or it advertises a janky series). Audience: competitive grass players. Never any prize-money reference (NCAA).

## Reference images (attach per slot)

| File | Carries |
|---|---|
| `scripts/apparel/ref/Brand Kit-14.png` | composition + brush-lettering style (hero + explosion + LET'S PEPPER as one unit) |
| `scripts/apparel/ref/Brand Kit-13.png` | "OFF THE MENU" brush title style + full-tee composition |
| `scripts/apparel/ref/Brand Kit-5-tee-front-red.png` | compact lockup style (lettering-dominant, swoosh, stem details on letters) |
| `scripts/story-assets/2026-bpo/mascot/cut-hero.png` | the green character (fierce anime bell pepper, this exact design) |

Firefly: composition ref → Structure Reference, character/palette → Style Reference. Gemini app: attach both images and name what each carries in the prompt ("first image: composition and lettering style; second image: the character").

## Slot 1 — Back hero (the billboard)

Refs: Brand Kit-14, cut-hero.

```
Apparel merch illustration for a volleyball team shirt, isolated on a solid pure white background. The fierce anime-style green bell pepper character from the reference — same face, same design — leaping mid-air to spike a green-and-cream volleyball. Behind it a painted comic-book explosion burst in layered greens, chartreuse and gold, hard cartoon edges, paint flecks. Integrated at the bottom, hand-brushed "LET'S PEPPER" lettering in chunky brush strokes — green-to-gold gradient fill, dark outline, slight arc, overlapping the burst. Bold painted shapes, dark outlines, rich saturated screen-print color, professional band-tee quality. No other text, no watermark.
```

Leave room below the lettering — the URL payload gets assembled under it.

## Slot 2 — Front chest lockup

Refs: Brand Kit-5 sheet, cut-hero.

```
Compact apparel lockup, isolated on a solid pure white background. Chunky hand-brushed "LET'S PEPPER" lettering stacked on a slight arc, green with gold highlights and dark outline, a small pepper stem detail on the apostrophe. The green bell pepper character from the reference dives across the lettering on a painted motion swoosh, volleyball in play. Bold painted shapes, screen-print merch quality. No other text.
```

---

# "OFF THE MENU" campaign slots

Theme: the touring team at other orgs' tournaments — "this isn't our tournament, these are our players." The restaurant meaning does the marketing: the secret item insiders ask for by name. The team still REGISTERS as "Let's Pepper" (bracket sheets are the earned-media channel); Off the Menu is the kit/campaign title, like a tour name. Style anchor for the campaign lettering: Brand Kit-13's "OFF THE MENU" brush title.

Lettering risk scales with word count — anything longer than 3–4 words is high-artifact; generate the short display line, typeset the rest in assembly.

## Slot 3 — Off the Menu hero (campaign title piece)

Refs: Brand Kit-13, cut-hero.

```
Apparel merch illustration for a volleyball team shirt, isolated on a solid pure white background. Hand-brushed "OFF THE MENU" lettering in the same chunky brush style as the reference — gold-to-orange gradient fill, dark outline, slight arc, grunge texture. The fierce anime-style green bell pepper character from the reference bursts through the lettering mid-spike, painted comic explosion in greens and gold behind it, volleyball in play. Bold painted shapes, dark outlines, rich screen-print color, professional band-tee quality. No other text, no watermark.
```

Assembly adds below: "THESE ARE OUR PLAYERS" eyebrow option + URL payload.

## Slot 4 — Tour tee (front lockup + typeset date block)

Refs: Brand Kit-13, cut-hero. Generated piece = front lockup only; the tour-date list is FUNCTIONAL type and gets typeset in assembly (cities + dates only — never host orgs' names: schedules shift and it's their trademark).

```
Compact apparel lockup, isolated on a solid pure white background. Hand-brushed "OFF THE MENU" lettering stacked on a slight arc, gold with dark outline, and beneath it smaller brush lettering "SUMMER TOUR 2026" in green. The green bell pepper character from the reference leans through the lettering holding a volleyball under one arm, confident grit, painted motion swoosh. Bold painted shapes, screen-print merch quality. No other text.
```

Assembly back block (typeset, band-tee register): date · city rows, last row "HOME COURT → LETSPEPPER.COM".

## Slot 5 — Secret-menu copy hits

Short lines, gen-able as brush lettering (one per roll). Pair with the character small, or run lettering-only.

```
Hand-brushed apparel lettering on a solid pure white background, chunky brush strokes with dark outline and slight arc, screen-print quality: "ASK FOR US BY NAME" in cream with green highlights. A small green bell pepper character from the reference peeks from behind the last word, smirking. No other text.
```

Swap the quoted line for: "SECRET ITEM" · "NOT ON THE BRACKET" · "WE CATER." · "86'D" (sleeve-size hit). Longer lines ("You can't order this here.") are typeset-only in assembly.

## Slot 6 — Menu artifact (diner ticket)

Refs: Brand Kit-13, cut-hero.

```
Apparel merch illustration, isolated on a solid pure white background. A vintage diner order ticket or chalkboard menu card, slightly torn, with hand-brushed "OFF THE MENU" as the header. The fierce green bell pepper character from the reference punches through the ticket from behind, mid-spike, paper shreds and painted green explosion flying. Bold painted shapes, dark outlines, screen-print quality. No prices, no other text.
```

NCAA guardrail: no price gags anywhere — no "market price," no "$", no "free."

## Slot 7 — Flickday series block (assembly, not gen)

If Flickday documents the away events: typeset film-credit block on the back — "OFF THE MENU · A FLICKDAY MEDIA PRODUCTION" with the aperture icon (`flickday-assets/outro/aperture-icon-transparent.png`), in the Brand Kit-13 "FLICKDAY MEDIA PRESENTS" register. The shirt becomes the series trailer; reels tag the campaign. Eyebrow option for any back: "THIS ISN'T OUR TOURNAMENT. THESE ARE OUR PLAYERS."

## Variation axes (one change per roll)

| Axis | Options |
|---|---|
| Theme | team identity (Slots 1–2) · Off the Menu (Slots 3–6) |
| Colorway | bell green/gold (team default) · ghost red/orange (heat alt, Brand Kit-14 exists) · jalapeño orange (mid-season) · gold/orange title + green character (Brand Kit-13 split) |
| Action | spike · dive/dig · jump serve · bursting through lettering/ticket |
| Energy | comic explosion · motion swoosh · radial speed-lines · paper shreds |
| Lettering | arc · stacked block · slammed italic |

## Acceptance checklist (reject the roll if any fail)

- Lettering reads exactly as written — no doubled letters, phantom apostrophes, or broken strokes (inpaint or re-roll; this killed 2 of 4 CLI candidates).
- One illustrated unit: lettering shares palette/outline language with the character and energy — nothing looks pasted.
- Silhouette and lettering legible at thumbnail size (= across-the-net test).
- Clean white background, hard edges everywhere (DTF keying; no soft outer glow).
- Export at the tool's max resolution, ≥2048px on the long side.
- No money, purse, or sponsor-payment implication anywhere.

## Bring-back pipeline

1. Drop the winning PNG in `scripts/apparel/assets/` (or hand it to a session).
2. Key + upscale: `magick IN.png -bordercolor white -border 1 -fuzz 7% -fill none -draw "color 0,0 floodfill" -shave 1x1 -trim +repage -resize <to ≥3300px wide> OUT.png`
3. `node scripts/apparel/render-apparel.mjs` — assembles payload type (URL/handle in the Brand Kit-13 clean-subline register), stamps 300 DPI, regenerates mockups and placements per `2026-summer/SPECS.md`.
