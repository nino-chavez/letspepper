# Let's Pepper - Agent Documentation

## Project Overview

Let's Pepper is an underground grass volleyball tournament series website. The brand emphasizes being player-first, media-backed, and competition-focused with cash payouts.

**Live Site:** https://letspepper.vercel.app (or custom domain if configured)
**Repository:** https://github.com/nino-chavez/letspepper

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS with custom design system
- **Animations:** Framer Motion
- **Deployment:** Vercel
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
│   ├── PepperBelle.tsx       # Pepper Belle section
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

- **Photo galleries:** SmugMug (photos.smugmug.com)
- **Gallery URL:** gallery.ninochavez.co/Sports/Volleyball/Grass/LPO
- **Media partner:** Flickday Media (@flickday.media)
- **Photography:** Nino Chavez Photography

Images are loaded from SmugMug CDN with URLs like:
```
https://photos.smugmug.com/Sports/Volleyball/Grass/[ALBUM]/[IMAGE-ID]/0/[HASH]/[SIZE]/[FILENAME]-[SIZE].jpg
```

## Key Pages

### Homepage (/)
- Hero with animated tagline
- Tournament series cards
- Pepper Belle section
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

# Deploy to Vercel
vercel --prod
```

## Content Updates

### Adding Tournament Results
Edit `src/app/standings/page.tsx` - add to `tournamentResults` array:
```typescript
{
  id: 'event-id-YYYY-MM-DD',
  event: 'Event Name',
  date: 'Month DD, YYYY',
  location: 'City, State',
  heat: 'bell' | 'jalapeno' | 'poblano',
  results: [
    { place: 1, players: ['Player 1', 'Player 2', 'Player 3'] },
    // ...
  ]
}
```

### Adding Gallery Images
Edit `src/components/GalleryPreview.tsx` - update `galleryImages` array with SmugMug URLs.

### Updating Event Details
Edit `src/app/flavors/[slug]/page.tsx` - update `tournaments` object with new dates, locations, entry fees.

## Important Notes

- Self-officiated tournament format (trust-based)
- No alcohol imagery in promotional photos
- All events use grass triples (3v3) format
- Illinois governing law for legal pages
- Refund policy: 7+ days (full), 3-7 days (50%), <24hrs (none)

## Related Links

- Instagram: @letspepper.open
- Flickday Media: flickdaymedia.com
- Photo Gallery: gallery.ninochavez.co
