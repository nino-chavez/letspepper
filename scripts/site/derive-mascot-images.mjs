#!/usr/bin/env node
/**
 * Mascot web derivatives — pre-generated because the production /_next/image
 * endpoint on Cloudflare Pages is a passthrough (verified 2026-07-21: ?w=256
 * returned the full-size PNG). Source PNGs in public/images/mascots/anime/
 * stay canonical for social/print; the site references ONLY these committed
 * WebP derivatives.
 *
 * USAGE
 *   node scripts/site/derive-mascot-images.mjs           # skips up-to-date outputs
 *   node scripts/site/derive-mascot-images.mjs --force   # regenerate everything
 *   node scripts/site/derive-mascot-images.mjs --check   # verify every anime/web
 *       derivative referenced in src/ exists on disk (no ImageMagick needed —
 *       runs in CI before the build so a reference to an unshipped derivative
 *       fails the deploy instead of 404ing in production)
 *
 * Generation requires ImageMagick 7 (`magick` on PATH — brew install imagemagick).
 * Add a job here ONLY when the site actually references the derivative.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(ROOT, 'public', 'images', 'mascots', 'anime')
const OUT = path.join(SRC, 'web')

/** The logo mark: a controlled head-crop (face + stem) of the bell-pepper anchor pose. */
const LOGO_CROP = '470x470+267+95'

/** [source (relative to anime/), output name, target width, crop?] — site-referenced
 *  assets only. `crop` is an ImageMagick geometry applied before the resize
 *  (used for the logo mark, a controlled head-crop of the anchor pose).
 *  .png outputs are for the next/og share cards — Satori can't decode WebP, and
 *  they get palette-quantized (cel shade survives it) to stay edge-bundle small. */
const JOBS = [
  // header/footer logo mark — bell-pepper face + stem from the anchor pose
  ['bell-pepper/menace-walk.png', 'bell-pepper-logo-160.webp', 160, LOGO_CROP],
  // OG share-card mascots (PNG for Satori; bundled into the edge og routes)
  ['jalapeno/menace-walk.png', 'og-jalapeno-menace-walk-360.png', 360],
  ['bell-pepper/block.png', 'og-bell-pepper-block-360.png', 360],
  ['jalapeno/jump-serve.png', 'og-jalapeno-jump-serve-360.png', 360],
  ['poblano/menace-walk.png', 'og-poblano-menace-walk-360.png', 360],
  // poblano-event OG fronts Poblano Verde (men's divisions only; see flavors/[slug] note)
  ['poblano-verde/menace-walk.png', 'og-poblano-verde-menace-walk-360.png', 360],
  // homepage tournament cards — rendered ≤64 CSS px wide; 1.1 hover × 3 DPR ≈ 211 device px
  ['bell-pepper/menace-walk.png', 'bell-pepper-menace-walk-256.webp', 256],
  ['jalapeno/menace-walk.png', 'jalapeno-menace-walk-256.webp', 256],
  ['poblano/menace-walk.png', 'poblano-menace-walk-256.webp', 256],
  // flavor-hero role poses (source is 1024 wide — format-only conversion)
  ['bell-pepper/block.png', 'bell-pepper-block-1024.webp', 1024],
  ['jalapeno/jump-serve.png', 'jalapeno-jump-serve-1024.webp', 1024],
  ['poblano/menace-walk.png', 'poblano-menace-walk-1024.webp', 1024],
  // poblano-event surfaces front Poblano Verde (hero, homepage card, post-phase champion)
  ['poblano-verde/menace-walk.png', 'poblano-verde-menace-walk-1024.webp', 1024],
  ['poblano-verde/menace-walk.png', 'poblano-verde-menace-walk-256.webp', 256],
  ['poblano-verde/champion.png', 'poblano-verde-champion-1024.webp', 1024],
  // post-phase champion swaps (jalapeno also serves the /standings hero)
  ['bell-pepper/champion.png', 'bell-pepper-champion-1024.webp', 1024],
  ['jalapeno/champion.png', 'jalapeno-champion-1024.webp', 1024],
  ['poblano/champion.png', 'poblano-champion-1024.webp', 1024],
  // 404
  ['ghost-pepper/exhausted.png', 'ghost-pepper-exhausted-1024.webp', 1024],
  // about-page universe band (source 1992×633)
  ['family-overview.png', 'family-overview-1600.webp', 1600],
]

if (process.argv.includes('--check')) {
  // Every /images/mascots/anime/web/*.webp string literal in src/ must resolve
  // to a file. Template-composed refs (the flavor-hero pose src) are covered by
  // their JOBS entries; this catches the literal-reference / forgot-to-commit
  // class that shipped a 404 logo once already.
  const srcDir = path.join(ROOT, 'src')
  const refs = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.(tsx?|css)$/.test(entry.name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/images\/mascots\/anime\/web\/([\w.-]+\.(?:webp|png))/g)) {
          refs.add(m[1])
        }
      }
    }
  }
  walk(srcDir)
  const missing = [...refs].filter((name) => !existsSync(path.join(OUT, name)))
  if (missing.length) {
    console.error(`✗ src/ references missing derivatives:\n  ${missing.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`✓ all ${refs.size} referenced derivatives exist`)
  process.exit(0)
}

const force = process.argv.includes('--force')
mkdirSync(OUT, { recursive: true })

let written = 0
let fresh = 0
let failed = 0
for (const [srcRel, outName, width, crop] of JOBS) {
  const src = path.join(SRC, srcRel)
  const out = path.join(OUT, outName)
  if (!existsSync(src)) {
    console.error(`✗ missing source: ${srcRel}`)
    failed++
    continue
  }
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs) {
    fresh++
    continue
  }
  execFileSync('magick', [
    src,
    ...(crop ? ['-crop', crop, '+repage'] : []),
    '-strip',
    '-filter', 'Lanczos',
    '-resize', `${width}x>`, // shrink-only: never upscale a source
    ...(outName.endsWith('.png')
      ? ['-colors', '256'] // palette PNG — Satori-safe and edge-bundle small
      : [
          '-quality', '82',
          '-define', 'webp:alpha-quality=95', // hard ink contours — keep alpha edges clean
          '-define', 'webp:method=6', // slowest/best encode; this is a build-time script
        ]),
    out,
  ])
  console.log(`✓ ${outName}  ${(statSync(out).size / 1024).toFixed(0)} KB`)
  written++
}
// App icons — same controlled head-crop as the logo mark, emitted into src/app/
// where Next's file conventions auto-wire the favicon + apple-touch link.
const LOGO_SRC = path.join(SRC, 'bell-pepper', 'menace-walk.png')
const ICONS = [
  ['icon.png', 256, null], // favicon — transparent
  ['apple-icon.png', 180, '#0a0a0a'], // iOS wants opaque; pepper-black tile
]
for (const [name, size, bg] of ICONS) {
  const out = path.join(ROOT, 'src', 'app', name)
  if (!force && existsSync(out) && statSync(out).mtimeMs >= statSync(LOGO_SRC).mtimeMs) {
    fresh++
    continue
  }
  execFileSync('magick', [
    LOGO_SRC,
    '-crop', LOGO_CROP, '+repage',
    '-strip',
    '-filter', 'Lanczos',
    ...(bg
      ? ['-resize', `${Math.round(size * 0.86)}x${Math.round(size * 0.86)}`, '-background', bg, '-gravity', 'center', '-extent', `${size}x${size}`]
      : ['-resize', `${size}x${size}`]),
    '-colors', '256',
    out,
  ])
  console.log(`✓ src/app/${name}  ${(statSync(out).size / 1024).toFixed(0)} KB`)
  written++
}

console.log(`\n${written} written, ${fresh} up-to-date → public/images/mascots/anime/web/ + src/app icons`)
if (failed) process.exit(1)
