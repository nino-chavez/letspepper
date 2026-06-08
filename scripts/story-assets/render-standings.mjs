/**
 * Let's Pepper — RESULTS / STANDINGS / SERIES social assets.
 *
 * Same locked design language as render-highlight-cards.mjs (dark #070707 world,
 * OPM-green pepper screen-blended, Anton/Bebas/JetBrains Mono, green = roster side,
 * yellow = champion gold). Three asset families, all driven by REAL data:
 *
 *   1. Per-team RESULT cards  — each team's true 2026 finish (bracket-derived).
 *   2. FINAL STANDINGS        — 2026 Bell Pepper Open podium + field.
 *   3. SERIES leaderboard     — 2025 + 2026 combined, top players by series points.
 *
 *   node scripts/story-assets/render-standings.mjs            # sample set (ITER-style)
 *   RENDER=all node scripts/story-assets/render-standings.mjs # every team + posts
 *
 * Output: scripts/story-assets/standings/{results,social}/
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const hero = pathToFileURL(join(HERE, 'mascot', 'pep-hero-green.png')).href
const ap = pathToFileURL('/Users/nino/Workspace/dev/apps/flickdaymedia/flickday-assets/outro/aperture-icon-transparent.png').href
const RENDER = process.env.RENDER || 'validate'

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@500;700&display=swap');`
const reset = (w, h) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#070707;
   font-family:'JetBrains Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`
const doc = (w, h, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h)}</style></head><body>${body}</body></html>`
const heroLayer = (w, h, objpos, scrim) => `
  <img class="hero" src="${hero}">
  <div class="scrim"></div>
  <style>
    .hero{position:absolute;inset:0;width:${w}px;height:${h}px;object-fit:cover;object-position:${objpos};mix-blend-mode:screen}
    .scrim{position:absolute;inset:0;background:${scrim}}
  </style>`

/* ─────────────────────────  REAL DATA  ───────────────────────── */
// 2026 Bell Pepper Open (June 7, 2026) — placements read from the playoff bracket.
// reg = registration/team number; seed = post-pool reseed; place = bracket finish.
const TEAMS_2026 = [
  { reg: '13', players: ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek'], place: 1, seed: 1 },
  { reg: '02', players: ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller'], place: 2, seed: 2 },
  { reg: '05', players: ['David Hill', 'Quinn Bozarth', 'Braxton Francis'], place: 3, seed: 12 },
  { reg: '07', players: ['Urvil Patel', 'Evan Hughes', 'Jake Reishus'], place: 3, seed: 6 },
  { reg: '10', players: ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney'], place: 5, seed: 8 },
  { reg: '11', players: ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer'], place: 5, seed: 4 },
  { reg: '01', players: ['Nick Maruyama', 'Braydon Savitski-Lynde', 'Lincoln Geist'], place: 5, seed: 3 },
  { reg: '09', players: ['Everett Haynes', 'Will Mensching', 'Blayr Young'], place: 5, seed: 7 },
  { reg: '08', players: ['Erik Kirschbaum', 'Mike Hallman', 'Joe Glatz'], place: 9, seed: 9 },
  { reg: '04', players: ['Elijah Skutt', 'Owen Randel', 'Ian'], place: 9, seed: 5 },
  { reg: '12', players: ['Sriram Sundareswaram', 'Cedric', 'Shane'], place: 9, seed: 13 },
  { reg: '15', players: ['Pat Paasch', 'Joel Paasch'], place: 9, seed: 11 },
  { reg: '18', players: ['Noah Konopack', 'Josh Bloom', 'Ray Driver'], place: 9, seed: 10 },
  { reg: '16', players: ['Tom Blankenstein', 'Rolando', 'Jack Huizinga'], place: 9, seed: 17 },
  { reg: '03', players: ['Jack Stolzer', 'Will Elias', 'Ty Steponaitus'], place: 9, seed: 19 },
  { reg: '19', players: ['Kyle Swarens', 'Carter Geiger', 'Tony Solis'], place: 9, seed: 15 },
  { reg: '06', players: ['Brad Hornstein', 'Cooper Hansen', 'Mason Kolar'], place: 17, seed: 16 },
  { reg: '17', players: ['Justin Arrowood', 'Ben Boron', 'Bella Thompson'], place: 17, seed: 14 },
  { reg: '14', players: ['David Johnson', 'Tam', 'Kenyon Hayes'], place: 17, seed: 18 },
].map(t => ({ ...t, surnames: t.players.map(p => p.split(' ').slice(-1)[0].toUpperCase()).join(' · '),
  slug: t.players[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '') }))

// All three events, full placements — series points basis.
const SERIES_EVENTS = [
  { id: 'gl-2025', label: 'Grass Launch · May 2025', results: [
    [1, ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller']],
    [2, ['Everett Haynes', 'Will Mensching', 'Grant Veldman']],
    [3, ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer']], [3, ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist']],
    [5, ['Kevin Messer', 'Mark Mir', 'Grant Adler']], [5, ['David Butler', 'Elijah Scott', 'Owen Randle']],
    [5, ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan']], [5, ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman']],
  ] },
  { id: 'bp-2025', label: 'Bell Pepper Open · July 2025', results: [
    [1, ['Charlie Podgorny', 'Nate Meyer', 'Peter Zurawski']],
    [2, ['Nick Maruyama', 'Zach Solomon', 'Lincoln Geist']],
    [3, ['Casey Maas', 'Kyle Zediker', 'Kaden Sauer']], [3, ['David Butler', 'Elijah Scott', 'Owen Randle']],
    [5, ['Kevin Messer', 'Mark Mir', 'Grant Adler']], [5, ['Matt Muelenickel', 'Jeremiah Aro', 'Charlie Clifford']],
    [5, ['Mitchell Carrera', 'Connor Jaral', 'Nolan Krygsheld']], [5, ['Joe Watkins', 'Adrian Cebula', 'Eric Tripp']],
    [9, ['Sam Kharasch', 'Alex Pasek', 'Tyler Donovan']], [9, ['Tom Blankschein', 'Eric McCarthy', 'Mike Hellman']],
    [9, ['Grant Veldman', 'Will Mensching', 'Everett Haynes']], [9, ['Kurt Vandenberg', 'Brett Vandenberg', 'Caleb Vandenberg']],
  ] },
  { id: 'bp-2026', label: 'Bell Pepper Open · June 2026',
    results: TEAMS_2026.map(t => [t.place, t.players]) },
]

const POINTS = { 1: 100, 2: 75, 3: 50, 5: 25, 9: 10, 17: 0 }
// Normalize names so the same human merges across events (hyphen/spacing variants).
const norm = s => s.toLowerCase().replace(/[^a-z]/g, '')

function seriesLeaderboard() {
  const m = new Map()
  for (const ev of SERIES_EVENTS)
    for (const [place, players] of ev.results)
      for (const p of players) {
        const k = norm(p)
        const e = m.get(k) || { name: p, points: 0, events: 0, titles: 0, best: 99 }
        e.points += POINTS[place] ?? 0; e.events++
        if (place === 1) e.titles++
        if (place < e.best) e.best = place
        m.set(k, e)
      }
  return [...m.values()].sort((a, b) =>
    b.points - a.points || a.best - b.best || b.titles - a.titles || b.events - a.events)
}

// Competition ranking — equal (points, best finish) share a rank (T-1 co-leaders, etc.).
function rankedSeries() {
  const board = seriesLeaderboard()
  let rank = 0, pp = null, pb = null
  board.forEach((e, i) => { if (e.points !== pp || e.best !== pb) { rank = i + 1; pp = e.points; pb = e.best } e.rank = rank })
  const c = {}; board.forEach(e => (c[e.rank] = (c[e.rank] || 0) + 1)); board.forEach(e => (e.tied = c[e.rank] > 1))
  return board
}

/* ─────────────────────────  placement tiers  ───────────────────────── */
const GOLD = '#facc15', GREEN = '#4ade80', PALE = '#a7f3c0', NEUT = 'rgba(245,245,240,0.82)'
// No prize money on public assets — some competitors are college players (NCAA
// eligibility). Accolades only, never a purse.
const TIER = {
  1:  { place: '1st Place',  label: 'CHAMPIONS',        accent: GOLD,  glow: 'rgba(250,204,21,0.55)', note: '' },
  2:  { place: '2nd Place',  label: 'RUNNER-UP',        accent: GREEN, glow: 'rgba(74,222,128,0.5)',  note: 'Finalist' },
  3:  { place: 'Tied · 3rd', label: 'SEMIFINALS',       accent: GREEN, glow: 'rgba(74,222,128,0.45)', note: 'Final Four' },
  5:  { place: 'Tied · 5th', label: 'QUARTERFINALS',    accent: GREEN, glow: 'rgba(74,222,128,0.38)', note: 'Elite Eight' },
  9:  { place: 'Tied · 9th', label: 'ROUND OF 16',      accent: PALE,  glow: 'rgba(74,222,128,0.28)', note: '' },
  17: { place: 'Play-In',    label: 'PLAY-IN ROUND',    accent: NEUT,  glow: 'rgba(255,255,255,0.18)', note: '' },
}

/* ─────────────────────────  1. RESULT CARD (reel)  ───────────────────────── */
function resultCard(team, { w = 1080, h = 1920 } = {}) {
  const t = TIER[team.place]
  const champ = team.place === 1
  const objpos = '50% 28%'
  const scrim = `linear-gradient(180deg, rgba(7,7,7,0.34) 0%, rgba(7,7,7,0.30) 26%, rgba(7,7,7,0.74) 46%, #070707 56%)`
  return doc(w, h, `${heroLayer(w, h, objpos, scrim)}<style>
    .badge{position:absolute;right:-46px;top:600px;font-family:'Anton',sans-serif;font-size:430px;line-height:0.8;color:transparent;-webkit-text-stroke:3px ${t.accent}2e;z-index:0}
    .block{position:absolute;left:80px;right:80px;bottom:160px;z-index:1}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(245,245,240,0.52);margin-bottom:18px}
    .finish{font-family:'JetBrains Mono',monospace;font-size:26px;font-weight:700;letter-spacing:0.26em;text-transform:uppercase;color:${t.accent};margin-bottom:12px}
    .label{font-family:'Anton',sans-serif;font-size:${champ ? 132 : 112}px;line-height:0.9;letter-spacing:-0.01em;color:${t.accent};text-shadow:0 0 46px ${t.glow},0 6px 26px rgba(0,0,0,0.85)}
    .rule{width:128px;height:3px;background:${t.accent};box-shadow:0 0 16px ${t.glow};margin:28px 0 32px}
    .roster{}
    .roster .pl{display:flex;align-items:center;gap:24px;font-family:'Bebas Neue',sans-serif;font-size:104px;line-height:1.0;letter-spacing:0.01em;color:#f5f5f0;padding:13px 0;text-shadow:0 6px 30px rgba(0,0,0,0.95);white-space:nowrap}
    .roster .pl + .pl{border-top:1px solid rgba(245,245,240,0.12)}
    .roster .tick{width:14px;height:48px;flex:none;background:${t.accent};box-shadow:0 0 18px ${t.glow}}
    .note{display:inline-block;margin-top:26px;font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#070707;background:${t.accent};padding:12px 22px;border-radius:8px;box-shadow:0 0 30px ${t.glow}}
  </style>
    <div class="badge">${team.place === 1 ? '1' : team.place === 2 ? '2' : team.place === 3 ? '3' : ''}</div>
    <div class="block">
      <div class="eyebrow">Bell Pepper Open 2026 · Final Standings</div>
      <div class="finish">${t.place}</div>
      <div class="label">${t.label}</div>
      <div class="rule"></div>
      <div class="roster">${team.players.map(p => `<div class="pl"><span class="tick"></span>${p}</div>`).join('')}</div>
      ${t.note ? `<div class="note">${t.note}</div>` : ''}
    </div>`)
}

/* ─────────────────────────  2. FINAL STANDINGS (story 1080×1920 / post 1080×1350)  ───────────────────────── */
function standingsStory({ w = 1080, h = 1920 } = {}) {
  const post = h < 1600
  const objpos = '50% 12%'
  const scrim = `linear-gradient(180deg, rgba(7,7,7,0.4) 0%, rgba(7,7,7,0.5) 18%, rgba(7,7,7,0.9) 30%, #070707 38%)`
  const podium = TEAMS_2026.filter(t => t.place <= 3)
  const quarters = TEAMS_2026.filter(t => t.place === 5)
  const row = (t) => {
    const tier = TIER[t.place]
    return `<div class="row" style="--c:${tier.accent};--g:${tier.glow}">
      <div class="pl">${t.place}</div>
      <div class="nm"><div class="lab">${tier.label}</div><div class="ros">${t.surnames}</div></div></div>`
  }
  return doc(w, h, `${heroLayer(w, h, objpos, scrim)}<style>
    .frame{position:absolute;left:80px;right:80px;top:${post ? 104 : 150}px}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.28em;text-transform:uppercase;color:${GREEN};margin-bottom:16px}
    .title{font-family:'Anton',sans-serif;font-size:${post ? 112 : 150}px;line-height:0.86;letter-spacing:-0.01em;color:#f5f5f0}
    .title em{font-style:normal;color:${GOLD};text-shadow:0 0 44px rgba(250,204,21,0.4)}
    .sub{font-family:'JetBrains Mono',monospace;font-size:25px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.6);margin-top:18px}
    .podium{margin-top:${post ? 48 : 70}px;display:flex;flex-direction:column;gap:${post ? 18 : 26}px}
    .row{display:flex;align-items:center;gap:30px}
    .row .pl{font-family:'Anton',sans-serif;font-size:${post ? 96 : 120}px;line-height:0.8;width:${post ? 96 : 120}px;flex:none;text-align:center;color:var(--c);text-shadow:0 0 40px var(--g)}
    .row .nm{border-left:4px solid var(--c);padding-left:28px}
    .row .lab{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--c);margin-bottom:8px}
    .row .ros{font-family:'Bebas Neue',sans-serif;font-size:${post ? 62 : 74}px;line-height:0.92;letter-spacing:0.01em;color:#f5f5f0;white-space:nowrap}
    .qf{margin-top:${post ? 40 : 64}px;border-top:1px solid rgba(245,245,240,0.14);padding-top:34px}
    .qf .h{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${GREEN};margin-bottom:18px}
    .qf .l{font-family:'Bebas Neue',sans-serif;font-size:52px;line-height:1.16;letter-spacing:0.02em;color:rgba(245,245,240,0.86)}
    .foot{position:absolute;left:80px;right:80px;bottom:${post ? 58 : 90}px;display:flex;align-items:center;gap:16px;font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;letter-spacing:0.06em}
    .foot .ap{width:40px;height:40px;filter:drop-shadow(0 0 10px rgba(250,204,21,0.3))}
    .foot .g{color:${GREEN}}.foot .y{color:${GOLD}}.foot .s{color:#555;margin:0 6px}
  </style>
    <div class="frame">
      <div class="eyebrow">Bell Pepper Open 2026 · 19 Teams</div>
      <div class="title">FINAL<br><em>STANDINGS</em></div>
      <div class="sub">June 7, 2026 · Aurora, IL</div>
      <div class="podium">${podium.map(row).join('')}</div>
      ${post ? '' : `<div class="qf"><div class="h">Quarterfinalists · Tied 5th</div><div class="l">${quarters.map(t => t.surnames.split(' · ')[0]).join(' · ')}</div></div>`}
    </div>
    <div class="foot"><img class="ap" src="${ap}"><span class="g">letspepper.com</span><span class="s">/</span><span class="y">standings</span></div>`)
}

/* ─────────────────────────  3. SERIES LEADERBOARD (reel)  ───────────────────────── */
function seriesStory({ w = 1080, h = 1920 } = {}) {
  const post = h < 1600
  const board = rankedSeries().slice(0, post ? 6 : 8)
  const objpos = '50% 12%'
  const scrim = `linear-gradient(180deg, rgba(7,7,7,0.4) 0%, rgba(7,7,7,0.5) 16%, rgba(7,7,7,0.9) 28%, #070707 36%)`
  const max = board[0].points
  const row = (e) => {
    const lead = e.rank === 1
    return `<div class="r${lead ? ' lead' : ''}">
      <div class="rk">${e.tied ? 'T' : ''}${e.rank}</div>
      <div class="who"><div class="n">${e.name}</div>
        <div class="meta">${e.titles ? `${e.titles}× champion · ` : ''}${e.events} event${e.events > 1 ? 's' : ''}</div></div>
      <div class="pts">${e.points}<span>pts</span></div>
      <div class="bar"><i style="width:${Math.round(e.points / max * 100)}%"></i></div>
    </div>`
  }
  return doc(w, h, `${heroLayer(w, h, objpos, scrim)}<style>
    .frame{position:absolute;left:80px;right:80px;top:${post ? 96 : 140}px}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.28em;text-transform:uppercase;color:${GREEN};margin-bottom:16px}
    .title{font-family:'Anton',sans-serif;font-size:${post ? 108 : 142}px;line-height:0.84;letter-spacing:-0.01em;color:#f5f5f0}
    .title em{font-style:normal;color:${GOLD};text-shadow:0 0 44px rgba(250,204,21,0.4)}
    .sub{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.6);margin-top:16px}
    .list{margin-top:${post ? 38 : 60}px;display:flex;flex-direction:column;gap:8px}
    .r{position:relative;display:grid;grid-template-columns:92px 1fr auto;align-items:center;gap:22px;padding:${post ? '14px 4px 18px' : '20px 4px 24px'}}
    .r + .r{border-top:1px solid rgba(245,245,240,0.10)}
    .r .rk{font-family:'Anton',sans-serif;font-size:${post ? 50 : 56}px;line-height:0.8;color:rgba(245,245,240,0.4);text-align:center}
    .r.lead .rk{color:${GOLD};text-shadow:0 0 30px rgba(250,204,21,0.45)}
    .r .who .n{font-family:'Bebas Neue',sans-serif;font-size:${post ? 60 : 68}px;line-height:0.9;letter-spacing:0.01em;color:#f5f5f0}
    .r.lead .who .n{color:${GOLD}}
    .r .who .meta{font-family:'JetBrains Mono',monospace;font-size:21px;letter-spacing:0.04em;color:rgba(245,245,240,0.5);margin-top:6px}
    .r .pts{font-family:'Anton',sans-serif;font-size:${post ? 52 : 58}px;line-height:0.8;color:${GREEN};text-align:right}
    .r .pts span{display:block;font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;letter-spacing:0.1em;color:rgba(245,245,240,0.4);text-align:right;margin-top:4px}
    .r.lead .pts{color:${GOLD}}
    .r .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(245,245,240,0.06)}
    .r .bar i{display:block;height:100%;background:${GREEN};box-shadow:0 0 12px rgba(74,222,128,0.6)}
    .r.lead .bar i{background:${GOLD};box-shadow:0 0 12px rgba(250,204,21,0.6)}
    .foot{position:absolute;left:80px;right:80px;bottom:${post ? 56 : 88}px;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.05em;color:rgba(245,245,240,0.6)}
    .foot b{color:${GREEN}}
  </style>
    <div class="frame">
      <div class="eyebrow">Let's Pepper · Grass Triples</div>
      <div class="title">THE SERIES<br><em>2025 · 2026</em></div>
      <div class="sub">All-Time Leaders · 3 Events</div>
      <div class="list">${board.map(row).join('')}</div>
    </div>
    <div class="foot">Series points: 1st 100 · 2nd 75 · 3rd 50 · 5th 25 · 9th 10 — <b>letspepper.com/standings</b></div>`)
}

/* ─────────────────────────  queue + render  ───────────────────────── */
const jobs = []
const add = (dir, name, w, h, html) => jobs.push({ path: join('standings', dir, name), w, h, html })

if (process.env.ITER) {
  add('social', `final-standings-post`, 1080, 1350, standingsStory({ w: 1080, h: 1350 }))
  add('social', `series-post`, 1080, 1350, seriesStory({ w: 1080, h: 1350 }))
} else {
  for (const t of TEAMS_2026)
    add('results', `team-${t.reg}-${t.slug}-result`, 1080, 1920, resultCard(t))
  add('social', `final-standings-story`, 1080, 1920, standingsStory())
  add('social', `final-standings-post`, 1080, 1350, standingsStory({ w: 1080, h: 1350 }))
  add('social', `series-story`, 1080, 1920, seriesStory())
  add('social', `series-post`, 1080, 1350, seriesStory({ w: 1080, h: 1350 }))
}

mkdirSync(join(HERE, 'standings', 'results'), { recursive: true })
mkdirSync(join(HERE, 'standings', 'social'), { recursive: true })

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} standings assets (${RENDER})...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  const tmp = join(HERE, `_tmp-std.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // auto-fit any nowrap roster/name lines to their container
  await page.evaluate(() => {
    const fit = (els, min) => {
      if (!els.length) return
      const avail = els[0].parentElement.clientWidth
      let fs = parseInt(getComputedStyle(els[0]).fontSize)
      const wide = () => els.some(e => e.scrollWidth > avail)
      while (wide() && fs > min) { fs -= 3; els.forEach(e => (e.style.fontSize = fs + 'px')) }
    }
    fit([...document.querySelectorAll('.roster .pl')], 40)
    fit([...document.querySelectorAll('.podium .ros')], 34)
  })
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(HERE, `${job.path}.png`), clip: { x: 0, y: 0, width: job.w, height: job.h } })
  console.log(`✓ ${job.path}.png`)
  await page.close(); rmSync(tmp)
}
await browser.close()
console.log(`\nDone → scripts/story-assets/standings/  (RENDER=all for every team)`)
