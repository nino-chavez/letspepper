/**
 * Roster-announcement Stories for the Jalapeño Open (1080x1920).
 * Ported from render-team-social.mjs (Bell Pepper Open). Social-first:
 * "WE'RE IN." primary, "THE FIELD JUST GOT DEEPER." sprinkled in for comment-bait.
 *
 * BPO's version used a real event photo (concepts/hero-a.png) full-bleed behind
 * the roster. No Jalapeño Open photo exists yet — the event hasn't happened —
 * so this version uses the dark-ink + mascot treatment already shipped in
 * render-jalapeno-announce.mjs instead of a photo dependency. Swap in a real
 * action photo later by replacing the .mascot block with render-team-social.mjs's
 * .photo block if wanted once JPO footage exists.
 *
 *   node scripts/story-assets/render-jalapeno-team-social.mjs
 *   node scripts/story-assets/render-jalapeno-team-social.mjs --roster demo-roster.csv
 *
 * Data:   jpo-mens.csv (the real, reconciled 9-team field — columns: blank, #,
 *         "Team List", Status). Pass --roster <file> to render a different roster;
 *         a scrubbed demo-roster.csv ships alongside for live walkthroughs (no real
 *         names). A non-default roster renders into teams-demo/, never touching the
 *         real cards.
 * Output: 2026-jpo/teams/team-NN-<lead>.png  (teams-demo/ for a --roster override)
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, isAbsolute } from 'node:path'
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { requiredAsset, localFonts, assertPageReady, verifyPng } from './preflight.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Canonical anime mascot pose library (alpha PNGs, 1024x1536 portrait) — see its
// README for pose semantics. Required: a missing pose fails the run instead of
// shipping a card without it — cards HAVE shipped broken once.
const POSES = join(__dirname, '..', '..', 'public', 'images', 'mascots', 'anime', 'jalapeno')
const pose = (name) => requiredAsset(join(POSES, `${name}.png`))
// menace-walk = "we're in" entrance; roof block = the challenge variant's denial.
const MENACE = pose('menace-walk'), BLOCK = pose('block')
const mascotImg = (src) => `<img class="mascot-img" src="${src}">`

// --roster <file> overrides the default (real) roster. A scrubbed/demo roster
// renders into its own dir (teams-demo/) so a live walkthrough never touches or
// clobbers the real team cards. Default behavior is unchanged.
const rosterArg = (() => { const i = process.argv.indexOf('--roster'); return i !== -1 ? process.argv[i + 1] : null })()
const rosterFile = rosterArg || 'jpo-mens.csv'
const rosterPath = isAbsolute(rosterFile) ? rosterFile : join(__dirname, rosterFile)
const isDemoRoster = rosterFile !== 'jpo-mens.csv'
const outDir = join(__dirname, '2026-jpo', isDemoRoster ? 'teams-demo' : 'teams')
mkdirSync(outDir, { recursive: true })

const EVENT = {
  name: 'Jalapeño Open',
  tier: 'Bring The Heat',
  date: 'Saturday · July 18',
  dateStamp: '07·18·26',
  location: 'Nature Meadows Park · Aurora, IL',
  handle: '@letspepper.open',
}

const ORANGE = '#f97316', YELLOW = '#facc15'

// Teams (0-based index) that get the "challenge" variant — every 4th, evenly spread.
const isChallenge = (i) => i % 4 === 3

const FAMILIES = ['Bebas Neue', 'Anton', 'Archivo Black', 'Space Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const RESET = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:1080px;height:1920px;background:#070707;overflow:hidden}`
// Dark-ink field + radial glow + positioned mascot, replacing BPO's full-bleed photo.
const MASCOT = `.field{position:absolute;inset:0;background:
    radial-gradient(50% 38% at 68% 30%, rgba(249,115,22,0.30), transparent 62%),
    radial-gradient(75% 55% at 68% 30%, rgba(250,204,21,0.08), transparent 70%), #070707}
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.09;mix-blend-mode:overlay;pointer-events:none}
  .mascot-img{position:absolute;top:60px;right:-20px;width:500px;filter:drop-shadow(0 24px 50px rgba(0,0,0,0.6))}`

function werein(e, players) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  ${MASCOT}
  .grade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,7,7,0.15) 0%, rgba(7,7,7,0.1) 30%, rgba(7,7,7,0.78) 58%, #070707 82%)}
  .frame{position:absolute;inset:0;padding:230px 80px 250px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 2px 10px rgba(0,0,0,0.95),0 0 6px rgba(0,0,0,0.9),0 0 16px rgba(250,204,21,0.5)}
  .stack{margin-top:auto}
  .event{display:flex;align-items:center;gap:14px;font-size:26px;letter-spacing:0.26em;text-transform:uppercase;color:${ORANGE};margin-bottom:14px}
  .event .dot{width:11px;height:11px;border-radius:50%;background:${ORANGE};box-shadow:0 0 14px ${ORANGE}}
  .head{font-family:'Anton',sans-serif;font-size:188px;line-height:0.84;letter-spacing:-0.01em;color:#f5f5f0;text-shadow:0 8px 36px rgba(0,0,0,0.5)}
  .head em{font-style:normal;color:${ORANGE};text-shadow:0 0 40px rgba(249,115,22,0.45)}
  .roster{list-style:none;margin-top:30px}
  .roster li{display:flex;align-items:center;gap:24px;padding:11px 0}
  .roster li + li{border-top:1px solid rgba(245,245,240,0.16)}
  .roster .tick{width:13px;height:30px;background:${ORANGE};box-shadow:0 0 18px rgba(249,115,22,0.8);flex:none}
  .roster .nm{font-family:'Bebas Neue',sans-serif;line-height:0.92;letter-spacing:0.01em;white-space:nowrap}
  .when{display:flex;align-items:center;gap:16px;margin-top:30px}
  .when .b{font-family:'Bebas Neue',sans-serif;font-size:48px;letter-spacing:0.04em;color:${YELLOW}}
  .where{font-size:23px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,245,240,0.7);margin-top:8px}
  .cta{display:flex;align-items:center;gap:20px;margin-top:30px}
  .cta .btn{display:inline-flex;align-items:center;gap:12px;background:${ORANGE};color:#2a0f02;font-family:'Bebas Neue',sans-serif;font-size:40px;letter-spacing:0.06em;padding:14px 30px;border-radius:10px;box-shadow:0 0 34px rgba(249,115,22,0.45)}
  .cta .h{margin-left:auto;font-size:22px;letter-spacing:0.14em;text-transform:uppercase;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <div class="field"></div>${mascotImg(MENACE)}<div class="grade"></div><div class="grain"></div>
    <div class="frame">
      <div class="top"><span>${e.handle}</span><span class="stamp">&rsaquo; ${e.dateStamp}</span></div>
      <div class="stack">
        <div class="event"><span class="dot"></span>${e.name} &middot; ${e.tier}</div>
        <div class="head">WE'RE <em>IN.</em></div>
        <ul class="roster">${players.map(p => `<li><span class="tick"></span><span class="nm">${p}</span></li>`).join('')}</ul>
        <div class="when"><span class="b">${e.date}, 2026</span></div>
        <div class="where">${e.location}</div>
        <div class="cta"><span class="btn">Enter &rarr; letspepper.com</span><span class="h">Link in bio</span></div>
      </div>
    </div>
  </body></html>`
}

function challenge(e, players) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${RESET}
  body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0}
  ${MASCOT}
  .grade{position:absolute;inset:0;background:linear-gradient(180deg, rgba(7,7,7,0.55) 0%, rgba(7,7,7,0.12) 26%, rgba(7,7,7,0.1) 42%, rgba(7,7,7,0.8) 62%, #070707 84%)}
  .frame{position:absolute;inset:0;padding:230px 80px 250px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;font-size:20px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(245,245,240,0.9)}
  .top .stamp{color:${YELLOW};font-weight:700;letter-spacing:0.16em;text-shadow:0 2px 10px rgba(0,0,0,0.95),0 0 6px rgba(0,0,0,0.9)}
  .kheadwrap{margin-top:30px}
  .event{display:flex;align-items:center;gap:14px;font-size:24px;letter-spacing:0.26em;text-transform:uppercase;color:${ORANGE}}
  .event .dot{width:11px;height:11px;border-radius:50%;background:${ORANGE};box-shadow:0 0 14px ${ORANGE}}
  .head{font-family:'Archivo Black',sans-serif;font-size:120px;line-height:0.86;letter-spacing:-0.02em;color:#f5f5f0;margin-top:14px;text-shadow:0 8px 30px rgba(0,0,0,0.55)}
  .head em{font-style:normal;color:${YELLOW}}
  .stack{margin-top:auto}
  .lab{font-size:24px;letter-spacing:0.3em;text-transform:uppercase;color:${ORANGE};margin-bottom:14px}
  .roster{list-style:none}
  .roster .nm{font-family:'Bebas Neue',sans-serif;line-height:1.0;letter-spacing:0.01em;white-space:nowrap}
  .roster .nm + .nm{border-top:1px solid rgba(245,245,240,0.14)}
  .prompt{margin-top:26px;font-size:27px;letter-spacing:0.04em;color:#f5f5f0}
  .prompt b{color:${YELLOW}}
  .when{font-family:'Bebas Neue',sans-serif;font-size:46px;letter-spacing:0.04em;color:${ORANGE};margin-top:24px}
  .meta{display:flex;align-items:center;gap:16px;margin-top:8px;font-size:22px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(245,245,240,0.72)}
  .meta .h{margin-left:auto;color:#f5f5f0;font-weight:700}
  </style></head><body>
    <div class="field"></div>${mascotImg(BLOCK)}<div class="grade"></div><div class="grain"></div>
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

const csv = readFileSync(rosterPath, 'utf8').split(/\r?\n/)
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

console.log(`Roster: ${rosterFile}${isDemoRoster ? ' (demo — scrubbed names)' : ''} → ${teams.length} team cards → ${outDir}\n`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })

for (let i = 0; i < teams.length; i++) {
  const t = teams[i]
  const variant = isChallenge(i) ? 'challenge' : 'werein'
  const html = variant === 'challenge' ? challenge(EVENT, t.names) : werein(EVENT, t.names)
  const tmp = join(outDir, `_tmp.html`)
  writeFileSync(tmp, html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)

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
  const out = join(outDir, `${name}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  verifyPng(out, { width: 1080, height: 1920 })
  console.log(`✓ ${name}.png  [${variant}]  ${t.status}`)
  rmSync(tmp)
}

await browser.close()
console.log(`\nDone. ${teams.length} team Stories in ${outDir}`)
