/**
 * Shared render preflight for the story-asset renderers.
 *
 * Guards the failure classes that already shipped broken assets once (JPO team
 * cards went to Instagram with a broken-image glyph baked in when the mascot
 * cutout went missing):
 *
 *   requiredAsset()   — a missing source image fails the run before Chromium
 *                       launches, instead of baking a broken <img> glyph
 *   localFonts()      — @font-face CSS over repo-local woff2 files, so a flaky
 *                       or offline network can't silently bake fallback type
 *                       (a render-time Google Fonts @import can)
 *   assertPageReady() — forces every declared face to load and verifies it via
 *                       document.fonts.check, then verifies every <img> decoded
 *                       with a real naturalWidth — throws instead of screenshotting
 *   verifyPng()       — IHDR check on the written file: expected dimensions and,
 *                       for overlay assets, an actual alpha channel
 *
 * Layouts stay per-event/per-renderer; only this validation layer is shared.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))

// Every face a renderer may declare. Files live in scripts/story-assets/fonts/
// (latin subset woff2, downloaded once from Google Fonts and committed).
const FACES = {
  'Bebas Neue': [{ weight: 400, file: 'bebas-neue-400.woff2' }],
  'Anton': [{ weight: 400, file: 'anton-400.woff2' }],
  'Archivo Black': [{ weight: 400, file: 'archivo-black-400.woff2' }],
  'Space Mono': [
    { weight: 400, file: 'space-mono-400.woff2' },
    { weight: 700, file: 'space-mono-700.woff2' },
  ],
  'JetBrains Mono': [
    { weight: 500, file: 'jetbrains-mono-500.woff2' },
    { weight: 700, file: 'jetbrains-mono-700.woff2' },
  ],
}

export function requiredAsset(path, hint = '') {
  if (!existsSync(path)) {
    throw new Error(`missing required asset: ${path}${hint ? `\n  ${hint}` : ''}`)
  }
  return pathToFileURL(path).href
}

export function localFonts(...families) {
  return families
    .map((family) => {
      const faces = FACES[family]
      if (!faces) throw new Error(`unknown font family "${family}" — add it to FACES in preflight.mjs`)
      return faces
        .map(({ weight, file }) => {
          const url = requiredAsset(join(HERE, 'fonts', file))
          return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(${url}) format('woff2')}`
        })
        .join('\n')
    })
    .join('\n')
}

export async function assertPageReady(page, families = []) {
  const specs = families.flatMap((family) =>
    (FACES[family] ?? []).map(({ weight }) => `${weight} 16px "${family}"`),
  )
  const failures = await page.evaluate(async (fontSpecs) => {
    await document.fonts.ready
    const out = []
    for (const spec of fontSpecs) {
      // load() forces the face to fetch even if this page's text never uses it,
      // so check() reflects availability rather than lazy-load order.
      try { await document.fonts.load(spec) } catch { /* fall through to check */ }
      if (!document.fonts.check(spec)) out.push(`font not loaded: ${spec}`)
    }
    for (const img of document.images) {
      if (!img.complete || img.naturalWidth === 0) out.push(`broken image: ${img.src}`)
    }
    return out
  }, specs)
  if (failures.length) throw new Error(`preflight failed — refusing to export:\n  ${failures.join('\n  ')}`)
}

export function verifyPng(path, { width, height, alpha } = {}) {
  const buf = readFileSync(path)
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buf.length < 26 || !buf.subarray(0, 8).equals(sig)) throw new Error(`not a PNG: ${path}`)
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  const colorType = buf[25]
  if (width !== undefined && w !== width) throw new Error(`${path}: width ${w}, expected ${width}`)
  if (height !== undefined && h !== height) throw new Error(`${path}: height ${h}, expected ${height}`)
  if (alpha && colorType !== 6) throw new Error(`${path}: expected an alpha channel (RGBA), got PNG color type ${colorType}`)
}
