/**
 * Jalapeño Open 2026 — RESULTS / STANDINGS / SERIES social assets.
 *
 * Ported from render-standings.mjs (Bell Pepper Open), same three asset
 * families and file naming, retargeted to the Jalapeño Open's orange
 * (#f97316) heat color and roster data. Same heroLayer adaptation as
 * render-jalapeno-highlights.mjs — the JPO mascot is a cropped character
 * cutout, not full-bleed background art, so it's positioned/sized rather
 * than object-fit:cover'd.
 *
 *   1. Per-team RESULT cards  — each team's Jalapeño Open finish (bracket-derived).
 *   2. FINAL STANDINGS        — Jalapeño Open podium + field.
 *   3. SERIES leaderboard     — season-to-date, top players by series points
 *      (extends the same Grass Launch / Bell Pepper Open series with a JPO slot).
 *
 * PLACEHOLDER DATA: jalapeno-open-2026.mjs ships with placeholder TEAMS (the
 * event runs July 18, 2026). STAT_BOARDS below is ALSO placeholder — those are
 * hand-authored post-match storylines (giant-killers, cinderella runs, etc.)
 * that can only be written after the bracket actually happens. Replace both
 * with real data once the event is over; everything else regenerates as-is.
 *
 *   node scripts/story-assets/render-jalapeno-standings.mjs            # sample set
 *   RENDER=all node scripts/story-assets/render-jalapeno-standings.mjs # every team + posts
 *
 * Output: scripts/story-assets/jalapeno-standings/{results,social}/
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { EVENT, TEAMS, TIER, GOLD, ORANGE, ordinal, byFinish } from './jalapeno-open-2026.mjs'
import { TEAMS as TEAMS_BPO_2026 } from './bell-pepper-2026.mjs'
import { requiredAsset, localFonts, assertPageReady, verifyPng } from './preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// Durable source art (keyed from public/images/mascots/jalapeno-action.png) —
// required: a missing mascot fails the run instead of exporting without it.
const hero = requiredAsset(join(HERE, 'jpo-mascot', 'jalapeno-cutout.png'))
const RENDER = process.env.RENDER || 'validate'

const FAMILIES = ['Bebas Neue', 'Anton', 'JetBrains Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const reset = (w, h) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:#070707;
   font-family:'JetBrains Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`
const doc = (w, h, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h)}</style></head><body>${body}</body></html>`
const heroLayer = ({ mascotWidth, mascotRight, mascotTop, glowX = '62%', glowY = '38%' } = {}) => `
  <div class="field"></div>
  <div class="grain"></div>
  ${mascotWidth ? `<img class="hero" src="${hero}">` : ''}
  <style>
    .field{position:absolute;inset:0;background:
      radial-gradient(55% 45% at ${glowX} ${glowY}, rgba(249,115,22,0.24), transparent 62%),
      radial-gradient(80% 60% at ${glowX} ${glowY}, rgba(250,204,21,0.07), transparent 70%), #070707}
    .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.08;mix-blend-mode:overlay;pointer-events:none}
    .hero{position:absolute;top:${mascotTop};right:${mascotRight};width:${mascotWidth};filter:drop-shadow(0 20px 50px rgba(0,0,0,0.6))}
  </style>`

/* ─────────────────────────  SEASON SERIES DATA  ─────────────────────────
   Real 2025 history (Grass Launch, Bell Pepper Open) stays as-authored — it
   already happened. Bell Pepper Open 2026 pulls live from its own canonical
   module. Jalapeño Open 2026 pulls live from jalapeno-open-2026.mjs — swap
   that module's TEAMS placeholder for the real bracket after July 18 and this
   slot (and every card below) updates with zero code changes here. */
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
  { id: 'bp-2026', label: 'Bell Pepper Open · June 2026', results: TEAMS_BPO_2026.map(t => [t.place, t.players]) },
  { id: 'jo-2026', label: `Jalapeño Open · ${EVENT.date}`, results: TEAMS.map(t => [t.place, t.players]) },
]

const POINTS = { 1: 100, 2: 75, 3: 50, 4: 35, 5: 25, 7: 15, 9: 10 }
const PARTICIPATION = 5 // every team that plays scores — see standings-data.ts
const norm = s => s.toLowerCase().replace(/[^a-z]/g, '')

function seriesLeaderboard() {
  const m = new Map()
  for (const ev of SERIES_EVENTS)
    for (const [place, players] of ev.results)
      for (const p of players) {
        const k = norm(p)
        const e = m.get(k) || { name: p, points: 0, events: 0, titles: 0, best: 99 }
        e.points += POINTS[place] ?? PARTICIPATION; e.events++
        if (place === 1) e.titles++
        if (place < e.best) e.best = place
        m.set(k, e)
      }
  return [...m.values()].sort((a, b) =>
    b.points - a.points || a.best - b.best || b.titles - a.titles || b.events - a.events)
}

function rankedSeries() {
  const board = seriesLeaderboard()
  let rank = 0, pp = null, pb = null
  board.forEach((e, i) => { if (e.points !== pp || e.best !== pb) { rank = i + 1; pp = e.points; pb = e.best } e.rank = rank })
  const c = {}; board.forEach(e => (c[e.rank] = (c[e.rank] || 0) + 1)); board.forEach(e => (e.tied = c[e.rank] > 1))
  return board
}

/* ─────────────────────────  1. RESULT CARD (reel)  ───────────────────────── */
function resultCard(team, { w = 1080, h = 1920 } = {}) {
  const t = TIER[team.place]
  const champ = team.place === 1
  return doc(w, h, `${heroLayer({ mascotWidth: '640px', mascotRight: '-160px', mascotTop: '900px', glowX: '80%', glowY: '68%' })}<style>
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
    <div class="badge">${team.place <= 4 ? team.place : ''}</div>
    <div class="block">
      <div class="eyebrow">Jalapeño Open ${EVENT.year} · Final Standings</div>
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
  const podium = TEAMS.filter(t => t.place <= 3).sort(byFinish)
  // Everything past the podium, grouped by place (double-elim spread: 4, T-5, T-7, T-9).
  const field = [...TEAMS].filter(t => t.place > 3).sort(byFinish).reduce((groups, t) => {
    const g = groups.find(g => g.place === t.place)
    if (g) g.teams.push(t); else groups.push({ place: t.place, teams: [t] })
    return groups
  }, [])
  const row = (t) => {
    const tier = TIER[t.place]
    return `<div class="row" style="--c:${tier.accent};--g:${tier.glow}">
      <div class="pl">${t.place}</div>
      <div class="nm"><div class="lab">${tier.label}</div><div class="ros">${t.surnames}</div></div></div>`
  }
  return doc(w, h, `${heroLayer({ mascotWidth: post ? '480px' : '560px', mascotRight: '-100px', mascotTop: '-40px', glowX: '84%', glowY: '10%' })}<style>
    .frame{position:absolute;left:80px;right:80px;top:${post ? 104 : 150}px}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.28em;text-transform:uppercase;color:${ORANGE};margin-bottom:16px}
    .title{font-family:'Anton',sans-serif;font-size:${post ? 112 : 150}px;line-height:0.86;letter-spacing:-0.01em;color:#f5f5f0}
    .title em{font-style:normal;color:${GOLD};text-shadow:0 0 44px rgba(250,204,21,0.4)}
    .sub{font-family:'JetBrains Mono',monospace;font-size:25px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.6);margin-top:18px}
    .podium{margin-top:${post ? 48 : 70}px;display:flex;flex-direction:column;gap:${post ? 18 : 26}px}
    .row{display:flex;align-items:center;gap:30px}
    .row .pl{font-family:'Anton',sans-serif;font-size:${post ? 96 : 120}px;line-height:0.8;width:${post ? 96 : 120}px;flex:none;text-align:center;color:var(--c);text-shadow:0 0 40px var(--g)}
    .row .nm{border-left:4px solid var(--c);padding-left:28px}
    .row .lab{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--c);margin-bottom:8px}
    .row .ros{font-family:'Bebas Neue',sans-serif;font-size:${post ? 62 : 74}px;line-height:0.92;letter-spacing:0.01em;color:#f5f5f0;white-space:nowrap}
    .spread{margin-top:${post ? 40 : 60}px;border-top:1px solid rgba(245,245,240,0.14);padding-top:28px;display:flex;flex-direction:column;gap:20px}
    .spread .grp .h{font-family:'JetBrains Mono',monospace;font-size:19px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:${ORANGE};margin-bottom:8px}
    .spread .grp .l{font-family:'Bebas Neue',sans-serif;font-size:38px;line-height:1.1;letter-spacing:0.02em;color:rgba(245,245,240,0.86)}
    .foot{position:absolute;left:80px;right:80px;bottom:${post ? 58 : 90}px;display:flex;align-items:center;gap:16px;font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:700;letter-spacing:0.06em}
    .foot .g{color:${ORANGE}}.foot .y{color:${GOLD}}.foot .s{color:#555;margin:0 6px}
  </style>
    <div class="frame">
      <div class="eyebrow">Jalapeño Open ${EVENT.year} · ${TEAMS.length} Teams</div>
      <div class="title">FINAL<br><em>STANDINGS</em></div>
      <div class="sub">${EVENT.date} &middot; ${EVENT.loc}</div>
      <div class="podium">${podium.map(row).join('')}</div>
      ${post || !field.length ? '' : `<div class="spread">${field.map(g =>
        `<div class="grp"><div class="h">${TIER[g.place].place}</div><div class="l">${g.teams.map(t => t.surnames.split(' · ')[0]).join(' · ')}</div></div>`
      ).join('')}</div>`}
    </div>
    <div class="foot"><span class="g">letspepper.com</span><span class="s">/</span><span class="y">standings</span></div>`)
}

/* ─────────────────────────  3. SERIES LEADERBOARD (reel)  ───────────────────────── */
function seriesStory({ w = 1080, h = 1920 } = {}) {
  const post = h < 1600
  const board = rankedSeries().slice(0, post ? 6 : 8)
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
  return doc(w, h, `${heroLayer({ mascotWidth: post ? '440px' : '520px', mascotRight: '-90px', mascotTop: '-30px', glowX: '84%', glowY: '10%' })}<style>
    .frame{position:absolute;left:80px;right:80px;top:${post ? 96 : 140}px}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.28em;text-transform:uppercase;color:${ORANGE};margin-bottom:16px}
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
    .r .pts{font-family:'Anton',sans-serif;font-size:${post ? 52 : 58}px;line-height:0.8;color:${ORANGE};text-align:right}
    .r .pts span{display:block;font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;letter-spacing:0.1em;color:rgba(245,245,240,0.4);text-align:right;margin-top:4px}
    .r.lead .pts{color:${GOLD}}
    .r .bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(245,245,240,0.06)}
    .r .bar i{display:block;height:100%;background:${ORANGE};box-shadow:0 0 12px rgba(249,115,22,0.6)}
    .r.lead .bar i{background:${GOLD};box-shadow:0 0 12px rgba(250,204,21,0.6)}
    .foot{position:absolute;left:80px;right:80px;bottom:${post ? 56 : 88}px;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.05em;color:rgba(245,245,240,0.6)}
    .foot b{color:${ORANGE}}
  </style>
    <div class="frame">
      <div class="eyebrow">Let's Pepper · Grass Triples</div>
      <div class="title">THE SERIES<br><em>2025 · 2026</em></div>
      <div class="sub">All-Time Leaders · ${SERIES_EVENTS.length} Events</div>
      <div class="list">${board.map(row).join('')}</div>
    </div>
    <div class="foot">Series points: 1st 100 · 2nd 75 · 3rd 50 · 4th 35 · 5th 25 · 7th 15 · 9th 10 · play-in 5 — <b>letspepper.com/standings</b></div>`)
}

/* ─────────────────────────  STAT LEADERS (story 1080×1920 / post 1080×1350)  ─────────────────────────
   PLACEHOLDER — these are hand-authored post-match storylines (upsets, dominant
   pool play, clutch sets). Write the real ones after the bracket happens; the
   structure/layout below is what to keep. */
const STAT_BOARDS = [
  { title: 'Giant Killers', blurb: 'Bracket wins over a higher seed', entries: [
    { team: 'TBD', value: '–', detail: 'fill in after the bracket' },
    { team: 'TBD', value: '–', detail: '' },
    { team: 'TBD', value: '–', detail: '' },
  ] },
  { title: 'Cinderella', blurb: 'Finished furthest above their seed', entries: [
    { team: 'TBD', value: '–', detail: 'fill in after the bracket' },
    { team: 'TBD', value: '–', detail: '' },
    { team: 'TBD', value: '–', detail: '' },
  ] },
  { title: 'Dominance', blurb: 'Best pool set differential', entries: [
    { team: 'TBD', value: '–', detail: 'fill in after the bracket' },
    { team: 'TBD', value: '–', detail: '' },
    { team: 'TBD', value: '–', detail: '' },
  ] },
  { title: 'Clutch', blurb: 'Deuce (22+) sets won', entries: [
    { team: 'TBD', value: '–', detail: 'fill in after the bracket' },
    { team: 'TBD', value: '–', detail: '' },
    { team: 'TBD', value: '–', detail: '' },
  ] },
]

function statLeadersCard({ w = 1080, h = 1920 } = {}) {
  const post = h < 1600
  const boardEl = (b) => `
    <div class="board">
      <div class="bt">${b.title}</div>
      <div class="bb">${b.blurb}</div>
      ${b.entries.map((e, i) => `
        <div class="row${i === 0 ? ' lead' : ''}">
          <div class="top"><span class="rk">${i + 1}</span><span class="tm">${e.team}</span><span class="vl">${e.value}</span></div>
          ${e.detail ? `<div class="dt">${e.detail}</div>` : ''}
        </div>`).join('')}
    </div>`
  return doc(w, h, `${heroLayer({ mascotWidth: post ? '420px' : '500px', mascotRight: '-100px', mascotTop: '-20px', glowX: '84%', glowY: '8%' })}<style>
    .frame{position:absolute;left:70px;right:70px;top:${post ? 90 : 150}px}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.28em;text-transform:uppercase;color:${ORANGE};margin-bottom:14px}
    .title{font-family:'Anton',sans-serif;font-size:${post ? 104 : 140}px;line-height:0.86;letter-spacing:-0.01em;color:#f5f5f0}
    .title em{font-style:normal;color:${GOLD};text-shadow:0 0 44px rgba(250,204,21,0.4)}
    .sub{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.6);margin-top:14px}
    .grid{margin-top:${post ? 40 : 64}px;display:grid;grid-template-columns:1fr 1fr;gap:${post ? '30px 36px' : '46px 48px'}}
    .bt{font-family:'Anton',sans-serif;font-size:${post ? 42 : 52}px;line-height:1;letter-spacing:-0.01em;color:${ORANGE};text-shadow:0 0 24px rgba(249,115,22,0.3)}
    .bb{font-family:'JetBrains Mono',monospace;font-size:17px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(245,245,240,0.42);margin:8px 0 16px}
    .row{padding:9px 0}
    .row + .row{border-top:1px solid rgba(245,245,240,0.1)}
    .top{display:flex;align-items:baseline;gap:14px}
    .rk{font-family:'Anton',sans-serif;font-size:26px;line-height:1;color:rgba(245,245,240,0.4);width:24px;flex:none;text-align:center}
    .row.lead .rk{color:${GOLD}}
    .tm{flex:1;min-width:0;font-family:'Bebas Neue',sans-serif;font-size:${post ? 44 : 50}px;line-height:0.9;letter-spacing:0.01em;color:#f5f5f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .row.lead .tm{color:${GOLD}}
    .vl{flex:none;font-family:'Anton',sans-serif;font-size:${post ? 34 : 40}px;line-height:1;color:${ORANGE}}
    .row.lead .vl{color:${GOLD}}
    .dt{font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:0.02em;color:rgba(245,245,240,0.5);margin:3px 0 0 38px}
    .foot{position:absolute;left:70px;right:70px;bottom:${post ? 54 : 90}px;display:flex;align-items:center;gap:16px;font-family:'JetBrains Mono',monospace;font-size:23px;font-weight:700;letter-spacing:0.06em}
    .foot .g{color:${ORANGE}}.foot .s{color:#555;margin:0 6px}.foot .y{color:${GOLD}}
  </style>
    <div class="frame">
      <div class="eyebrow">Beyond the Bracket</div>
      <div class="title">STAT <em>LEADERS</em></div>
      <div class="sub">Jalapeño Open ${EVENT.year} · By the Numbers</div>
      <div class="grid">${STAT_BOARDS.map(boardEl).join('')}</div>
    </div>
    <div class="foot"><span class="g">letspepper.com</span><span class="s">/</span><span class="y">standings</span></div>`)
}

/* ─────────────────────────  queue + render  ───────────────────────── */
const jobs = []
const add = (dir, name, w, h, html) => jobs.push({ path: join('2026-jpo', 'jalapeno-standings', dir, name), w, h, html })

if (process.env.ITER) {
  add('social', `stat-leaders-story`, 1080, 1920, statLeadersCard())
  add('social', `stat-leaders-post`, 1080, 1350, statLeadersCard({ w: 1080, h: 1350 }))
} else {
  [...TEAMS].sort(byFinish)
    .forEach((t, i) => add('results',
      `${String(i + 1).padStart(2, '0')}-${ordinal(t.place)}-${t.slug}-result`, 1080, 1920, resultCard(t)))
  add('social', `final-standings-story`, 1080, 1920, standingsStory())
  add('social', `final-standings-post`, 1080, 1350, standingsStory({ w: 1080, h: 1350 }))
  add('social', `series-story`, 1080, 1920, seriesStory())
  add('social', `series-post`, 1080, 1350, seriesStory({ w: 1080, h: 1350 }))
  add('social', `stat-leaders-story`, 1080, 1920, statLeadersCard())
  add('social', `stat-leaders-post`, 1080, 1350, statLeadersCard({ w: 1080, h: 1350 }))
}

mkdirSync(join(HERE, '2026-jpo', 'jalapeno-standings', 'results'), { recursive: true })
mkdirSync(join(HERE, '2026-jpo', 'jalapeno-standings', 'social'), { recursive: true })

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} standings assets (${RENDER})...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  const tmp = join(HERE, `_tmp-jstd.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)
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
  const out = join(HERE, `${job.path}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: job.w, height: job.h } })
  verifyPng(out, { width: job.w, height: job.h })
  console.log(`✓ ${job.path}.png`)
  await page.close(); rmSync(tmp)
}
await browser.close()
console.log(`\nDone → scripts/story-assets/2026-jpo/jalapeno-standings/  (RENDER=all for every team)`)
