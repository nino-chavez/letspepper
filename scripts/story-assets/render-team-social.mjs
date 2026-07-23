/**
 * Production roster-announcement Stories for the Bell Pepper Open (1080x1920).
 * Social-first: "WE'RE IN." primary, "THE FIELD JUST GOT DEEPER." sprinkled in for comment-bait.
 *
 *   node scripts/story-assets/teams/render-team-social.mjs
 *
 * Data:   bpo-mens.csv (men's tab export)
 * Photo:  concepts/hero-a.png (shared across teams)
 * Output: social/team-NN-<lead>.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const heroA = pathToFileURL(join(__dirname, 'concepts/hero-a.png')).href
const outDir = join(__dirname, 'social')
mkdirSync(outDir, { recursive: true })

const EVENT = {
  name: 'Bell Pepper Open',
  tier: 'Season Opener',
  date: 'Sunday · June 7',
  dateStamp: '06·07·26',
  location: 'Nature Meadows Park · Aurora, IL',
  handle: '@letspepper.open',
}

// Teams (0-based index) that get the "challenge" variant — every 4th, evenly spread.
const isChallenge = (i) => i % 4 === 3

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap');`
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const RESET = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px;height:1920px;background:#070707;overflow:hidden}`
const PHOTO = `.photo{position:absolute;inset:0;width:1080px;height:1920px;object-fit:cover;object-position:50% 40%;filter:brightness(1.1) contrast(1.06) saturate(1.08)}
  .tint{position:absolute;inset:0;background:linear-gradient(200deg, rgba(245,166,35,0.14), rgba(34,197,94,0.10));mix-blend-mode:overlay}
  .vignette{position:absolute;inset:0;box-shadow:inset 0 0 200px 24px rgba(0,0,0,0.5)}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}`

function werein(e, players) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  ${PHOTO}
  .grade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,7,7,0.5) 0%, rgba(7,7,7,0) 18%, rgba(7,7,7,0) 36%, rgba(7,7,7,0.72) 58%, #070707 82%),radial-gradient(120% 70% at 50% 24%, rgba(74,222,128,0.12), transparent 60%)}
  .frame{position:absolute;inset:0;padding:230px 80px 250px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .stamp{color:#f5a623;font-weight:700;letter-spacing:0.16em;text-shadow:0 0 16px rgba(245,166,35,0.5)}
  .stack{margin-top:auto}
  .event{display:flex;align-items:center;gap:14px;font-size:26px;letter-spacing:0.26em;text-transform:uppercase;color:#4ade80;margin-bottom:14px}
  .event .dot{width:11px;height:11px;border-radius:50%;background:#4ade80;box-shadow:0 0 14px #4ade80}
  .head{font-family:'Anton',sans-serif;font-size:188px;line-height:0.84;letter-spacing:-0.01em;color:#f5f5f0;text-shadow:0 8px 36px rgba(0,0,0,0.5)}
  .head em{font-style:normal;color:#4ade80;text-shadow:0 0 40px rgba(74,222,128,0.45)}
  .roster{list-style:none;margin-top:30px}
  .roster li{display:flex;align-items:center;gap:24px;padding:11px 0}
  .roster li + li{border-top:1px solid rgba(245,245,240,0.16)}
  .roster .tick{width:13px;height:30px;background:#4ade80;box-shadow:0 0 18px rgba(74,222,128,0.8);flex:none}
  .roster .nm{font-family:'Bebas Neue',sans-serif;line-height:0.92;letter-spacing:0.01em;white-space:nowrap}
  .when{display:flex;align-items:center;gap:16px;margin-top:30px}
  .when .b{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:0.04em;color:#f5a623}
  .where{font-size:23px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.7);margin-top:8px}
  .cta{display:flex;align-items:center;gap:20px;margin-top:30px}
  .cta .btn{display:inline-flex;align-items:center;gap:12px;background:#4ade80;color:#062a12;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:0.06em;padding:14px 30px;border-radius:10px;box-shadow:0 0 34px rgba(74,222,128,0.45)}
  .cta .h{margin-left:auto;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <img class="photo" src="${heroA}"><div class="tint"></div><div class="grade"></div><div class="vignette"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="stack">
        <div class="event"><span class="dot"></span>${e.name} &middot; ${e.tier}</div>
        <div class="head">WE'RE <em>IN.</em></div>
        <ul class="roster">${players.map(p => `<li><span class="tick"></span><span class="nm">${p}</span></li>`).join('')}</ul>
        <div class="when"><span class="b">${e.date}, 2026</span></div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span><span class="h">@letspepper.open</span></div>
      </div>
    </div>
  </body></html>`
}

function challenge(e, players) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  ${PHOTO}
  .photo{object-position:50% 36%}
  .grade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,7,7,0.78) 0%, rgba(7,7,7,0.15) 26%, rgba(7,7,7,0.1) 42%, rgba(7,7,7,0.8) 62%, #070707 84%)}
  .frame{position:absolute;inset:0;padding:230px 80px 250px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .top .stamp{color:#f5a623;font-weight:700;letter-spacing:0.16em}
  .kheadwrap{margin-top:30px}
  .event{display:flex;align-items:center;gap:14px;font-size:24px;letter-spacing:0.26em;text-transform:uppercase;color:#4ade80}
  .event .dot{width:11px;height:11px;border-radius:50%;background:#4ade80;box-shadow:0 0 14px #4ade80}
  .head{font-family:'Archivo Black',sans-serif;font-size:120px;line-height:0.86;letter-spacing:-0.02em;color:#f5f5f0;margin-top:14px;text-shadow:0 8px 30px rgba(0,0,0,0.55)}
  .head em{font-style:normal;color:#f5a623}
  .stack{margin-top:auto}
  .lab{font-size:24px;letter-spacing:0.3em;text-transform:uppercase;color:#4ade80;margin-bottom:14px}
  .roster{list-style:none}
  .roster .nm{font-family:'Bebas Neue',sans-serif;line-height:1.0;letter-spacing:0.01em;white-space:nowrap}
  .roster .nm + .nm{border-top:1px solid rgba(245,245,240,0.14)}
  .prompt{margin-top:26px;font-size:27px;letter-spacing:0.04em;color:#f5f5f0}
  .prompt b{color:#f5a623}
  .when{font-family:'Bebas Neue',sans-serif;font-size:46px;letter-spacing:0.04em;color:#4ade80;margin-top:24px}
  .meta{display:flex;align-items:center;gap:16px;margin-top:8px;font-size:22px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(245,245,240,0.72)}
  .meta .h{margin-left:auto;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <img class="photo" src="${heroA}"><div class="tint"></div><div class="grade"></div><div class="vignette"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="kheadwrap">
        <div class="event"><span class="dot"></span>${e.name}</div>
        <div class="head">THE FIELD<br>JUST GOT <em>DEEPER.</em></div>
      </div>
      <div class="stack">
        <div class="lab">Now entered</div>
        <ul class="roster">${players.map(p => `<li class="nm">${p}</li>`).join('')}</ul>
        <div class="prompt">&#8627; <b>@ the team</b> you'd put across the net from them.</div>
        <div class="when">${e.date}, 2026 &middot; ${e.tier}</div>
        <div class="meta"><span>${e.location}</span><span class="h">${e.handle}</span></div>
      </div>
    </div>
  </body></html>`
}

/* ── CSV parse (quoted fields with embedded commas) ── */
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else {
      if (ch === '"') q = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur); return out
}

const csv = readFileSync(join(__dirname, 'bpo-mens.csv'), 'utf8').split(/\r?\n/)
const teams = []
for (const line of csv) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  const num = (f[1] || '').trim()
  const players = (f[2] || '').trim()
  const status = (f[3] || '').trim()
  if (!/^\d+$/.test(num) || !players) continue
  const names = players.split(',').map(s => s.trim()).filter(s => s && s.toUpperCase() !== 'TBD')
  if (!names.length) continue
  teams.push({ num: num.padStart(2, '0'), names, status })
}

const slug = (names) => names[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '')

console.log(`Rendering ${teams.length} team cards...\n`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })

for (let i = 0; i < teams.length; i++) {
  const t = teams[i]
  const variant = isChallenge(i) ? 'challenge' : 'werein'
  const html = variant === 'challenge' ? challenge(EVENT, t.names) : werein(EVENT, t.names)
  const tmp = join(outDir, `_tmp.html`)
  writeFileSync(tmp, html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  // Auto-fit roster names: base size by player count, shrink to fit width.
  await page.evaluate(({ four, isWerein }) => {
    const nms = [...document.querySelectorAll('.roster .nm')]
    const base = isWerein ? (four ? 70 : 90) : (four ? 74 : 96)
    const avail = isWerein ? 880 : 916
    nms.forEach(n => { n.style.fontSize = base + 'px' })
    const maxw = Math.max(...nms.map(n => n.scrollWidth))
    const fs = maxw > avail ? Math.floor(base * avail / maxw) : base
    nms.forEach(n => { n.style.fontSize = fs + 'px' })
  }, { four: t.names.length >= 4, isWerein: variant === 'werein' })

  await page.waitForTimeout(160)
  const name = `team-${t.num}-${slug(t.names)}`
  await page.screenshot({ path: join(outDir, `${name}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  console.log(`✓ ${name}.png  [${variant}]  ${t.status}`)
  rmSync(tmp)
}

await browser.close()
console.log('\nDone. Team Stories in scripts/story-assets/teams/social/')
