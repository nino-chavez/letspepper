/**
 * Jalapeño Open countdown — THREE alternate concepts, story (1080x1920) + feed
 * (1080x1350) each. Built because render-jalapeno-announce.mjs's 03-reminder
 * (radial burst + centered cutout mascot) was judged too derivative of itself —
 * it's the same template as 01-heat-coming and every jalapeno-team-social card.
 * These three intentionally break from that DNA (no centered mascot, no radial
 * burst) while staying inside the shipped brand system (Anton/Bebas/mono type,
 * the heat-level palette in DESIGN-SYSTEM.md, grain texture, existing chrome).
 *
 *   A — Gritty Field:  full-bleed photoreal brand-kit shot (never used in any
 *       story-asset card), off-center stamped numeral, camera-readout caption.
 *   B — Stat Board:    no photo/mascot at all — a 2x2 data grid in the same
 *       language as render-standings.mjs's STAT_BOARDS, repurposed pre-event.
 *   C — Heat Index:    a restrained CSS gauge climbing the DESIGN-SYSTEM.md
 *       heat-level ladder (Bell green -> Poblano yellow -> Jalapeño orange ->
 *       Habanero red), landing on Jalapeño with 4 days left.
 *
 * Days-out and team count are computed/read at render time, so re-run on the
 * day you post (same convention as render-jalapeno-announce.mjs).
 *
 *   node scripts/story-assets/render-jalapeno-countdown.mjs [concept ...]
 *   node scripts/story-assets/render-jalapeno-countdown.mjs A B C
 *
 * Output: scripts/story-assets/2026-jpo/countdown/{concept}-{story|feed}.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const outDir = join(HERE, '2026-jpo', 'countdown')
mkdirSync(outDir, { recursive: true })

const grittyPhotoUrl = pathToFileURL(join(HERE, '..', 'apparel', 'ref', 'bell-pepper-open-2026-v4.webp')).href

const EVENT = {
  name: 'Jalapeño Open',
  tier: 'Bring The Heat',
  date: 'Saturday · July 18',
  dateStamp: '07·18·26',
  location: 'Nature Meadows Park · Aurora, IL',
  handle: '@letspepper.open',
  teams: (() => {
    const csv = readFileSync(join(HERE, 'jpo-mens.csv'), 'utf8').split(/\r?\n/)
    return csv.filter((l) => /^,\d+,/.test(l)).length
  })(),
}

const MS_DAY = 86_400_000
const now = new Date()
const daysOut = Math.round((new Date(2026, 6, 18) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / MS_DAY)

// Heat-level ladder from DESIGN-SYSTEM.md — reused verbatim, not invented.
const HEAT = [
  { label: 'Mild', event: 'Bell Pepper', color: '#4ade80' },
  { label: 'Medium', event: 'Poblano', color: '#facc15' },
  { label: 'Hot', event: 'Jalapeño', color: '#f97316' },
  { label: 'Extreme', event: 'Habanero', color: '#ef4444' },
]
const ORANGE = '#f97316'
const YELLOW = '#facc15'
const RED = '#ef4444'
const INK = '#070707'

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const reset = (w, h) => `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;background:${INK};overflow:hidden}`

// Production credit — Nino as content capture, flickday.media as the studio behind
// the account. Baked into every card because Stories can't carry a caption via the
// API (bare media only), so this is the only place the credit can live on those.
const CREDIT = `@nino.chavez.photo <span class="x">&times;</span> @flickday.media`

/* ───────────────────────  A — GRITTY FIELD  ─────────────────────── */
function gritty(e, { width: w, height: h } = {}) {
  const feed = h < 1500
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h)}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .photo{position:absolute;inset:0;width:${w}px;height:${h}px;object-fit:cover;object-position:56% 32%;filter:contrast(1.1) saturate(0.88) brightness(0.92)}
  .grade{position:absolute;inset:0;background:
    linear-gradient(180deg, rgba(7,7,7,0.72) 0%, rgba(7,7,7,0.05) 22%, rgba(7,7,7,0.02) 48%, rgba(7,7,7,0.86) ${feed ? 68 : 74}%, #070707 100%),
    linear-gradient(90deg, rgba(239,68,68,0.1), transparent 40%)}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 200px 30px rgba(0,0,0,0.55)}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:320px;opacity:0.16;mix-blend-mode:overlay;pointer-events:none}
  .frame{position:absolute;inset:0;padding:${feed ? '56px 64px 56px' : '88px 76px 96px'};display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:19px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.88)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .spacer{flex:1}
  .numwrap{display:flex;align-items:flex-end;gap:18px}
  .kicker{font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.28em;text-transform:uppercase;color:${RED};margin-bottom:${feed ? 10 : 16}px}
  .num{font-family:'Anton',sans-serif;font-size:${feed ? 260 : 340}px;line-height:0.78;color:#f5f5f0;text-shadow:0 0 50px rgba(239,68,68,0.35),0 10px 40px rgba(0,0,0,0.7);-webkit-text-stroke:2px rgba(239,68,68,0.5)}
  .daylabel{font-family:'Bebas Neue',sans-serif;font-size:${feed ? 40 : 50}px;letter-spacing:0.1em;color:${RED};padding-bottom:${feed ? 22 : 34}px}
  .info{margin-top:${feed ? 18 : 26}px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
  .infoL .ev{font-family:'Bebas Neue',sans-serif;font-size:${feed ? 34 : 40}px;letter-spacing:0.04em;color:#f5f5f0}
  .infoL .wh{margin-top:6px;font-size:${feed ? 17 : 19}px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,245,240,0.68);white-space:nowrap}
  .cta{display:inline-flex;align-items:center;gap:10px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:${feed ? 28 : 32}px;letter-spacing:0.05em;padding:${feed ? '10px 22px' : '12px 26px'};border-radius:9px;box-shadow:0 0 28px rgba(249,115,22,0.5);white-space:nowrap;flex:none}
  .readout{margin-top:${feed ? 16 : 22}px;font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(250,204,21,0.75)}
  .credit{margin-top:6px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;letter-spacing:0.06em;color:rgba(245,245,240,0.6)}
  .credit .x{color:rgba(245,245,240,0.35);margin:0 8px}
  </style></head><body>
    <img class="photo" src="${grittyPhotoUrl}"><div class="grade"></div><div class="vignette"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="spacer"></div>
      <div class="numwrap"><span class="kicker">The heat hits in</span></div>
      <div class="numwrap"><span class="num">${daysOut}</span><span class="daylabel">DAYS.</span></div>
      <div class="info">
        <div class="infoL"><div class="ev">${e.name} &middot; ${e.tier}</div><div class="wh">${e.date}, 2026 &middot; ${e.location}</div></div>
        <span class="cta">Enter &rarr;</span>
      </div>
      <div class="readout">${e.location.split('·')[0].trim()} &middot; ${e.dateStamp} &middot; f/2.8</div>
      <div class="credit">${CREDIT}</div>
    </div>
  </body></html>`
}

/* ───────────────────────  B — STAT BOARD  ─────────────────────── */
function statBoard(e, { width: w, height: h } = {}) {
  const feed = h < 1500
  const CELLS = [
    { n: String(daysOut), l: daysOut === 1 ? 'DAY OUT' : 'DAYS OUT' },
    { n: String(e.teams), l: 'TEAMS IN' },
    { n: '3v3', l: 'FORMAT' },
    { n: '8:30', l: 'CHECK-IN' },
  ]
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h)}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .bg{position:absolute;inset:0;background:radial-gradient(90% 55% at 50% 0%, rgba(249,115,22,0.14), transparent 60%),${INK}}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:320px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}
  .frame{position:absolute;inset:0;padding:${feed ? '52px 60px 56px' : '92px 76px 100px'};display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:19px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.88)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .main{flex:1;display:flex;flex-direction:column;justify-content:center}
  .kicker{font-family:'JetBrains Mono',monospace;font-size:${feed ? 22 : 25}px;letter-spacing:0.3em;text-transform:uppercase;color:${ORANGE}}
  .head{margin-top:16px;font-family:'Anton',sans-serif;font-size:${feed ? 104 : 132}px;line-height:0.9;color:#f5f5f0}
  .head em{font-style:normal;color:${ORANGE};text-shadow:0 0 40px rgba(249,115,22,0.5)}
  .grid{margin-top:${feed ? 48 : 76}px;display:grid;grid-template-columns:1fr 1fr;border-top:1px solid rgba(245,245,240,0.16);border-left:1px solid rgba(245,245,240,0.16)}
  .cell{border-right:1px solid rgba(245,245,240,0.16);border-bottom:1px solid rgba(245,245,240,0.16);padding:${feed ? '38px 30px' : '58px 42px'}}
  .cell .bt{font-family:'Anton',sans-serif;font-size:${feed ? 92 : 116}px;line-height:1;color:${ORANGE};text-shadow:0 0 24px rgba(249,115,22,0.3)}
  .cell .bb{margin-top:${feed ? 10 : 16}px;font-family:'JetBrains Mono',monospace;font-size:${feed ? 17 : 19}px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.55)}
  .stack{margin-top:${feed ? 56 : 84}px;text-align:center}
  .when{font-family:'Bebas Neue',sans-serif;font-size:${feed ? 38 : 46}px;letter-spacing:0.04em;color:${YELLOW}}
  .where{margin-top:6px;font-size:20px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.68)}
  .cta{display:flex;justify-content:center;margin-top:${feed ? 20 : 28}px}
  .cta .btn{display:inline-flex;align-items:center;gap:10px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:${feed ? 30 : 36}px;letter-spacing:0.05em;padding:${feed ? '11px 26px' : '13px 30px'};border-radius:10px;box-shadow:0 0 30px rgba(249,115,22,0.45)}
  .credit{display:flex;justify-content:center;margin-top:${feed ? 16 : 22}px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;letter-spacing:0.06em;color:rgba(245,245,240,0.5)}
  .credit .x{color:rgba(245,245,240,0.3);margin:0 8px}
  </style></head><body>
    <div class="bg"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="main">
        <div class="kicker">${e.name} &middot; By the numbers</div>
        <div class="head">${daysOut} DAYS <em>OUT.</em></div>
        <div class="grid">${CELLS.map((c) => `<div class="cell"><div class="bt">${c.n}</div><div class="bb">${c.l}</div></div>`).join('')}</div>
        <div class="stack">
          <div class="when">${e.date}, 2026</div>
          <div class="where">${e.location}</div>
          <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span></div>
          <div class="credit">${CREDIT}</div>
        </div>
      </div>
    </div>
  </body></html>`
}

/* ───────────────────────  C — HEAT INDEX  ─────────────────────── */
function heatIndex(e, { width: w, height: h } = {}) {
  const feed = h < 1500
  const activeIdx = 2 // Jalapeño — "Hot"
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h)}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  .bg{position:absolute;inset:0;background:radial-gradient(60% 40% at 78% 40%, rgba(239,68,68,0.14), transparent 65%),${INK}}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:320px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}
  .frame{position:absolute;inset:0;padding:${feed ? '52px 60px 56px' : '92px 76px 100px'};display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:19px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.88)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(250,204,21,0.5)}
  .kicker{margin-top:${feed ? 30 : 48}px;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.3em;text-transform:uppercase;color:${ORANGE}}
  .head{margin-top:14px;font-family:'Anton',sans-serif;font-size:${feed ? 82 : 96}px;line-height:0.92;color:#f5f5f0}
  .head em{font-style:normal;color:${ORANGE};text-shadow:0 0 40px rgba(249,115,22,0.5)}
  .body-row{flex:1;display:flex;align-items:center;gap:${feed ? 36 : 52}px;margin-top:${feed ? 20 : 30}px}
  .gauge{position:relative;width:${feed ? 64 : 78}px;height:100%;max-height:${feed ? 480 : 720}px;border-radius:999px;background:rgba(245,245,240,0.08);border:1px solid rgba(245,245,240,0.14);overflow:hidden;flex:none}
  .fill{position:absolute;left:0;right:0;bottom:0;height:${(activeIdx / (HEAT.length - 1)) * 100}%;background:linear-gradient(180deg, ${HEAT[3].color}, ${HEAT[2].color} 40%, ${HEAT[1].color} 72%, ${HEAT[0].color});box-shadow:0 0 30px rgba(239,68,68,0.4)}
  .marker{position:absolute;left:-14px;right:-14px;height:6px;background:#f5f5f0;box-shadow:0 0 16px rgba(245,245,240,0.9);border-radius:3px}
  .rungs{display:flex;flex-direction:column;justify-content:space-between;height:100%;max-height:${feed ? 480 : 720}px;padding:6px 0}
  .rung{display:flex;align-items:center;gap:14px}
  .rung .dot{width:12px;height:12px;border-radius:50%;flex:none}
  .rung .tx{font-family:'JetBrains Mono',monospace;font-size:${feed ? 15 : 17}px;letter-spacing:0.1em;text-transform:uppercase}
  .rung .tx b{display:block;font-family:'Bebas Neue',sans-serif;font-size:${feed ? 20 : 23}px;letter-spacing:0.04em}
  .rung.active .tx{color:#f5f5f0}
  .rung:not(.active) .tx{color:rgba(245,245,240,0.4)}
  .spacer2{flex:0}
  .stack{margin-top:${feed ? 24 : 36}px;text-align:left}
  .daysrow{display:flex;align-items:baseline;gap:16px}
  .num{font-family:'Anton',sans-serif;font-size:${feed ? 96 : 118}px;line-height:0.85;color:${ORANGE};text-shadow:0 0 34px rgba(249,115,22,0.4)}
  .daylabel{font-family:'Bebas Neue',sans-serif;font-size:${feed ? 32 : 38}px;letter-spacing:0.06em;color:#f5f5f0}
  .when{margin-top:${feed ? 10 : 16}px;font-family:'Bebas Neue',sans-serif;font-size:${feed ? 30 : 36}px;letter-spacing:0.04em;color:${YELLOW}}
  .where{margin-top:4px;font-size:19px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,245,240,0.66)}
  .cta{margin-top:${feed ? 18 : 26}px}
  .cta .btn{display:inline-flex;align-items:center;gap:10px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:${feed ? 28 : 33}px;letter-spacing:0.05em;padding:${feed ? '10px 24px' : '12px 28px'};border-radius:10px;box-shadow:0 0 28px rgba(249,115,22,0.45)}
  .credit{margin-top:${feed ? 14 : 20}px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:15px;letter-spacing:0.06em;color:rgba(245,245,240,0.5)}
  .credit .x{color:rgba(245,245,240,0.3);margin:0 8px}
  </style></head><body>
    <div class="bg"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="kicker">${e.name}</div>
      <div class="head">THE HEAT IS<br><em>CLIMBING.</em></div>
      <div class="body-row">
        <div class="gauge"><div class="fill"><div class="marker" style="top:0"></div></div></div>
        <div class="rungs">${HEAT.slice().reverse().map((h) => {
          const isActive = h.event === 'Jalapeño'
          return `<div class="rung${isActive ? ' active' : ''}"><span class="dot" style="background:${h.color};box-shadow:0 0 ${isActive ? 14 : 4}px ${h.color}"></span><span class="tx">${h.label}<b>${h.event}${isActive ? ' &larr; we are here' : ''}</b></span></div>`
        }).join('')}</div>
      </div>
      <div class="stack">
        <div class="daysrow"><span class="num">${daysOut}</span><span class="daylabel">DAYS LEFT</span></div>
        <div class="when">${e.date}, 2026</div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span></div>
        <div class="credit">${CREDIT}</div>
      </div>
    </div>
  </body></html>`
}

const STORY = { width: 1080, height: 1920 }
const FEED = { width: 1080, height: 1350 }

const CONCEPTS = {
  A: { name: 'gritty-field', fn: gritty },
  B: { name: 'stat-board', fn: statBoard },
  C: { name: 'heat-index', fn: heatIndex },
}

const requested = process.argv.slice(2)
const unknown = requested.filter((c) => !CONCEPTS[c])
if (unknown.length) {
  console.error(`Unknown concept(s): ${unknown.join(', ')}\nAvailable: ${Object.keys(CONCEPTS).join(', ')}`)
  process.exit(1)
}
const toRender = (requested.length ? requested : Object.keys(CONCEPTS)).flatMap((key) => {
  const c = CONCEPTS[key]
  return [
    { name: `${c.name}-story`, html: c.fn(EVENT, STORY), viewport: STORY },
    { name: `${c.name}-feed`, html: c.fn(EVENT, FEED), viewport: FEED },
  ]
})

console.log(`Days out: ${daysOut} · Teams in: ${EVENT.teams}`)
console.log(`Rendering ${toRender.length} countdown-concept frames...\n`)

const browser = await chromium.launch()
for (const job of toRender) {
  const page = await browser.newPage({ viewport: job.viewport, deviceScaleFactor: 2 })
  const tmp = join(outDir, `_tmp-${job.name}.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(outDir, `${job.name}.png`) })
  console.log(`✓ ${job.name}.png`)
  await page.close()
  rmSync(tmp)
}
await browser.close()
console.log('\nDone. Frames in scripts/story-assets/2026-jpo/countdown/')
