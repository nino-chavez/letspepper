/**
 * Jalapeño Open announcement — Stories, 1080x1920. Two-frame sequence:
 *   01-heat-coming.png — mascot-led hype card (anime pose library, menace-walk)
 *   02-next-up.png     — photo-led "next up" card (real Bell Pepper Open 2026 action shot)
 *
 * Mirrors render-concepts.mjs's structure (top bar / event pill / headline / when-where / cta)
 * but swaps the roster list for a general tournament announcement — this event has no
 * roster yet. Visual language (Anton headline, mono eyebrow, grain, heat-color glow) follows
 * the shipped 2026-bpo social system (card-intro.png) as inspiration, translated to the
 * jalapeño heat color (#f97316) instead of green.
 *
 *   node scripts/story-assets/render-jalapeno-announce.mjs [frame-name ...]
 *
 * Pass frame names to render a subset (e.g. `02-next-up-template`).
 * 02-next-up's hero photo (hero-bpo-action-crop.jpg) was a manual crop that no longer
 * exists on disk — the shipped 02-next-up-final.png is the keeper; don't re-render 02
 * without restoring the source.
 *
 * The countdown reminder card used to live here (03-reminder) but was retired in
 * favor of render-jalapeno-countdown.mjs's three alternate concepts — the single
 * radial-burst/mascot template was reused too many times across this event's assets.
 *
 * Output: scripts/story-assets/2026-jpo/announce/*.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { requiredAsset, localFonts, assertPageReady, verifyPng } from './preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const outDir = join(HERE, '2026-jpo', 'announce')
mkdirSync(outDir, { recursive: true })
// Canonical anime mascot pose library — menace-walk = the hype/stare-down pose.
const mascotUrl = requiredAsset(join(HERE, '..', '..', 'public', 'images', 'mascots', 'anime', 'jalapeno', 'menace-walk.png'))
// Scratch photo crop that was never kept anywhere durable; the frame that uses
// it fails assertPageReady loudly until a replacement crop is dropped in place.
const heroUrl = pathToFileURL(join(outDir, 'hero-bpo-action-crop.jpg')).href

const EVENT = {
  name: 'Jalapeño Open',
  tier: 'Bring The Heat',
  date: 'Saturday · July 18',
  dateStamp: '07·18·26',
  location: 'Nature Meadows Park · Aurora, IL',
  cta: 'Enter at letspepper.com',
  handle: '@letspepper.open',
}

const ORANGE = '#f97316'
const YELLOW = '#facc15'
const INK = '#070707'

const FAMILIES = ['Bebas Neue', 'Anton', 'Space Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const reset = (w = 1080, h = 1920) => `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;background:${INK};overflow:hidden}`
const RESET = reset()

/* ───────────────  FRAME 1 — "THE HEAT IS COMING"  (mascot-led)  ─────────────── */
function heatComing(e) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .burst{position:absolute;inset:0;background:
    radial-gradient(46% 34% at 50% 46%, rgba(249,115,22,0.55), transparent 62%),
    radial-gradient(70% 50% at 50% 46%, rgba(250,204,21,0.16), transparent 70%)}
  .rays{position:absolute;inset:0;opacity:0.5;background:repeating-conic-gradient(from 0deg at 50% 46%,
    rgba(249,115,22,0.16) 0deg 4deg, transparent 4deg 16deg)}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.1;mix-blend-mode:overlay;pointer-events:none}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 220px 40px rgba(0,0,0,0.65)}
  .frame{position:absolute;inset:0;padding:96px 80px 110px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.85)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .eyebrow{margin-top:36px;font-size:26px;letter-spacing:0.3em;text-transform:uppercase;color:${YELLOW};text-align:center}
  .mascot{position:relative;flex:1;display:flex;align-items:center;justify-content:center;margin:8px 0}
  .mascot img{width:560px;filter:drop-shadow(0 30px 60px rgba(0,0,0,0.6))}
  .stack{text-align:center}
  .head{font-family:'Anton',sans-serif;font-size:150px;line-height:0.86;letter-spacing:0.01em;color:#f5f5f0;text-shadow:0 8px 36px rgba(0,0,0,0.6)}
  .head .hot{color:${ORANGE};text-shadow:0 0 50px rgba(249,115,22,0.65)}
  .tier{margin-top:14px;font-size:28px;letter-spacing:0.1em;color:rgba(245,245,240,0.85)}
  .when{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:34px;font-size:30px;letter-spacing:0.04em}
  .when .b{font-family:'Bebas Neue',sans-serif;font-size:50px;letter-spacing:0.04em;color:${YELLOW}}
  .where{font-size:23px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.7);margin-top:8px;text-align:center}
  .cta{display:flex;align-items:center;justify-content:center;gap:20px;margin-top:34px}
  .cta .btn{display:inline-flex;align-items:center;gap:12px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:0.06em;padding:14px 34px;border-radius:10px;box-shadow:0 0 34px rgba(249,115,22,0.5)}
  .h{margin-top:14px;font-size:20px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,245,240,0.6);text-align:center}
  </style></head><body>
    <div class="burst"></div><div class="rays"></div><div class="grain"></div><div class="vignette"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="eyebrow">Grass Triples &middot; 3v3</div>
      <div class="mascot"><img src="${mascotUrl}"></div>
      <div class="stack">
        <div class="head">JALAPE&Ntilde;O<br><span class="hot">OPEN.</span></div>
        <div class="tier">${e.tier}</div>
        <div class="when"><span class="b">${e.date}, 2026</span></div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span></div>
        <div class="h">@letspepper.open</div>
      </div>
    </div>
  </body></html>`
}

/* ───────────────  FRAME 2 — "NEXT UP"  (photo-led, real BPO 2026 footage)  ─────────────── */
function nextUp(e) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .photo{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;object-position:50% 40%;filter:brightness(1.08) contrast(1.06) saturate(1.05)}
  .tint{position:absolute;inset:0;background:linear-gradient(200deg, rgba(249,115,22,0.16), rgba(250,204,21,0.08));mix-blend-mode:overlay}
  .grade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,7,7,0.8) 0%, rgba(7,7,7,0.25) 14%, rgba(7,7,7,0.1) 26%, rgba(7,7,7,0.08) 38%, rgba(7,7,7,0.78) 58%, #070707 84%),radial-gradient(120% 70% at 50% 22%, rgba(249,115,22,0.14), transparent 60%)}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 200px 24px rgba(0,0,0,0.5)}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}
  .frame{position:absolute;inset:0;padding:230px 80px 250px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .stack{margin-top:auto}
  .event{display:flex;align-items:center;gap:14px;font-size:26px;letter-spacing:0.26em;text-transform:uppercase;color:${ORANGE};margin-bottom:14px}
  .event .dot{width:11px;height:11px;border-radius:50%;background:${ORANGE};box-shadow:0 0 14px ${ORANGE}}
  .head{font-family:'Anton',sans-serif;font-size:150px;line-height:0.86;letter-spacing:-0.01em;color:#f5f5f0;text-shadow:0 8px 36px rgba(0,0,0,0.5)}
  .head em{font-style:normal;color:${ORANGE};text-shadow:0 0 40px rgba(249,115,22,0.5)}
  .sub{margin-top:22px;font-size:28px;letter-spacing:0.06em;color:rgba(245,245,240,0.85)}
  .when{display:flex;align-items:center;gap:16px;margin-top:30px;font-size:30px;letter-spacing:0.04em;color:#f5f5f0}
  .when .b{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:0.04em;color:${YELLOW}}
  .where{font-size:23px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.7);margin-top:8px}
  .cta{display:flex;align-items:center;gap:20px;margin-top:30px}
  .cta .btn{display:inline-flex;align-items:center;gap:12px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:0.06em;padding:14px 30px;border-radius:10px;box-shadow:0 0 34px rgba(249,115,22,0.45)}
  .cta .h{margin-left:auto;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <img class="photo" src="${heroUrl}"><div class="tint"></div><div class="grade"></div><div class="vignette"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="stack">
        <div class="event"><span class="dot"></span>Next Up &middot; Season Continues</div>
        <div class="head">BRING THE<br><em>HEAT.</em></div>
        <div class="sub">${e.name} &middot; ${e.tier}</div>
        <div class="when"><span class="b">${e.date}, 2026</span></div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span><span class="h">@letspepper.open</span></div>
      </div>
    </div>
  </body></html>`
}

/* ─────────  FRAME 2b — "NEXT UP" TEMPLATE  (no photo — drop-in background)  ───────── */
function nextUpTemplate(e) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .bg{position:absolute;inset:0;background:radial-gradient(120% 65% at 50% 30%, rgba(249,115,22,0.16), transparent 62%),${INK}}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 220px 40px rgba(0,0,0,0.6)}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}
  .frame{position:absolute;inset:0;padding:96px 80px 110px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .masthead{margin-top:44px}
  .event{display:flex;align-items:center;gap:14px;font-size:26px;letter-spacing:0.26em;text-transform:uppercase;color:${ORANGE}}
  .event .dot{width:11px;height:11px;border-radius:50%;background:${ORANGE};box-shadow:0 0 14px ${ORANGE}}
  .head{margin-top:14px;font-family:'Anton',sans-serif;font-size:150px;line-height:0.86;letter-spacing:-0.01em;color:#f5f5f0;text-shadow:0 8px 36px rgba(0,0,0,0.5)}
  .head em{font-style:normal;color:${ORANGE};text-shadow:0 0 40px rgba(249,115,22,0.5)}
  /* open canvas — drop your graphic here */
  .canvas{flex:1}
  .stack{margin-top:auto}
  .sub{font-size:28px;letter-spacing:0.06em;color:rgba(245,245,240,0.85)}
  .when{display:flex;align-items:center;gap:16px;margin-top:22px;font-size:30px;letter-spacing:0.04em;color:#f5f5f0}
  .when .b{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:0.04em;color:${YELLOW}}
  .where{font-size:23px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.7);margin-top:8px}
  .cta{display:flex;align-items:center;gap:20px;margin-top:30px}
  .cta .btn{display:inline-flex;align-items:center;gap:12px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:0.06em;padding:14px 30px;border-radius:10px;box-shadow:0 0 34px rgba(249,115,22,0.45)}
  .cta .h{margin-left:auto;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <div class="bg"></div><div class="vignette"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="masthead">
        <div class="event"><span class="dot"></span>Next Up &middot; Season Continues</div>
        <div class="head">BRING THE<br><em>HEAT.</em></div>
      </div>
      <div class="canvas"></div>
      <div class="stack">
        <div class="sub">${e.name} &middot; Grass Triples &middot; 3v3</div>
        <div class="when"><span class="b">${e.date}, 2026</span></div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span><span class="h">@letspepper.open</span></div>
      </div>
    </div>
  </body></html>`
}

const doc = (body) => body // bodies are already full documents

const STORY = { width: 1080, height: 1920 }

const jobs = [
  { name: '01-heat-coming', html: heatComing(EVENT) },
  // hero-bpo-action-crop.jpg (its source photo) is gone — rendering this by
  // default silently produces a blank photo band. Excluded from the bare run;
  // pass the name explicitly once the source is restored. 02-next-up-final.png
  // (the last good render) is the keeper in the meantime.
  { name: '02-next-up', html: nextUp(EVENT), skipByDefault: true },
  { name: '02-next-up-template', html: nextUpTemplate(EVENT) },
]

const only = process.argv.slice(2)
const unknown = only.filter((n) => !jobs.some((j) => j.name === n))
if (unknown.length) {
  console.error(`Unknown frame(s): ${unknown.join(', ')}\nAvailable: ${jobs.map((j) => j.name).join(', ')}`)
  process.exit(1)
}
const toRender = only.length ? jobs.filter((j) => only.includes(j.name)) : jobs.filter((j) => !j.skipByDefault)

const browser = await chromium.launch()
console.log(`Rendering ${toRender.length} Jalapeño Open announcement frames...\n`)
for (const job of toRender) {
  const page = await browser.newPage({ viewport: job.viewport ?? STORY, deviceScaleFactor: 2 })
  const tmp = join(outDir, `_tmp-${job.name}.html`)
  writeFileSync(tmp, doc(job.html))
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)
  await page.waitForTimeout(250)
  const out = join(outDir, `${job.name}.png`)
  await page.screenshot({ path: out })
  const vp = job.viewport ?? STORY
  verifyPng(out, { width: vp.width * 2, height: vp.height * 2 }) // deviceScaleFactor: 2
  console.log(`✓ ${job.name}.png`)
  await page.close()
  rmSync(tmp)
}
await browser.close()
console.log('\nDone. Frames in scripts/story-assets/2026-jpo/announce/')
