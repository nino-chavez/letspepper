# Let's Pepper - Agent Documentation

## Project Overview

Let's Pepper is an underground grass volleyball tournament series website. The brand emphasizes being player-first, media-backed, and competition-focused with cash payouts.

**Live Site:** https://letspepper.com (Cloudflare Pages project: `letspepper`, also reachable at letspepper.pages.dev)
**Repository:** https://github.com/nino-chavez/letspepper

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS with custom design system
- **Animations:** Framer Motion
- **Deployment:** Cloudflare Pages' GitHub connection: a preview build for every branch, production on merge to `main`. See [Deploys](#deploys).
- **Fonts:** Bebas Neue (display), Inter (body), Space Mono (accent)

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Homepage
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles & CSS variables
│   ├── about/page.tsx        # About page
│   ├── faq/page.tsx          # FAQ with accordion
│   ├── standings/page.tsx    # Tournament results
│   ├── waiver/page.tsx       # Liability waiver
│   ├── privacy/page.tsx      # Privacy policy
│   ├── terms/page.tsx        # Terms of service
│   └── flavors/
│       └── [slug]/page.tsx   # Dynamic tournament detail pages
├── components/
│   ├── index.ts              # Component exports
│   ├── Header.tsx            # Navigation header
│   ├── Footer.tsx            # Site footer with links
│   ├── HeroSection.tsx       # Homepage hero
│   ├── TournamentSeries.tsx  # Tournament cards
│   ├── EthosSection.tsx      # Values/ethos section
│   ├── GalleryPreview.tsx    # Photo gallery preview
│   └── icons.tsx             # Custom SVG icons
├── lib/
│   ├── utils.ts              # Utility functions (cn)
│   └── motion.ts             # Framer Motion presets
└── public/
    └── images/
        └── mascots/          # Pepper mascot images
```

## Design System

### Heat Levels (Brand Colors)
The brand uses pepper-themed heat levels:
- **Bell (Mild):** `--heat-bell` - Green (#4ADE80) - Season Opener
- **Poblano (Medium):** `--heat-poblano` - Yellow (#FACC15) - Season Finale
- **Jalapeño (Hot):** `--heat-jalapeno` - Orange (#F97316) - Mid-Season Peak

### Typography Classes
- `.text-display` - Large display headings (Bebas Neue)
- `.text-hero` - Hero section text
- `.text-section-heading` - Section labels (Space Mono, uppercase)
- `.font-display` - Bebas Neue
- `.font-accent` - Space Mono

### Component Classes
- `.btn-primary` - Orange CTA button
- `.btn-secondary` - Outlined button
- `.section-padding` - Consistent section spacing
- `.section-container` - Max-width container
- `.heat-card` - Tournament card styling
- `.heat-indicator` - Heat level badge

## Tournament Series (Seasonal Arc)

1. **Bell Pepper Open** (Mild) - Season Opener
   - "First tournament of the season. Shake off the rust, get warmed up."
   - Features: Season Kickoff, Full Media, Cash Prizes

2. **Jalapeño Open** (Hot) - Mid-Season Peak
   - "Now it's time to bring the heat. Turn up the intensity."
   - Features: Peak Competition, High Intensity, Fast Pace

3. **Poblano Open** (Medium) - Season Finale
   - "Cooling things down. Last tournament of the season."
   - Features: Season Closer, Final Standings, Year-End Celebration

## Media & Images

- **Photos:** Cloudflare Images (imagedelivery.net), shared with the photography site. The shared Supabase `photo_metadata` table maps each photo to its `cf_image_id`.
- **Media partner:** Flickday Media (@flickday.media)
- **Photography:** Nino Chavez Photography

Do not reference `photos.smugmug.com` URLs. SmugMug stopped serving these photos (every size and the API return 404, checked 2026-10-09).

Do not rely on `/_next/image` to resize. On this host it is a passthrough: `@cloudflare/next-on-pages` fetches the source unresized and relays the upstream status. Instead:
- Cloudflare Images photo: `<Image loader={cfImageLoader} src={cfImageId} … />` (`src/lib/cloudflare-images.ts`). The loader picks the smallest named variant (`grid` 400, `medium` 800, `large` 1600) that covers the requested width. Flexible variants (`/w=…`) are off on this account.
- A photo not in Cloudflare Images: commit WebP derivatives under `public/images/` with a loader, as `src/lib/hero-photo.ts` does.

## Key Pages

### Homepage (/)
- Hero with animated tagline
- Tournament series cards
- Ethos/values section
- Gallery preview

### Flavor Pages (/flavors/[slug])
Dynamic pages for each tournament:
- `/flavors/bell-pepper-open`
- `/flavors/jalapeno-open`
- `/flavors/poblano-open`

### Standings (/standings)
Tournament results with:
- Season stats summary
- Results by tournament date
- Player placements with medals
- Season highlights (top performers)

### Legal Pages
- `/waiver` - Liability release, media consent, assumption of risk
- `/privacy` - Privacy policy
- `/terms` - Terms of service, refund policy, code of conduct

## Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

## Deploys

[`DEPLOY.md`](DEPLOY.md) owns the deploy facts. In short: Cloudflare Pages' GitHub connection deploys `main` and builds a preview for every branch. A PR needs three passing checks to merge: `checks`, `Cloudflare Pages` and GitGuardian. When `checks` fails with `manual-review-stale`, follow the reader-review steps in `DEPLOY.md`. Never record a review without walking the branch preview.

## Content Updates

Before changing website or social copy, read [`reader-contract.json`](reader-contract.json). Preserve dates, prices, eligibility, registration state, legal language, and the pepper-brand voice exactly; simplify the path to the player's next action. Review the built page or queued post as the reader encounters it, not only the component or generator source.

### Adding Tournament Results
Rally HQ is the source of truth for results. The site reads them live, and `tournamentResults` in `src/lib/standings-data.ts` is the offline fallback snapshot. After an event:
1. Run `pnpm check:rhq-drift`. It reports any event or roster the snapshot is missing.
2. Regenerate the missing entry from `GET /api/standings-results` (production) rather than typing it. Fix a wrong roster in Rally HQ, then re-snapshot.
3. Run `pnpm check:rhq-drift` again until it reports no drift.

Points come from `getPoints` in the same file, by finishing tier: 1st 100, 2nd 75, 3rd–4th 50, 5th–8th 25, 9th–16th 10, otherwise 5. `pnpm test:standings` covers it.

The power rankings (`src/lib/rankings-data.ts`) are hand-written. Refresh them after each event, and take every result a blurb cites from the event's Rally HQ bracket (`/api/rhq/bracket?slug=…`).

### Adding Gallery Images
Edit `src/components/GalleryPreview.tsx` - update the `galleryImages` array with `cfImageId` values from `photo_metadata.cf_image_id`.

### Updating Event Details
Edit the `tournaments` record in `src/lib/tournaments.ts`: dates, locations, entry fees, perks, and `cancellation` when an event is called off. The event pages, home cards, `/about` and share images all read it.

## Important Notes

- Self-officiated tournament format (trust-based)
- No alcohol imagery in promotional photos
- All events use grass triples (3v3) format
- Illinois governing law for legal pages
- Refund policy: 7+ days (full), 3-7 days (50%), <24hrs (none)

## Related Links

- Instagram: @letspepper.open
- Flickday Media: flickdaymedia.com
- Photo Gallery: https://letspepper.com/gallery (gallery.ninochavez.co returned 404 on 2026-10-09)

## Browser automation: use browse-tool, not MCP

This project previously used Playwright/Chrome DevTools MCP for interactive browser work. Prefer the Bash-based `browse-tool` CLI instead — it is on PATH when Codex is launched from the `cl` alias or a shell that sources `~/.zshrc`.

Full command list and usage: `/Users/nino/Workspace/dev/tools/browse-tool/README.md` (use `@README.md` after `/add-dir`) — read it fresh rather than recalling commands from memory; it changes as commands are added.

`npx playwright test` is still the right tool for running the e2e test suite — browse-tool is for ad-hoc interactive inspection and debugging, not replacing the test runner.
