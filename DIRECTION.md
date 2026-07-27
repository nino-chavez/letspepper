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
| `ethos-tiles` | condemned | Neutral `bg-zinc-800/50` icon tile above each of four h3s (`EthosSection.tsx:88-110`) | **Cannot cite it.** Carries no heat, encodes nothing, and is the exact four-across arrangement the thesis refuses | `icon-tile-stack` |

## Notes

`marquee` does not currently appear in any scan of this site. That is a detector
limitation, not a clean bill: the rule only reads CSS that is inline in a page, and this
app ships an external bundle. The `tape` row stands on its own merits.

The four `icon-tile-stack` findings resolve by **deleting** the tiles, not restyling them.
