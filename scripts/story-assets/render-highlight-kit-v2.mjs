/**
 * Highlight Kit v2 — Jalapeño Open 2026.
 *
 * v1 shipped full-screen intro/outro cards. v2 is ACTION-FIRST: the reel opens
 * on gameplay, and identity/moments arrive as LAYERED OVERLAYS the editor
 * composes in CapCut. Individual assets, combined as needed — never baked-in
 * layouts. Poses follow the library README's reel grammar (menace = entrance,
 * mechanics pose = the matching callout, celebration = point sting,
 * champion = winner card, exhausted = outro).
 *
 *   node scripts/story-assets/render-highlight-kit-v2.mjs
 *
 * Full-bleed cards are 1080x1920 (Reels only — never wide formats). Overlay
 * elements are tight alpha PNGs captured at 2x; per the README start them at
 * ~18-28% of canvas height for corner stamps, 40-65% for hero moments.
 *
 * Output: scripts/story-assets/2026-jpo/kit-v2/
 *   cards/    cover.png · champion-card.png · outro-next-event.png
 *   overlays/ micro-id.png · bug.png · stamp-{roof,ace,dig}.png · sting-point.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { EVENT, TEAMS } from './jalapeno-open-2026.mjs'
import { requiredAsset, localFonts, assertPageReady, verifyPng } from './preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const POSES = join(HERE, '..', '..', 'public', 'images', 'mascots', 'anime', 'jalapeno')
const pose = (name) => requiredAsset(join(POSES, `${name}.png`))
const MENACE = pose('menace-walk')
const BLOCK = pose('block')
const SERVE = pose('jump-serve')
const DIG = pose('diving-dig')
const CELEBRATION = pose('celebration')
const CHAMPION = pose('champion')
const EXHAUSTED = pose('exhausted')
const LOGO = requiredAsset(join(HERE, '..', '..', 'public', 'images', 'mascots', 'anime', 'web', 'bell-pepper-logo-160.webp'))

const OUT = join(HERE, '2026-jpo', 'kit-v2')
const champs = TEAMS.find((t) => t.place === 1)

const ORANGE = '#f97316'
const FAMILIES = ['Bebas Neue', 'Anton', 'JetBrains Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

const reset = (w, h, transparent) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? 'transparent' : '#070707'};
   font-family:'JetBrains Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`

const doc = (w, h, body, transparent) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h, transparent)}</style></head><body>${body}</body></html>`

/** Dark-ink field + heat glow + grain — shared card atmosphere (cards only). */
const field = (glowX = '62%', glowY = '34%') => `
  <div style="position:absolute;inset:0;background:
    radial-gradient(55% 45% at ${glowX} ${glowY}, rgba(249,115,22,0.28), transparent 62%),
    radial-gradient(80% 60% at ${glowX} ${glowY}, rgba(250,204,21,0.08), transparent 70%), #070707"></div>
  <div style="position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.08;mix-blend-mode:overlay;pointer-events:none"></div>`

/* ─────────────  FULL-BLEED CARDS (1080x1920)  ───────────── */

// Reel cover — the poster frame, not an overlay. Type-led, menace entrance.
const cover = () => doc(1080, 1920, `
  ${field('64%', '30%')}
  <img src="${MENACE}" style="position:absolute;top:210px;right:-60px;width:640px;filter:drop-shadow(0 20px 50px rgba(0,0,0,0.6))">
  <div style="position:absolute;left:72px;bottom:600px;display:flex;flex-direction:column;gap:18px">
    <div style="font-size:30px;letter-spacing:0.22em;text-transform:uppercase;color:${ORANGE};font-weight:700">Let's Pepper Series</div>
    <div style="font-family:'Bebas Neue';font-size:172px;line-height:0.88;text-transform:uppercase;color:#fff">Jalapeño<br>Open ${EVENT.year}</div>
    <div style="font-family:'Anton';font-size:64px;letter-spacing:0.04em;text-transform:uppercase;color:${ORANGE}">Highlights</div>
  </div>
  <div style="position:absolute;left:72px;bottom:120px;font-size:28px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,245,240,0.6)">
    ${EVENT.date} · ${EVENT.loc} · ${EVENT.format}
  </div>`)

// Champion card — the payoff frame. Roster IS the team identity (names, no numbers).
const championCard = () => doc(1080, 1920, `
  ${field('50%', '26%')}
  <img src="${CHAMPION}" style="position:absolute;top:150px;left:50%;transform:translateX(-50%);width:660px;filter:drop-shadow(0 24px 60px rgba(0,0,0,0.65))">
  <div style="position:absolute;left:0;right:0;bottom:250px;display:flex;flex-direction:column;align-items:center;gap:22px;text-align:center">
    <div style="font-size:30px;letter-spacing:0.24em;text-transform:uppercase;color:${ORANGE};font-weight:700">Jalapeño Open ${EVENT.year}</div>
    <div style="font-family:'Bebas Neue';font-size:200px;line-height:0.9;text-transform:uppercase;color:#fff">Champions</div>
    <div style="font-family:'Anton';font-size:56px;line-height:1.25;text-transform:uppercase;color:#f5f5f0;letter-spacing:0.03em">${champs.surnames}</div>
    <div style="font-size:26px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.55)">Double elimination · 10 teams · Undisputed</div>
  </div>`)

// Outro — exhausted pose, points at the season finale (next event, not credits).
const outro = () => doc(1080, 1920, `
  ${field('46%', '34%')}
  <img src="${EXHAUSTED}" style="position:absolute;top:270px;left:50%;transform:translateX(-50%);width:600px;filter:drop-shadow(0 20px 50px rgba(0,0,0,0.6))">
  <div style="position:absolute;left:0;right:0;bottom:300px;display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center">
    <div style="font-size:28px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(245,245,240,0.6);font-weight:700">That's a wrap on the heat</div>
    <div style="font-family:'Bebas Neue';font-size:132px;line-height:0.9;text-transform:uppercase;color:#fff">See you at<br><span style="color:#facc15">the finale</span></div>
    <div style="font-family:'Anton';font-size:44px;text-transform:uppercase;color:#f5f5f0;letter-spacing:0.04em">Poblano Pepper Open · Aug 1</div>
    <div style="font-size:26px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.55)">letspepper.com · @letspepper.open</div>
  </div>`)

/* ─────────────  TIGHT ALPHA OVERLAYS (element captures @2x)  ───────────── */

// Corner identity lockup — replaces v1's full-screen intro. ~18-28% canvas height.
const microId = () => doc(760, 420, `
  <div id="cap" style="position:absolute;left:20px;top:20px;display:flex;align-items:center;gap:26px;padding:26px 34px">
    <img src="${LOGO}" style="width:120px;height:120px;filter:drop-shadow(0 4px 14px rgba(0,0,0,0.8))">
    <div style="display:flex;flex-direction:column;gap:4px">
      <div style="font-family:'Bebas Neue';font-size:74px;line-height:0.95;text-transform:uppercase;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.9)">Let's Pepper</div>
      <div style="font-size:26px;letter-spacing:0.2em;text-transform:uppercase;color:${ORANGE};font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.95)">Jalapeño Open ${EVENT.year}</div>
    </div>
  </div>`, true)

// Persistent watermark bug — small, lives the whole reel.
const bug = () => doc(860, 140, `
  <div id="cap" style="position:absolute;left:20px;top:20px;display:flex;align-items:baseline;gap:18px;padding:14px 22px">
    <span style="font-family:'Bebas Neue';font-size:44px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.95)">@letspepper<span style="color:${ORANGE}">.open</span></span>
    <span style="font-size:24px;color:rgba(245,245,240,0.55);text-shadow:0 2px 8px rgba(0,0,0,0.9)">×</span>
    <span style="font-size:28px;letter-spacing:0.08em;color:rgba(245,245,240,0.75);text-shadow:0 2px 8px rgba(0,0,0,0.9)">@flickday.media</span>
  </div>`, true)

// Moment stamp — mechanics pose + one word. Drop on the beat, gone in a second.
const stamp = (src, word, { landscape = false } = {}) => doc(landscape ? 1400 : 980, landscape ? 900 : 1240, `
  <div id="cap" style="position:absolute;left:20px;top:20px;width:${landscape ? 1360 : 940}px;height:${landscape ? 860 : 1200}px">
    <img src="${src}" style="position:absolute;${landscape
      ? 'left:50%;transform:translateX(-50%);top:0;width:1180px'
      : 'left:50%;transform:translateX(-50%);top:0;width:660px'};filter:drop-shadow(0 18px 44px rgba(0,0,0,0.7))">
    <div style="position:absolute;left:50%;transform:translateX(-50%) rotate(-4deg);bottom:${landscape ? '10px' : '30px'};
      font-family:'Bebas Neue';font-size:${landscape ? 210 : 240}px;line-height:0.9;text-transform:uppercase;color:#fff;
      text-shadow:0 4px 0 ${ORANGE}, 0 10px 34px rgba(0,0,0,0.85)">${word}</div>
  </div>`, true)

const JOBS = [
  { out: 'cards/cover.png', html: cover(), w: 1080, h: 1920 },
  { out: 'cards/champion-card.png', html: championCard(), w: 1080, h: 1920 },
  { out: 'cards/outro-next-event.png', html: outro(), w: 1080, h: 1920 },
  { out: 'overlays/micro-id.png', html: microId(), w: 760, h: 420, sel: '#cap' },
  { out: 'overlays/bug.png', html: bug(), w: 860, h: 140, sel: '#cap' },
  { out: 'overlays/stamp-roof.png', html: stamp(BLOCK, 'Roof.'), w: 980, h: 1240, sel: '#cap' },
  { out: 'overlays/stamp-ace.png', html: stamp(SERVE, 'Ace.'), w: 980, h: 1240, sel: '#cap' },
  { out: 'overlays/stamp-dig.png', html: stamp(DIG, 'Dig.', { landscape: true }), w: 1400, h: 900, sel: '#cap' },
  { out: 'overlays/sting-point.png', html: stamp(CELEBRATION, 'Point.'), w: 980, h: 1240, sel: '#cap' },
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'cards'), { recursive: true })
mkdirSync(join(OUT, 'overlays'), { recursive: true })

const browser = await chromium.launch()
for (const job of JOBS) {
  const alpha = Boolean(job.sel)
  const page = await browser.newPage({
    viewport: { width: job.w, height: job.h },
    deviceScaleFactor: alpha ? 2 : 1,
  })
  // setContent pages are about:blank-origin and can't load file:// fonts/images —
  // write the doc to disk and navigate so subresources are same-scheme (v1 pattern).
  const tmp = join(OUT, '.render.html')
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)
  const out = join(OUT, job.out)
  if (job.sel) {
    await page.locator(job.sel).screenshot({ path: out, omitBackground: true })
    verifyPng(out, { alpha: true })
  } else {
    await page.screenshot({ path: out })
    verifyPng(out, { width: job.w, height: job.h })
  }
  console.log(`✓ ${job.out}`)
  await page.close()
}
await browser.close()
rmSync(join(OUT, '.render.html'), { force: true })
console.log(`\nkit v2 → ${OUT}`)
