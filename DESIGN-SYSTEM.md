# Let's Pepper Design System

**Version:** 1.0.0
**Last Updated:** 2025-02-03
**Aesthetic:** Underground Athletic

---

## Brand Identity

**Tagline:** "Underground. Unfiltered. Unapologetically competitive."
**Voice:** Raw, authentic, player-first
**Personality:** The tournament that doesn't need a federation

---

## Color Palette

### Core Brand

| Token | Hex | CSS Variable | Usage |
|-------|-----|--------------|-------|
| Pepper Black | `#0a0a0a` | `--pepper-black` | Primary background |
| Pepper Charcoal | `#1a1a1a` | `--pepper-charcoal` | Card backgrounds |
| Pepper Dark | `#141414` | `--pepper-dark` | Secondary surfaces |

### Heat Level System

The heat level system creates visual hierarchy for tournament tiers:

| Level | Name | Color | Hex | Usage |
|-------|------|-------|-----|-------|
| Mild | Bell Pepper | Green | `#4ade80` | Entry-level, approachable |
| Medium | Poblano | Yellow | `#facc15` | Balanced competition |
| Hot | Jalapeño | Orange | `#f97316` | High intensity, flagship |
| Extreme | Habanero | Red | `#ef4444` | Reserved for future use |

### Pepper Belle (Women's Series)

| Token | Hex | Usage |
|-------|-----|-------|
| Belle Primary | `#f472b6` | Women's tournament accent |
| Belle Glow | `#ec4899` | Hover/active states |

### Neutral Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Text Primary | `#fafafa` | Main body text |
| Text Secondary | `#a1a1aa` | Supporting text |
| Text Muted | `#71717a` | Subtle labels |
| Border Subtle | `#27272a` | Light borders |
| Border Strong | `#3f3f46` | Emphasized borders |

---

## Typography

### Font Stack

```css
--font-display: 'Bebas Neue', 'Impact', sans-serif;  /* Headlines */
--font-body: 'Inter', system-ui, sans-serif;          /* Body text */
--font-accent: 'Space Mono', 'JetBrains Mono', monospace;  /* Labels */
```

### Type Scale

| Element | Size | Line Height | Weight | Case |
|---------|------|-------------|--------|------|
| Hero | `clamp(3.5rem, 15vw, 10rem)` | 0.85 | 400 | UPPERCASE |
| Display | `clamp(2rem, 8vw, 5rem)` | 0.95 | 400 | UPPERCASE |
| Heading | `clamp(1.5rem, 4vw, 2.5rem)` | 1.1 | 400 | UPPERCASE |
| Body | `1rem` | 1.5 | 400 | Sentence |
| Small | `0.875rem` | 1.4 | 400 | Sentence |
| Micro | `0.75rem` | 1.4 | 500 | UPPERCASE |

### Typography Rules

1. **Display fonts (Bebas Neue):** Always UPPERCASE, tight line-height
2. **Body text (Inter):** Sentence case, comfortable line-height
3. **Labels (Space Mono):** UPPERCASE with letter-spacing: 0.1em
4. **Heat indicators:** Always use accent font with corresponding heat color

---

## Spacing Scale

```css
--space-xs: 0.25rem;   /* 4px */
--space-sm: 0.5rem;    /* 8px */
--space-md: 1rem;      /* 16px */
--space-lg: 1.5rem;    /* 24px */
--space-xl: 2rem;      /* 32px */
--space-2xl: 3rem;     /* 48px */
--space-3xl: 4rem;     /* 64px */
--space-4xl: 6rem;     /* 96px */
--space-section: clamp(4rem, 10vh, 8rem);
```

### Section Spacing

- Section padding: `py-16 sm:py-24 lg:py-32`
- Container max-width: `1400px` (7xl)
- Mobile padding: `px-4`
- Desktop padding: `px-6 lg:px-8`

---

## Component Patterns

### Heat Cards

```css
.heat-card {
  background: rgba(26, 26, 26, 0.5);
  backdrop-filter: blur(8px);
  border: 1px solid var(--heat-color-20);
  border-radius: 1rem;
  transition: all 0.3s ease;
}

.heat-card:hover {
  transform: translateY(-4px);
  border-color: var(--heat-color-60);
  box-shadow: 0 0 40px -10px var(--heat-color);
}
```

### Buttons

**Primary (Hot):**
```css
.btn-primary {
  background: var(--heat-jalapeno);
  color: var(--pepper-black);
  font-family: var(--font-accent);
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.75rem 1.5rem;
  border-radius: 9999px;
}
```

**Secondary (Ghost):**
```css
.btn-secondary {
  background: transparent;
  color: white;
  border: 1px solid var(--border-subtle);
  padding: 0.75rem 1.5rem;
  border-radius: 9999px;
}
```

**Belle (Women's):**
```css
.btn-belle {
  background: var(--belle-primary);
  color: var(--pepper-black);
  /* Same structure as primary */
}
```

### Heat Indicators

```html
<div class="heat-indicator">
  <span class="heat-dot heat-dot-jalapeno"></span>
  <span class="text-heat-jalapeno">Hot</span>
</div>
```

---

## Animation Standards

### Easing Curves

```css
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);    /* Primary entrance */
--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy emphasis */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);        /* Standard transitions */
```

### Duration Tokens

```css
--duration-fast: 150ms;    /* Micro-interactions */
--duration-medium: 300ms;  /* Standard transitions */
--duration-slow: 500ms;    /* Emphasis animations */
--duration-stagger: 100ms; /* Between staggered items */
```

### Entrance Animations

**Hero Text (Staggered):**
- Each word animates with `opacity: 0 → 1`, `y: 50px → 0`, `rotateX: -20° → 0°`
- Stagger delay: 150ms between words
- Duration: 800ms
- Easing: `ease-out-expo`

**Section Fade-In:**
- `opacity: 0 → 1`, `y: 30px → 0`
- Triggered on viewport intersection
- Duration: 600ms

**Card Hover:**
- `translateY(-8px)` on hover
- Duration: 200ms
- Border glow intensifies

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Responsive Breakpoints

| Name | Min Width | Usage |
|------|-----------|-------|
| sm | 640px | Large phone |
| md | 768px | Tablet |
| lg | 1024px | Small desktop |
| xl | 1280px | Desktop |
| 2xl | 1536px | Large desktop |

### Mobile-First Rules

1. Stack all layouts vertically on mobile
2. Use full-width cards below `md`
3. Collapse navigation to hamburger below `md`
4. Scale hero text using `clamp()` for smooth transitions

---

## Accessibility

### Color Contrast

- All text meets WCAG AA 4.5:1 minimum
- Heat colors tested against dark backgrounds
- Focus states use 2px visible ring

### Focus States

```css
:focus-visible {
  outline: none;
  ring: 2px solid var(--heat-jalapeno);
  ring-offset: 2px;
  ring-offset-color: var(--pepper-black);
}
```

### Touch Targets

- Minimum size: 44x44px
- All interactive elements meet this requirement
- Adequate spacing between touch targets on mobile

### ARIA & Semantics

- Skip link provided for keyboard users
- All icon buttons have aria-labels
- Proper heading hierarchy (h1 → h2 → h3)
- Section landmarks with aria-labelledby

---

## Visual Effects

### Grain Texture

Subtle film grain overlay at 3% opacity for texture:
```css
.grain-overlay {
  background-image: url("noise.svg");
  opacity: 0.03;
  pointer-events: none;
}
```

### Gradient Glows

- Radial gradients using heat colors at low opacity (10-20%)
- Animated scale/opacity for subtle movement
- Used sparingly for emphasis

### Border Glow

Cards receive border glow on hover:
```css
box-shadow: 0 0 40px -10px var(--heat-color);
```

---

## File Structure

```
src/
├── app/
│   ├── globals.css       # Design tokens & base styles
│   ├── layout.tsx        # Root layout with fonts
│   └── page.tsx          # Home page composition
├── components/
│   ├── Header.tsx        # Navigation
│   ├── HeroSection.tsx   # Hero with animated tagline
│   ├── TournamentSeries.tsx  # Heat cards grid
│   ├── PepperBelle.tsx   # Women's tournament
│   ├── EthosSection.tsx  # Brand story
│   ├── GalleryPreview.tsx # Photo grid
│   └── Footer.tsx        # Site footer
└── lib/
    ├── utils.ts          # cn() helper
    └── motion.ts         # Animation tokens
```

---

## Integration Notes

### Flickday Media Connection

This site is part of the Flickday Media ecosystem:
- Gallery links to SmugMug/Flickday photography
- Consistent dark aesthetic with Flickday Media
- Shared heat color system

### Future Enhancements

1. **Tournament Registration:** Add Supabase for signups
2. **Dynamic Gallery:** Pull from SmugMug API
3. **Event Calendar:** Tournament schedule component
4. **Player Profiles:** Optional player directory

---

**Remember:** This design system serves the underground volleyball community. Keep it raw, keep it competitive, keep it player-first.
