/**
 * Let's Pepper — apparel heat-transfer (DTF) print art for sponsored triples teams.
 *
 * Sponsored "Let's Pepper" teams wear these at OTHER tournaments all summer —
 * the kit is the ad. Front = team identity, back = the billboard (URL + IG).
 *
 * Design bar: Nino's Brand Kit pieces (~/Downloads/ref) — character, painted
 * explosion, and hand-brushed lettering as ONE illustrated unit. The hero art
 * here was generated multi-reference-locked on those pieces (green team
 * colorway) via tools/gen-images/scripts/lpo-apparel-kit.mjs. This script only
 * ASSEMBLES: keyed art + functional payload type (the clean-subline register
 * his finished tee uses) + mockups. Display lettering is never typeset.
 *
 *   node scripts/apparel/render-apparel.mjs
 *
 * Output: scripts/apparel/2026-summer/
 *   print/back-full.png       12" w — green hero + payload (the billboard)
 *   print/back-full-red.png   12" w — alternate: Nino's red ghost hero + payload
 *   print/front-chest.png     7.5" w — green lockup (lettering in the art)
 *   print/left-chest.png      3.2" w — same lockup, crest size
 *   print/sleeve.png          3.5" w — mono URL strip
 *   mockups/*.png             review previews on garment colors
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '2026-summer')
const heroGreen = pathToFileURL(join(HERE, 'assets', 'back-hero-green.png')).href // 2991x3027
const heroRed = pathToFileURL(join(HERE, 'assets', 'back-hero-red.png')).href     // 4048x4160, Nino's
const lockup = join(HERE, 'assets', 'front-lockup-green.png')                     // 2265x3186

const WHITE = '#f5f5f0'
const GREEN = '#4ade80'
const GOLD = '#f5b91a'
const INKDARK = '#16240f' // deep green-black outline ink (payload type)

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@500;700&display=swap');`

const doc = (w, h, head, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}
   *{margin:0;padding:0;box-sizing:border-box}
   html,body{width:${w}px;height:${h}px;overflow:hidden;background:transparent;-webkit-font-smoothing:antialiased}
   ${head}</style></head><body>${body}</body></html>`

/* ─────────────  BACK — hero art + payload, 12" w @300dpi  ─────────────
   Payload sits in the clean-subline register of the finished tee (condensed,
   gold, dark outline, hard offset) — functional, under the illustrated unit. */
function backFull(heroSrc, artW, artH) {
  const w = 3600
  const aw = 3380, ah = Math.round(aw * (artH / artW))
  const h = ah + 700
  return doc(w, h, `
    .pep{position:absolute;left:50%;top:0;transform:translateX(-50%);width:${aw}px}
    .pay{position:absolute;left:0;right:0;top:${ah + 40}px;text-align:center}
    .pay .url{font-family:'Anton',sans-serif;font-size:330px;line-height:1;letter-spacing:0.01em;color:${GOLD};
      -webkit-text-stroke:10px ${INKDARK};text-shadow:0 18px 0 ${INKDARK}}
    .pay .ig{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:74px;letter-spacing:0.2em;color:${WHITE};margin-top:46px}
    .pay .ig b{color:${GREEN}}`,
  `<img class="pep" src="${heroSrc}">
   <div class="pay">
     <div class="url">LETSPEPPER.COM</div>
     <div class="ig">@LETSPEPPER.OPEN <b>&middot;</b> GRASS TRIPLES</div>
   </div>`)
}

/* ─────────────  SLEEVE / NAPE — strip, 3.5" w @300dpi  ───────────── */
function sleeve() {
  const w = 1050, h = 280
  return doc(w, h, `
    .cap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:26px}
    .cap .a{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:74px;color:${GREEN}}
    .cap span{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:74px;letter-spacing:0.08em;color:${WHITE}}`,
  `<div class="cap"><div class="a">&rarr;</div><span>LETSPEPPER.COM</span></div>`)
}

/* ─────────────  MOCKUPS — flat garment-color previews  ───────────── */
function mockup({ garment, label, print, printIn, topIn, chest }) {
  const w = 1400, h = 1750
  const pxPerIn = w / 22
  const pw = Math.round(printIn * pxPerIn)
  const top = Math.round(topIn * pxPerIn)
  const pos = chest
    ? `left:${Math.round(w * 0.60)}px;top:${top}px;width:${pw}px`
    : `left:50%;transform:translateX(-50%);top:${top}px;width:${pw}px`
  return doc(w, h, `
    body{background:${garment} !important}
    .print{position:absolute;${pos}}
    .lab{position:absolute;left:40px;bottom:32px;font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(128,128,128,0.85)}`,
  `<img class="print" src="${print}"><div class="lab">${label}</div>`)
}

/* ─────────────  queue  ───────────── */
mkdirSync(join(OUT, 'print'), { recursive: true })
mkdirSync(join(OUT, 'mockups'), { recursive: true })

// Front + left chest are the lockup art straight through — copy at full res,
// the shop scales by the placement spec. (Lettering lives in the art.)
copyFileSync(lockup, join(OUT, 'print', 'front-chest.png'))
copyFileSync(lockup, join(OUT, 'print', 'left-chest.png'))
console.log('✓ print/front-chest.png (art passthrough)')
console.log('✓ print/left-chest.png (art passthrough)')

const prints = [
  ['back-full', 3600, null, backFull(heroGreen, 2991, 3027)],
  ['back-full-red', 3600, null, backFull(heroRed, 4048, 4160)],
  ['sleeve', 1050, 280, sleeve()],
]
// backFull computes its own height — recover it for the viewport
const sized = prints.map(([name, w, h, html]) => {
  if (h) return [name, w, h, html]
  const m = html.match(/height:(\d+)px/)
  return [name, w, parseInt(m[1], 10), html]
})

const GARMENTS = [['black', '#181818'], ['forest', '#1c2e22']]
const mockups = []
for (const [g, hex] of GARMENTS) {
  const u = (n) => pathToFileURL(join(OUT, 'print', `${n}.png`)).href
  mockups.push([`${g}-back`, 1400, 1750, mockup({ garment: hex, label: `${g} · back · 12in green`, print: u('back-full'), printIn: 12, topIn: 3.5 })])
  mockups.push([`${g}-back-red`, 1400, 1750, mockup({ garment: hex, label: `${g} · back · 12in red alt`, print: u('back-full-red'), printIn: 12, topIn: 3.5 })])
  mockups.push([`${g}-front`, 1400, 1750, mockup({ garment: hex, label: `${g} · front · 7.5in lockup`, print: u('front-chest'), printIn: 7.5, topIn: 4.5 })])
  mockups.push([`${g}-leftchest`, 1400, 1750, mockup({ garment: hex, label: `${g} · left chest · 3.2in`, print: u('left-chest'), printIn: 3.2, topIn: 5.2, chest: true })])
}

const browser = await chromium.launch()
const render = async (dir, name, w, h, html, alpha) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const tmp = join(HERE, '_tmp.html')
  writeFileSync(tmp, html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(200)
  await page.screenshot({ path: join(OUT, dir, `${name}.png`), omitBackground: alpha, clip: { x: 0, y: 0, width: w, height: h } })
  console.log(`✓ ${dir}/${name}.png`)
  await page.close(); rmSync(tmp)
}

console.log('Rendering assembled prints...\n')
for (const [name, w, h, html] of sized) await render('print', name, w, h, html, true)
console.log('\nRendering mockups...\n')
for (const [name, w, h, html] of mockups) await render('mockups', name, w, h, html, false)
await browser.close()

// Stamp 300 DPI into the print PNGs so shops size them correctly.
for (const name of ['back-full', 'back-full-red', 'front-chest', 'left-chest', 'sleeve']) {
  const p = join(OUT, 'print', `${name}.png`)
  execSync(`magick "${p}" -units PixelsPerInch -density 300 "${p}"`)
}
console.log(`\nDone → scripts/apparel/2026-summer/  (print art stamped 300 DPI)`)
