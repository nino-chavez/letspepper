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
 *
 * Requires ImageMagick 7 (`magick` on PATH — brew install imagemagick).
 * Add a job here ONLY when the site actually references the derivative.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(ROOT, 'public', 'images', 'mascots', 'anime')
const OUT = path.join(SRC, 'web')

/** [source (relative to anime/), output name, target width, crop?] — site-referenced
 *  assets only. `crop` is an ImageMagick geometry applied before the resize
 *  (used for the logo mark, a controlled head-crop of the anchor pose). */
const JOBS = [
  // header/footer logo mark — bell-pepper face + stem from the anchor pose
  ['bell-pepper/menace-walk.png', 'bell-pepper-logo-160.webp', 160, '470x470+267+95'],
  // homepage tournament cards — rendered ≤64 CSS px wide; 1.1 hover × 3 DPR ≈ 211 device px
  ['bell-pepper/menace-walk.png', 'bell-pepper-menace-walk-256.webp', 256],
  ['jalapeno/menace-walk.png', 'jalapeno-menace-walk-256.webp', 256],
  ['poblano/menace-walk.png', 'poblano-menace-walk-256.webp', 256],
  // flavor-hero role poses (source is 1024 wide — format-only conversion)
  ['bell-pepper/block.png', 'bell-pepper-block-1024.webp', 1024],
  ['jalapeno/jump-serve.png', 'jalapeno-jump-serve-1024.webp', 1024],
  ['poblano/menace-walk.png', 'poblano-menace-walk-1024.webp', 1024],
  // post-phase champion swaps (jalapeno also serves the /standings hero)
  ['bell-pepper/champion.png', 'bell-pepper-champion-1024.webp', 1024],
  ['jalapeno/champion.png', 'jalapeno-champion-1024.webp', 1024],
  ['poblano/champion.png', 'poblano-champion-1024.webp', 1024],
  // 404
  ['ghost-pepper/exhausted.png', 'ghost-pepper-exhausted-1024.webp', 1024],
  // about-page universe band (source 1992×633)
  ['family-overview.png', 'family-overview-1600.webp', 1600],
]

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
    '-quality', '82',
    '-define', 'webp:alpha-quality=95', // hard ink contours — keep alpha edges clean
    '-define', 'webp:method=6', // slowest/best encode; this is a build-time script
    out,
  ])
  console.log(`✓ ${outName}  ${(statSync(out).size / 1024).toFixed(0)} KB`)
  written++
}
console.log(`\n${written} written, ${fresh} up-to-date → public/images/mascots/anime/web/`)
if (failed) process.exit(1)
