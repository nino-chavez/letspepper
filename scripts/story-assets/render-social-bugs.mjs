/**
 * Social handle bugs for CapCut / Reels — clean, tightly-cropped, transparent PNGs.
 *
 *   node scripts/story-assets/render-social-bugs.mjs
 *
 * Output: scripts/story-assets/social-bugs/   (alpha, auto-cropped to the pill + glow)
 *   Drop into CapCut, scale to taste. Rendered at 2x so down-scaling stays crisp.
 *
 * NB: these do NOT use backdrop-filter:blur — on a transparent export there is
 * nothing behind the pill to blur, so glass blur bakes out as a flat fill. Every
 * style below reads on its own over bright grass/sky footage.
 *
 * Styles per handle:
 *   glass  — dark translucent pill, green/yellow hairline, IG glyph in brand green
 *   solid  — opaque near-black pill, left green→yellow accent edge (max legibility)
 *   light  — official IG gradient glyph on a white pill, dark handle (the "verified" look)
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const outDir = join(HERE, 'social-bugs')
mkdirSync(outDir, { recursive: true })

const GREEN = '#4ade80'
const YELLOW = '#facc15'
const INK = '#0a0a0a'

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@500;700;800&display=swap');`

// Instagram glyph — stroke version (inherits currentColor) for dark/glass styles.
const igStroke = (color) => `
  <svg class="ig" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/>
    <circle cx="12" cy="12" r="4.6"/>
    <circle cx="17.6" cy="6.4" r="1.3" fill="${color}" stroke="none"/>
  </svg>`

// Instagram glyph — official gradient fill, for the light/"verified" style.
const igGradient = `
  <svg class="ig" viewBox="0 0 24 24">
    <defs>
      <radialGradient id="ig" cx="0.3" cy="1" r="1.1">
        <stop offset="0" stop-color="#fdf497"/>
        <stop offset="0.12" stop-color="#fdf497"/>
        <stop offset="0.45" stop-color="#fd5949"/>
        <stop offset="0.7" stop-color="#d6249f"/>
        <stop offset="1" stop-color="#285AEB"/>
      </radialGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig)"/>
    <circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" stroke-width="1.8"/>
    <circle cx="17.5" cy="6.5" r="1.3" fill="#fff"/>
  </svg>`

const reset = `*{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
  body{font-family:'JetBrains Mono',monospace;-webkit-font-smoothing:antialiased;
    display:inline-block}
  /* pad gives glows/shadows room so the crop doesn't clip them */
  .pad{display:inline-block;padding:48px}
  .ig{flex:none}`

// --- style definitions ---------------------------------------------------
function glass(handle) {
  return `<div class="pad"><div class="pill" style="
      display:inline-flex;align-items:center;gap:22px;
      padding:26px 44px 26px 32px;border-radius:999px;
      background:rgba(8,8,8,0.62);border:2px solid rgba(74,222,128,0.45);
      box-shadow:0 14px 50px rgba(0,0,0,0.5), 0 0 30px rgba(74,222,128,0.18)">
    <span style="display:flex;width:64px;height:64px">${igStroke(GREEN)}</span>
    <span style="font-weight:800;font-size:54px;letter-spacing:0.01em;color:#f6f6f1;white-space:nowrap">
      <span style="color:${GREEN}">@</span>${handle}</span>
  </div></div>`
}

function solid(handle) {
  return `<div class="pad"><div class="pill" style="
      position:relative;display:inline-flex;align-items:center;gap:22px;
      padding:28px 46px 28px 40px;border-radius:18px;overflow:hidden;
      background:${INK};box-shadow:0 16px 46px rgba(0,0,0,0.55)">
    <span style="position:absolute;left:0;top:0;bottom:0;width:12px;
      background:linear-gradient(180deg,${GREEN},${YELLOW})"></span>
    <span style="display:flex;width:62px;height:62px;margin-left:6px">${igStroke('#fff')}</span>
    <span style="font-weight:800;font-size:54px;letter-spacing:0.01em;color:#fff;white-space:nowrap">
      <span style="color:${GREEN}">@</span>${handle}</span>
  </div></div>`
}

function light(handle) {
  return `<div class="pad"><div class="pill" style="
      display:inline-flex;align-items:center;gap:20px;
      padding:24px 42px 24px 28px;border-radius:999px;
      background:#fbfbf7;box-shadow:0 16px 46px rgba(0,0,0,0.4)">
    <span style="display:flex;width:64px;height:64px">${igGradient}</span>
    <span style="font-weight:800;font-size:52px;letter-spacing:0.01em;color:#16110f;white-space:nowrap">
      @${handle}</span>
  </div></div>`
}

// Standardized on `solid` (best legibility over bright grass/sky footage).
// glass + light kept above for future use; add them back here to re-render.
const STYLES = { solid }
const HANDLES = [
  { slug: 'letspepper', handle: 'letspepper.open' },
  { slug: 'flickday', handle: 'flickday.media' },
]

// Combined co-bug — both handles in ONE shape. Lighter than two stacked bars
// (one shadow, one accent edge, aligned right edges). Two-line stack.
function combo() {
  const row = (handle) => `
    <span style="display:inline-flex;align-items:center;gap:18px">
      <span style="display:flex;width:50px;height:50px">${igStroke('#fff')}</span>
      <span style="font-weight:800;font-size:46px;letter-spacing:0.01em;color:#fff;white-space:nowrap">
        <span style="color:${GREEN}">@</span>${handle}</span>
    </span>`
  return `<div class="pad"><div class="pill" style="
      position:relative;display:inline-flex;flex-direction:column;gap:18px;
      padding:26px 44px 26px 40px;border-radius:20px;overflow:hidden;
      background:${INK};box-shadow:0 16px 46px rgba(0,0,0,0.55)">
    <span style="position:absolute;left:0;top:0;bottom:0;width:12px;
      background:linear-gradient(180deg,${GREEN},${YELLOW})"></span>
    ${row('letspepper.open')}${row('flickday.media')}
  </div></div>`
}

// Combined co-bug — single line, most compact. EVENT ✕ MEDIA on one row.
function comboInline() {
  return `<div class="pad"><div class="pill" style="
      position:relative;display:inline-flex;align-items:center;gap:18px;
      padding:24px 44px 24px 40px;border-radius:999px;overflow:hidden;
      background:${INK};box-shadow:0 16px 46px rgba(0,0,0,0.55)">
    <span style="position:absolute;left:0;top:0;bottom:0;width:10px;
      background:linear-gradient(180deg,${GREEN},${YELLOW})"></span>
    <span style="display:flex;width:50px;height:50px;margin-left:4px">${igStroke('#fff')}</span>
    <span style="font-weight:800;font-size:44px;letter-spacing:0.01em;color:#fff;white-space:nowrap">
      <span style="color:${GREEN}">@</span>letspepper.open</span>
    <span style="font-size:30px;color:rgba(255,255,255,0.35);margin:0 4px">✕</span>
    <span style="font-weight:700;font-size:38px;letter-spacing:0.01em;color:${YELLOW};white-space:nowrap">
      @flickday.media</span>
  </div></div>`
}

const doc = (body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset}</style></head><body>${body}</body></html>`

const jobs = []
for (const { slug, handle } of HANDLES)
  for (const [style, fn] of Object.entries(STYLES))
    jobs.push({ name: `ig-${slug}-${style}`, html: doc(fn(handle)) })
jobs.push({ name: 'ig-combo-stack', html: doc(combo()) })
jobs.push({ name: 'ig-combo-inline', html: doc(comboInline()) })

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} social bugs...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 600 }, deviceScaleFactor: 2 })
  const tmp = join(outDir, `_tmp.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  const el = await page.$('.pad')
  await el.screenshot({ path: join(outDir, `${job.name}.png`), omitBackground: true })
  console.log(`✓ ${job.name}.png`)
  await page.close()
  rmSync(tmp)
}
await browser.close()
console.log('\nDone. Social bugs in scripts/story-assets/social-bugs/')
