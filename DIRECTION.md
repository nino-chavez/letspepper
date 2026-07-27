# Direction — letspepper.com, home

Art direction for this surface. Sits above the brand kit (which says what the colors
*are*) and above the defect scanner (which says what is broken). This says what the page
is *arguing*, and which devices are allowed to trip a slop rule because they carry that
argument.

A finding with no `authorized` row here is a defect. Absence of a record is not
permission.

## Thesis

Heat is the product's own taxonomy: Bell, Poblano and Jalapeño are the event names *and*
the difficulty ladder. This page argues that the ladder is the interface. Color is
reserved for heat meaning — nothing is accented for decoration. It refuses the
grassroots-sports default: photo hero with an overlay headline, neutral "why us" cards,
a schedule table.

## Ledger

Every device must cite the thesis. A device that cannot is not authorized, whatever else
can be said for it.

| id | verdict | device | cites the thesis by | rules |
|---|---|---|---|---|
| `tape` | authorized | Full-bleed banner rotated −3°, 110% width at −5% margins, scrolling; background is the next event's heat variant, switching to coral when the API reports live (`Marquee.tsx:99-114`, `:281-299`) | It is where the ladder does work over time — the color *is* the event, so the banner is the taxonomy applied to what changes weekly | `marquee` |
| `heat-cards` | authorized | Each tournament card carries a glow in its own event's heat color — resting `.glow-*` plus a stronger `.heat-card-*:hover`, mapped per variant in `TournamentSeries.tsx:68-82` | The ladder applied to the card itself, so pointing at a rung says which rung without a label | `dark-glow` |
| `heat-type` | authorized | h1 lines 3–4 set in `--heat-poblano` and `--heat-jalapeno` (`HeroSection.tsx:62-69`) | Shows the ladder in the first viewport instead of explaining it | — |
| `brackets` | undecided | Corner rules on the hero photo in `border-heat-jalapeno/50` (`HeroSection.tsx:154-161`) | Carries a heat color, but the color encodes nothing here — the photo is not a Jalapeño-event artifact. Either bind the bracket color to the pictured event, or drop it | `side-tab`, `border-accent-on-rounded` |
| `ethos-tiles` | removed | Neutral `bg-zinc-800/50` icon tile above each of four h3s (was `EthosSection.tsx:88-110`) | **Cannot cite it.** Carried no heat, encoded nothing, and was the exact four-across arrangement the thesis refuses | `icon-tile-stack` |

## Notes

`marquee` does not currently appear in any scan of this site. That is a detector
limitation, not a clean bill: the rule only reads CSS that is inline in a page, and this
app ships an external bundle. The `tape` row stands on its own merits.

The four `icon-tile-stack` findings resolved by **deleting** the tiles, not restyling them
— done. The four value props keep their heading and description; the section is now
typographic rather than a card grid. The detector's own suggested remedy is "let the icon
sit in flow without its own container", and dropping only the container would have cleared
the rule, but an icon that encodes nothing is still ornament this thesis reserves for heat.

Measured against the live site on the same build, only the intended rules moved:
`icon-tile-stack` 4 → 0, and the undeployed hero fix takes `text-occlusion` 5 → 0 and
`clipped-overflow-container` 1 → 0. `dark-glow` holds at 3 (authorized `heat-cards`) and
`low-contrast` at 24 as controls. Site total 53 → 43.

Deleting the tiles orphaned four icon components, and checking them surfaced seven more
that were **already dead** — volleyball, three heat-level indicators, arrow, external-link
and instagram, referenced nowhere in the repo. Worth noticing rather than just deleting:
`HeatMildIcon` / `HeatMediumIcon` / `HeatHotIcon` are the ladder drawn as icons, built and
never wired to anything, while the thesis says the ladder is the interface. They are one
`git show` away if a surface ever wants them.

**The `tape` was authorized here while sitting below the fold — nobody checked.** Fixed
2026-07-27. On 2026-07-26 the tape was moved out of the hero (`34e759b`) because at
`absolute top-[35%]` it painted across "PLAYER-OWNED" and hid its own event details. That
was right about the overlap and wrong about where it landed: the hero was `min-h-screen`
and the tape a following sibling, so **the tape started at 100vh by construction** and
could never be above the fold at any viewport. Measured live before the fix: hero 1054px
against a 976px viewport, tape starting 94px past it. A device whose whole job is
announcing the next event — date, location, prize, format — was invisible to anyone who
did not scroll.

The cause was not the marquee. **`text-hero` was defined twice.** `tailwind.config.ts`
declares `fontSize.hero`, which Tailwind emits as a `.text-hero` *utility*; `globals.css`
declares a `.text-hero` *component* class with a three-step responsive ramp. Utilities sort
after components, so the config's `clamp(3.5rem, 15vw, 10rem)` won at every width and
**all three responsive rules were dead code** — they had never applied. What shipped was a
hybrid: font-size from the config, line-height from the component class, described by
neither. The h1 rendered 760px of a 1054px hero, 72% of it, and broke "PLAYER-OWNED."
after the hyphen.

Resolved by giving size one owner: the dead font-size rules are gone from `globals.css`
(which keeps family, case, tracking and leading), and the config ceiling drops to
`clamp(2.5rem, 6vw, 7rem)`. The h1 is now 332px, four lines, and "PLAYER-OWNED." sets
whole.

**The hero reserves the tape's space in two terms, and the second one is the interesting
one.** `min-h-[calc(100svh-5.5rem-2.9vw)]`. `5.5rem` is the tape's box. `2.9vw` is the
overhang from rotating that box −3° across 110% width — the corners swing below the box by
`(110vw × sin 3°) / 2`, which is 39px at 1366 and 55px at 1920. It scales with viewport
*width*, so a `rem`-only reservation clips the lower corner on wide screens no matter how
large the value. The first attempt at this fix used `5.5rem` alone and clipped
"POBLANO OPEN" at the bottom-left; the bounding box said it fit, because the wrapper's box
does not contain its own rotated child. Verified at seven viewports from 390×844 to
1920×1080: the tape's deepest rendered pixel clears the fold by 16–20px everywhere.

**One consequence, recorded not decided.** The scroll-cue pill is `absolute bottom-8
left-1/2`, and in a two-column hero a centred cue sits wherever the taller column ends. At
1366 it now grazes the photo's left border by ~2px. It is not adjudicated in this ledger,
and the tape arguably makes an abstract scroll affordance redundant now that it carries
real information at the fold — but moving or deleting an unadjudicated device because a
scan walked past it is the failure this layer exists to prevent. It belongs to whoever
adjudicates the hero's secondary furniture.
