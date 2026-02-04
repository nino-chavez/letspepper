# Let's Pepper 🌶️🫑

**Underground. Unfiltered. Unapologetically Competitive.**

Let's Pepper is a player-first grass volleyball tournament series built for competition, content, and community. Grass roots. High level. Real payout.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?logo=tailwindcss)
![Vercel](https://img.shields.io/badge/Deployed-Vercel-black?logo=vercel)

## About

Let's Pepper is a grass triples tournament series that strips volleyball down to its essentials: fewer players, faster decisions, more touches, more opportunities to make athletic plays.

**No coach. No bench. Just you, your crew, and the wind in your toss.**

## The Series

| Tournament | Heat | Season |
|------------|------|--------|
| 🫑 **Bell Pepper Open** | Mild | Season Opener |
| 🌶️ **Jalapeño Open** | Hot | Mid-Season Peak |
| 🫑 **Poblano Open** | Medium | Season Finale |

## Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Animations:** [Framer Motion](https://www.framer.com/motion/)
- **Fonts:** Bebas Neue, Inter, Space Mono
- **Deployment:** [Vercel](https://vercel.com/)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/nino-chavez/letspepper.git
cd letspepper

# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                 # Homepage
│   ├── about/page.tsx           # About page
│   ├── faq/page.tsx             # FAQ
│   ├── standings/page.tsx       # Tournament results
│   ├── waiver/page.tsx          # Liability waiver
│   ├── privacy/page.tsx         # Privacy policy
│   ├── terms/page.tsx           # Terms of service
│   └── flavors/[slug]/page.tsx  # Tournament detail pages
├── components/                   # React components
├── lib/                          # Utilities and motion presets
└── public/images/                # Static assets
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Homepage with hero, tournaments, gallery |
| `/about` | Brand story and "Why Grass Triples" |
| `/faq` | Frequently asked questions |
| `/standings` | Tournament results and standings |
| `/flavors/bell-pepper-open` | Bell Pepper Open details |
| `/flavors/jalapeno-open` | Jalapeño Open details |
| `/flavors/poblano-open` | Poblano Open details |
| `/waiver` | Liability waiver & media release |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |

## Design System

### Heat Levels
The brand uses pepper-themed heat levels for visual hierarchy:

- **Bell (Mild):** Green `#4ADE80` — Season Opener
- **Jalapeño (Hot):** Orange `#F97316` — Mid-Season Peak
- **Poblano (Medium):** Yellow `#FACC15` — Season Finale

### Typography
- **Display:** Bebas Neue (headings)
- **Body:** Inter (paragraphs)
- **Accent:** Space Mono (labels, badges)

## Media

- **Photography:** [Flickday Media](https://flickdaymedia.com)
- **Gallery:** [gallery.ninochavez.co](https://gallery.ninochavez.co/Sports/Volleyball/Grass/LPO)

## Deployment

The site is deployed on Vercel. Push to `main` to trigger automatic deployment.

```bash
# Manual production deployment
vercel --prod
```

## License

All rights reserved. © Let's Pepper

## Connect

- Instagram: [@letspepper.open](https://instagram.com/letspepper.open)
- Media: [@flickday.media](https://instagram.com/flickday.media)
