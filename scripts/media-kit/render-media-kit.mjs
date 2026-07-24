#!/usr/bin/env node
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertPageReady, localFonts, verifyPng } from '../story-assets/preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const OUT = join(ROOT, 'creative', 'exports', 'media-kit-v1')
const TMP = join(OUT, '.render-tmp')
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'creative', 'config', 'media-kit.json'), 'utf8'))
const COPY = JSON.parse(readFileSync(join(ROOT, 'creative', 'copy', 'approved-copy.json'), 'utf8'))

mkdirSync(TMP, { recursive: true })

const P = CONFIG.palette
const B = CONFIG.brand
const E = CONFIG.event
const FAMILIES = ['Bebas Neue', 'Anton', 'Archivo Black', 'Space Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.82' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.7'/%3E%3C/svg%3E")`
const manifest = []

function items(section) {
  const rows = COPY[section]
  if (!Array.isArray(rows)) throw new Error(`copy section not found: ${section}`)
  for (const row of rows) {
    if (row.status !== 'approved') throw new Error(`copy not approved: ${section}.${row.id}`)
  }
  return rows
}

function byId(section, id) {
  const row = items(section).find((entry) => entry.id === id)
  if (!row) throw new Error(`copy id not found: ${section}.${id}`)
  return row
}

function e(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function asset(relativePath) {
  const path = join(ROOT, relativePath)
  if (!existsSync(path)) throw new Error(`missing asset: ${path}`)
  return pathToFileURL(path).href
}

const fallback = {
  habanero: 'public/images/mascots/anime/ghost-pepper/jump-serve.png',
  reaper: 'public/images/mascots/anime/ghost-pepper/champion.png',
  'pepper-x': 'public/images/mascots/anime/poblano/menace-walk.png',
  chipotle: 'public/images/mascots/anime/jalapeno/champion.png',
  'pepper-belle': 'public/images/mascots/anime/bell-pepper/champion.png',
  pepperoncini: 'public/images/mascots/anime/jalapeno/menace-walk.png',
  'banana-pepper': 'public/images/mascots/anime/jalapeno/celebration.png',
  shishito: 'public/images/mascots/anime/poblano/celebration.png',
}

function mascot(id, pose) {
  const direct = pose
    ? `public/images/mascots/anime/${id}/${pose}.png`
    : CONFIG.mascots[id]
  if (direct && existsSync(join(ROOT, direct))) return asset(direct)
  if (fallback[id]) return asset(fallback[id])
  throw new Error(`no mascot or fallback for ${id}`)
}

function chrome({ width, height, transparent = false, extra = '' }) {
  return `${FONTS}
    :root{--ink:${P.ink};--paper:${P.paper};--orange:${P.orange};--yellow:${P.yellow};--green:${P.green};--poblano:${P.poblano};--cyan:${P.cyan};--red:${P.red}}
    *{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${transparent ? 'transparent' : P.ink};color:var(--paper)}
    body{position:relative;font-family:'Space Mono',monospace;-webkit-font-smoothing:antialiased}
    .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:300px;opacity:.085;mix-blend-mode:overlay;pointer-events:none}
    .brand{display:flex;align-items:center;gap:13px;font-size:20px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
    .peppermark{width:36px;height:50px;border:5px solid currentColor;border-radius:48% 48% 60% 60%;transform:rotate(-8deg);position:relative;display:inline-block}
    .peppermark:before{content:'';position:absolute;width:20px;height:12px;border-top:5px solid currentColor;border-radius:50%;left:12px;top:-15px;transform:rotate(-24deg)}
    .mono{font-family:'Space Mono',monospace;text-transform:uppercase;letter-spacing:.15em}
    .display{font-family:'Anton',sans-serif;text-transform:uppercase}
    ${extra}`
}

function doc({ width, height, body, css = '', transparent = false }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${chrome({ width, height, transparent, extra: css })}</style></head><body>${body}</body></html>`
}

const browser = await chromium.launch()

async function capture({ category, name, width, height, body, css = '', transparent = false, note = '' }) {
  const dir = join(OUT, category)
  mkdirSync(dir, { recursive: true })
  const out = join(dir, `${name}.png`)
  const tmp = join(TMP, `${category.replaceAll('/', '-')}-${name}.html`)
  writeFileSync(tmp, doc({ width, height, body, css, transparent }))
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height }, omitBackground: transparent })
  await page.close()
  verifyPng(out, { width, height, alpha: transparent })
  manifest.push({ path: out.slice(ROOT.length + 1), category, name, width, height, alpha: transparent, note })
  console.log(`✓ ${category}/${name}.png`)
}

function identity(color = 'var(--orange)') {
  return `<div class="brand" style="color:${color}"><i class="peppermark"></i><span>${e(B.name)}</span></div>`
}

// ── Editing guide ─────────────────────────────────────────────────────────────
await capture({
  category: 'capcut/guides', name: 'reel-safe-zones', width: 1080, height: 1920, transparent: true,
  note: 'Temporary CapCut guide; remove before export.',
  css: `.edge{position:absolute;border:3px solid rgba(34,211,238,.82);background:rgba(34,211,238,.12);color:#fff;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:23px;padding:18px}
    .unsafe-top{left:0;right:0;top:0;height:250px}.unsafe-right{right:0;top:250px;bottom:330px;width:180px}.unsafe-bottom{left:0;right:0;bottom:0;height:330px}
    .headline{position:absolute;left:70px;right:230px;top:275px;height:290px;border:4px dashed rgba(250,204,21,.9);color:#fff;padding:22px;font-size:25px;letter-spacing:.12em;text-transform:uppercase;background:rgba(250,204,21,.08)}
    .play{position:absolute;left:180px;right:180px;top:580px;height:820px;border:5px solid rgba(239,68,68,.88);background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;text-align:center;font-size:32px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
    .bugzone{position:absolute;left:60px;top:590px;width:280px;height:130px;border:3px dashed rgba(74,222,128,.9);padding:14px;font-size:19px;text-transform:uppercase;letter-spacing:.12em}
    .caption{position:absolute;left:70px;bottom:350px;font-size:21px;letter-spacing:.1em;color:#fff;text-transform:uppercase}`, 
  body: `<div class="edge unsafe-top">Platform / profile UI</div><div class="edge unsafe-right">Right-side controls</div><div class="edge unsafe-bottom">Caption + navigation UI</div><div class="headline">Open-sky headline zone</div><div class="play">Keep the ball, net,<br>hands, and faces clear</div><div class="bugzone">Preferred bug zone<br>when play allows</div><div class="caption">1080 × 1920 · Remove this guide before export</div>`,
})

// ── Bugs / watermarks ─────────────────────────────────────────────────────────
const bugs = [
  { id: 'brand-light', mode: 'brand', fg: P.paper, bg: 'rgba(7,7,7,.78)', line: P.orange },
  { id: 'brand-dark', mode: 'brand', fg: P.ink, bg: 'rgba(244,241,232,.9)', line: P.orange },
  { id: 'event-light', mode: 'event', fg: P.paper, bg: 'rgba(7,7,7,.82)', line: P.poblano },
  { id: 'event-dark', mode: 'event', fg: P.ink, bg: 'rgba(244,241,232,.92)', line: P.poblano },
  { id: 'credit-light', mode: 'credit', fg: P.paper, bg: 'rgba(7,7,7,.76)', line: P.cyan },
  { id: 'credit-dark', mode: 'credit', fg: P.ink, bg: 'rgba(244,241,232,.9)', line: P.cyan },
  { id: 'mark-white', mode: 'mark', fg: P.paper, bg: 'rgba(7,7,7,.5)', line: P.paper },
  { id: 'mark-orange', mode: 'mark', fg: P.orange, bg: 'rgba(7,7,7,.5)', line: P.orange },
]

for (const bug of bugs) {
  const content = bug.mode === 'event'
    ? `<div class="eventname">${e(E.name)}</div><div class="sub">${e(E.dateShort)} · ${e(B.handle)}</div>`
    : bug.mode === 'credit'
      ? `<div class="credit">${e(B.credit)}</div><div class="sub">${e(B.handle)}</div>`
      : bug.mode === 'mark'
        ? `<i class="peppermark"></i>`
        : `<div class="eventname">${e(B.name)}</div><div class="sub">${e(B.handle)}</div>`
  await capture({
    category: 'capcut/bugs', name: bug.id, width: 800, height: 220, transparent: true,
    note: bug.mode === 'credit' ? 'Use only when Flickday supplied the footage.' : 'Persistent corner mark.',
    css: `.wrap{position:absolute;left:24px;top:24px;display:flex;align-items:center;gap:22px;min-height:150px;max-width:740px;padding:24px 34px;border-left:10px solid ${bug.line};border-radius:12px;background:${bug.bg};color:${bug.fg};box-shadow:0 14px 30px rgba(0,0,0,.25)}
      .eventname,.credit{font-family:'Bebas Neue',sans-serif;font-size:${bug.mode === 'credit' ? 45 : 58}px;line-height:.92;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}.sub{margin-top:9px;font-size:17px;letter-spacing:.12em;text-transform:uppercase;white-space:nowrap}.wrap>.peppermark{width:60px;height:82px;border-width:8px;margin:6px 18px 0 12px}`,
    body: `<div class="wrap">${content}</div>`,
  })
}

// ── Moment stamps ─────────────────────────────────────────────────────────────
for (let i = 0; i < items('moments').length; i++) {
  const moment = items('moments')[i]
  const accent = [P.orange, P.yellow, P.green, P.cyan][i % 4]
  await capture({
    category: 'capcut/moments', name: moment.id, width: 1000, height: 280, transparent: true,
    note: `${moment.label} editorial stamp.`,
    css: `.stamp{position:absolute;left:20px;top:26px;height:218px;min-width:720px;max-width:950px;display:flex;align-items:stretch;filter:drop-shadow(0 16px 24px rgba(0,0,0,.4));transform:skewX(-5deg)}
      .slash{width:26px;background:${accent};box-shadow:0 0 28px ${accent}}.copy{background:rgba(7,7,7,.9);border:3px solid rgba(244,241,232,.2);padding:28px 42px 24px 36px;display:flex;flex-direction:column;justify-content:center}.label{font-family:'Anton',sans-serif;font-size:92px;line-height:.86;letter-spacing:.01em;color:${P.paper};text-transform:uppercase;white-space:nowrap}.detail{font-size:19px;letter-spacing:.11em;text-transform:uppercase;margin-top:18px;color:${accent};font-weight:700}.index{align-self:flex-end;background:${accent};color:${P.ink};font-weight:700;padding:10px 13px;font-size:16px;letter-spacing:.08em}`,
    body: `<div class="stamp"><div class="slash"></div><div class="copy"><div class="label">${e(moment.label)}</div><div class="detail">${e(moment.detail)}</div></div><div class="index">LP·${String(i + 1).padStart(2, '0')}</div></div>`,
  })
}

// ── Lower thirds / score system ───────────────────────────────────────────────
const lowerThirds = [
  { id: 'player', kicker: byId('systemLabels', 'player').label, main: byId('templateText', 'player-name').label, sub: byId('templateText', 'team-name').label },
  { id: 'team', kicker: byId('systemLabels', 'team').label, main: byId('templateText', 'team-name').label, sub: `${byId('templateText', 'pool-play').label} · ${byId('templateText', 'court-two').label}` },
  { id: 'match', kicker: byId('systemLabels', 'match').label, main: `${byId('templateText', 'team-a').label} vs ${byId('templateText', 'team-b').label}`, sub: `${byId('templateText', 'pool-play').label} · ${byId('templateText', 'court-two').label}` },
  { id: 'round', kicker: byId('systemLabels', 'round').label, main: byId('templateText', 'quarterfinal').label, sub: `${E.name} · ${byId('templateText', 'court-two').label}` },
  { id: 'credit', kicker: byId('systemLabels', 'credit').label, main: B.credit, sub: B.handle },
  { id: 'score-light', kicker: `${byId('systemLabels', 'score').label} · ${byId('templateText', 'set-one').label}`, main: `${byId('templateText', 'team-a').label}  18`, sub: `${byId('templateText', 'team-b').label}  16`, score: true, light: true },
  { id: 'score-dark', kicker: `${byId('systemLabels', 'score').label} · ${byId('templateText', 'set-one').label}`, main: `${byId('templateText', 'team-a').label}  18`, sub: `${byId('templateText', 'team-b').label}  16`, score: true },
]

for (const lt of lowerThirds) {
  await capture({
    category: 'capcut/lower-thirds', name: lt.id, width: 1000, height: 300, transparent: true,
    note: `Template data only — ${byId('templateText', 'replace').label.toLowerCase()}.`,
    css: `.lt{position:absolute;left:24px;bottom:24px;min-width:${lt.score ? 580 : 690}px;max-width:940px;color:${lt.light ? P.ink : P.paper};background:${lt.light ? 'rgba(244,241,232,.94)' : 'rgba(7,7,7,.9)'};border:3px solid ${lt.light ? 'rgba(7,7,7,.18)' : 'rgba(244,241,232,.2)'};box-shadow:0 16px 38px rgba(0,0,0,.38)}
      .bar{height:13px;background:linear-gradient(90deg,${P.orange},${P.yellow})}.pad{padding:20px 30px 22px}.kick{font-size:17px;letter-spacing:.2em;text-transform:uppercase;color:${lt.light ? '#6b330b' : P.orange};font-weight:700}.main,.sub{font-family:'Bebas Neue',sans-serif;text-transform:uppercase;letter-spacing:.04em}.main{font-size:${lt.score ? 60 : 66}px;line-height:.95;margin-top:9px}.sub{font-size:${lt.score ? 48 : 27}px;color:${lt.light ? '#3f3f46' : '#c9c5bb'};margin-top:7px}.flag{position:absolute;right:0;top:13px;bottom:0;width:18px;background:${P.poblano}}`,
    body: `<div class="lt"><div class="bar"></div><div class="pad"><div class="kick">${e(lt.kicker)}</div><div class="main">${e(lt.main)}</div><div class="sub">${e(lt.sub)}</div></div><div class="flag"></div></div>`,
  })
}

// ── Trackers ───────────────────────────────────────────────────────────────────
const trackers = [
  { id: 'ring', html: '<div class="ring"></div>' },
  { id: 'reticle', html: '<div class="reticle"><i></i><b></b></div>' },
  { id: 'arrow', html: '<div class="arrow"></div>' },
  { id: 'landing-marker', html: '<div class="landing"><i></i></div>' },
  { id: 'spotlight', html: '<div class="spot"></div>' },
]
for (const tracker of trackers) {
  await capture({
    category: 'capcut/trackers', name: tracker.id, width: 512, height: 512, transparent: true,
    note: 'Use briefly and keyframe manually; this is not automated tracking.',
    css: `.ring{position:absolute;inset:104px;border:18px solid ${P.yellow};border-radius:50%;box-shadow:0 0 22px rgba(250,204,21,.85),inset 0 0 18px rgba(250,204,21,.5)}
      .reticle{position:absolute;inset:104px;border:12px solid ${P.cyan};border-radius:50%;box-shadow:0 0 18px rgba(34,211,238,.75)}.reticle:before,.reticle:after{content:'';position:absolute;background:${P.cyan}}.reticle:before{width:380px;height:10px;left:-38px;top:138px}.reticle:after{height:380px;width:10px;left:138px;top:-38px}.reticle i{position:absolute;inset:80px;border:7px solid ${P.cyan};border-radius:50%;background:transparent;z-index:2}
      .arrow{position:absolute;left:90px;top:224px;width:270px;height:38px;background:${P.orange};filter:drop-shadow(0 0 18px rgba(249,115,22,.8));transform:rotate(-22deg)}.arrow:after{content:'';position:absolute;right:-70px;top:-42px;border-left:82px solid ${P.orange};border-top:62px solid transparent;border-bottom:62px solid transparent}
      .landing{position:absolute;left:82px;top:190px;width:348px;height:150px;border:14px solid ${P.green};border-radius:50%;box-shadow:0 0 26px rgba(74,222,128,.7)}.landing i{position:absolute;inset:30px;border:8px dashed ${P.green};border-radius:50%}
      .spot{position:absolute;inset:36px;border-radius:50%;border:5px solid rgba(244,241,232,.55);background:radial-gradient(circle,rgba(250,204,21,.05) 0 25%,rgba(250,204,21,.22) 48%,rgba(7,7,7,.02) 68%,transparent 72%);box-shadow:inset 0 0 80px rgba(250,204,21,.2)}`,
    body: tracker.html,
  })
}

// ── Reel covers ────────────────────────────────────────────────────────────────
const coverPoses = [
  ['jalapeno', 'jump-serve'], ['bell-pepper', 'block'], ['poblano', 'diving-dig'],
  ['ghost-pepper', 'jump-serve'], ['jalapeno', 'celebration'], ['poblano', 'champion'],
]
for (let i = 0; i < items('coverHeadlines').length; i++) {
  const row = items('coverHeadlines')[i]
  const [pepper, pose] = coverPoses[i]
  await capture({
    category: 'capcut/covers', name: row.id, width: 1080, height: 1920,
    note: 'Headline and focal point stay inside the 4:5 profile-grid crop.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 70% 46%,rgba(163,230,53,.23),transparent 32%),linear-gradient(145deg,#111 0%,#070707 58%,#261004 100%)}
      .rays{position:absolute;inset:-300px;background:repeating-conic-gradient(from 218deg at 70% 46%,transparent 0 5deg,rgba(249,115,22,.1) 5deg 6.3deg);opacity:.8}.mascot{position:absolute;right:-130px;bottom:165px;width:${pose === 'diving-dig' ? 1150 : 860}px;max-height:1320px;object-fit:contain;filter:drop-shadow(0 30px 60px rgba(0,0,0,.7))}.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,.1),rgba(7,7,7,.05) 46%,rgba(7,7,7,.92) 82%)}
      .top{position:absolute;left:70px;right:70px;top:245px;display:flex;justify-content:space-between}.copy{position:absolute;left:70px;right:70px;bottom:285px}.label{font-family:'Anton',sans-serif;font-size:150px;line-height:.83;text-transform:uppercase;max-width:840px}.detail{font-size:25px;letter-spacing:.13em;text-transform:uppercase;color:${P.yellow};margin-top:26px;font-weight:700}.line{width:180px;height:15px;background:${P.orange};margin-bottom:30px}.meta{position:absolute;left:70px;bottom:205px;font-size:20px;letter-spacing:.16em;text-transform:uppercase;color:#c9c5bb}`,
    body: `<div class="bg"></div><div class="rays"></div><img class="mascot" src="${mascot(pepper, pose)}"><div class="shade"></div><div class="grain"></div><div class="top">${identity(P.paper)}<span class="mono">REEL · ${String(i + 1).padStart(2, '0')}</span></div><div class="copy"><div class="line"></div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div></div><div class="meta">${e(B.handle)} · GRASS TRIPLES</div>`,
  })
}

// ── Poblano event lifecycle Stories ───────────────────────────────────────────
const poblanoPoses = ['menace-walk', 'block', 'jump-serve', 'diving-dig', 'celebration', 'champion', 'exhausted']
// The poblano event masters front Poblano Verde (male-presenting): the series runs
// men's divisions only, so the female-presenting Poblano misrepresents the field on
// event marketing. She stays on brand-level assets (covers, share templates).
const EVENT_CHARACTER = 'poblano-verde'
// Campaign stages carry a fixed pose (payout reads as a champion moment, the field
// push as a block wall); lifecycle stages keep their positional rotation.
const storyPoseOverride = { payout: 'champion', 'field-target': 'block' }
for (let i = 0; i < items('eventStages').length; i++) {
  const row = items('eventStages')[i]
  const pose = storyPoseOverride[row.id] ?? poblanoPoses[i % poblanoPoses.length]
  const cta = row.id === 'registration' || row.id === 'payout' || row.id === 'field-target'
    ? byId('callsToAction', 'register').label
    : row.id === 'gallery' ? byId('callsToAction', 'gallery').label
      : E.url.toUpperCase()
  await capture({
    category: 'event/poblano/stories', name: `${String(i + 1).padStart(2, '0')}-${row.id}`, width: 1080, height: 1920,
    note: 'Poblano Open lifecycle Story master.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(60% 48% at 68% 43%,rgba(163,230,53,.2),transparent 70%),linear-gradient(150deg,#0b1407,#070707 62%,#241003)}.stripe{position:absolute;left:0;top:0;width:24px;height:100%;background:linear-gradient(${P.poblano},${P.yellow},${P.orange})}.mascot{position:absolute;right:${pose === 'diving-dig' ? '-330px' : '-120px'};top:${pose === 'diving-dig' ? '490px' : '380px'};width:${pose === 'diving-dig' ? '1300px' : '820px'};height:1050px;object-fit:contain;filter:drop-shadow(0 30px 70px rgba(0,0,0,.65))}.wash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,.2),transparent 30%,rgba(7,7,7,.15) 58%,#070707 78%)}
      .top{position:absolute;left:80px;right:80px;top:235px;display:flex;justify-content:space-between;align-items:center}.date{font-size:20px;color:${P.yellow};letter-spacing:.16em;font-weight:700}.copy{position:absolute;left:80px;right:75px;bottom:285px}.eyebrow{font-size:24px;letter-spacing:.24em;color:${P.poblano};text-transform:uppercase;font-weight:700}.label{font-family:'Anton',sans-serif;font-size:${row.id === 'payout' ? 250 : row.label.length > 17 ? 118 : 154}px;line-height:.84;text-transform:uppercase;margin-top:20px;max-width:930px}.detail{font-size:29px;line-height:1.4;max-width:780px;margin-top:28px;color:#d4d1c8}.cta{display:inline-block;margin-top:32px;border:3px solid ${P.orange};padding:18px 24px;color:${P.orange};font-family:'Bebas Neue';font-size:34px;letter-spacing:.07em;text-transform:uppercase}.foot{position:absolute;left:80px;right:80px;bottom:205px;display:flex;justify-content:space-between;font-size:18px;letter-spacing:.12em;text-transform:uppercase;color:#9b998f}`,
    body: `<div class="bg"></div><div class="stripe"></div><img class="mascot" src="${mascot(EVENT_CHARACTER, pose)}"><div class="wash"></div><div class="grain"></div><div class="top">${identity(P.paper)}<span class="date">${e(E.dateShort)}</span></div><div class="copy"><div class="eyebrow">${e(E.name)} · Season finale</div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div><div class="cta">${e(cta)}</div></div><div class="foot"><span>${e(E.location)}</span><span>${e(B.handle)}</span></div>`,
  })
}

// ── Feed cards ─────────────────────────────────────────────────────────────────
const feedIds = ['registration', 'field-set', 'schedule-live', 'standings', 'gallery', 'payout', 'field-target', 'next-up']
for (let i = 0; i < feedIds.length; i++) {
  const row = byId('eventStages', feedIds[i])
  const pose = ['menace-walk', 'block', 'jump-serve', 'champion', 'celebration', 'champion', 'block', 'menace-walk'][i]
  await capture({
    category: 'event/poblano/feed', name: `${String(i + 1).padStart(2, '0')}-${row.id}`, width: 1080, height: 1350,
    note: '4:5 Poblano Open feed master.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 76% 35%,rgba(163,230,53,.24),transparent 31%),linear-gradient(145deg,#111,#070707 60%,#251104)}.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(244,241,232,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(244,241,232,.04) 1px,transparent 1px);background-size:54px 54px}.mascot{position:absolute;right:-130px;top:210px;width:660px;height:780px;object-fit:contain;filter:drop-shadow(0 25px 55px rgba(0,0,0,.65))}.fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,7,7,.95) 0 43%,rgba(7,7,7,.14) 72%),linear-gradient(0deg,#070707 0 12%,transparent 43%)}.top{position:absolute;left:66px;right:66px;top:64px;display:flex;justify-content:space-between}.copy{position:absolute;left:66px;top:330px;width:640px}.rule{width:130px;height:12px;background:${P.poblano};margin-bottom:28px}.label{font-family:'Anton';font-size:${row.id === 'payout' ? 200 : row.label.length > 16 ? 102 : 126}px;line-height:.85;text-transform:uppercase}.detail{font-size:25px;line-height:1.45;color:#d4d1c8;margin-top:26px;max-width:570px}.event{color:${P.yellow};font-size:20px;letter-spacing:.16em;text-transform:uppercase;margin-top:30px;font-weight:700}.foot{position:absolute;left:66px;right:66px;bottom:64px;border-top:2px solid rgba(244,241,232,.18);padding-top:25px;display:flex;justify-content:space-between;font-size:18px;letter-spacing:.12em;text-transform:uppercase}`,
    body: `<div class="bg"></div><div class="grid"></div><img class="mascot" src="${mascot(EVENT_CHARACTER, pose)}"><div class="fade"></div><div class="grain"></div><div class="top">${identity(P.paper)}<span class="mono">${e(E.dateShort)}</span></div><div class="copy"><div class="rule"></div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div><div class="event">${e(E.name)} · ${e(E.format)}</div></div><div class="foot"><span>${e(E.location)}</span><span>${e(B.handle)}</span></div>`,
  })
}

// ── Fan-share templates ────────────────────────────────────────────────────────
// im-in (index 0) is event-specific, so it fronts EVENT_CHARACTER like the lifecycle
// masters; the rest are brand-level and keep the mixed roster.
const sharePeppers = [EVENT_CHARACTER, 'jalapeno', 'ghost-pepper', 'bell-pepper', 'poblano', 'jalapeno', 'poblano']
function shareMiddle(id) {
  if (id === 'my-pick') return '<div class="receipt"><span>FINALIST</span><b>TEAM NAME</b><span>CHAMPION</span><b>TEAM NAME</b></div>'
  if (id === 'vote-cast') return '<div class="seal">VOTE<br>RECORDED</div>'
  if (id === 'pepper-bingo') return `<div class="bingo">${Array.from({ length: 25 }, (_, i) => `<i class="${[2,6,12,18,22].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`
  if (id === 'my-season') return '<div class="stats"><b>03</b><span>EVENTS</span><b>12</b><span>MATCHES</span><b>01</b><span>PODIUM</span></div>'
  if (id === 'final-finish') return '<div class="podium"><i></i><i></i><i></i></div>'
  return ''
}
for (let i = 0; i < items('share').length; i++) {
  const row = items('share')[i]
  const pepper = sharePeppers[i]
  await capture({
    category: 'share/templates', name: row.id, width: 1080, height: 1920,
    note: 'Fan-share Story with placeholder data where shown.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 70% 34%,rgba(249,115,22,.28),transparent 31%),linear-gradient(155deg,#17110c,#070707 58%,#0a1710)}.frame{position:absolute;inset:190px 55px 210px;border:3px solid rgba(244,241,232,.22)}.mascot{position:absolute;right:-70px;top:420px;width:680px;height:850px;object-fit:contain;filter:drop-shadow(0 30px 65px rgba(0,0,0,.7));opacity:.94}.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,7,7,.12),transparent 44%,#070707 78%)}.top{position:absolute;top:240px;left:85px;right:85px;display:flex;justify-content:space-between}.copy{position:absolute;left:85px;right:85px;bottom:310px}.label{font-family:'Anton';font-size:${row.label.length > 12 ? 130 : 172}px;line-height:.84;text-transform:uppercase;max-width:850px}.detail{font-size:27px;line-height:1.4;margin-top:28px;color:#d4d1c8}.line{width:160px;height:14px;background:${P.orange};margin-bottom:26px}.foot{position:absolute;left:85px;right:85px;bottom:235px;display:flex;justify-content:space-between;font-size:18px;letter-spacing:.14em;text-transform:uppercase}.receipt{position:absolute;left:90px;top:610px;background:${P.paper};color:${P.ink};padding:30px;width:470px;transform:rotate(-3deg);display:grid;grid-template-columns:1fr;gap:7px;box-shadow:0 25px 50px rgba(0,0,0,.35)}.receipt span{font-size:15px;letter-spacing:.18em}.receipt b{font-family:'Bebas Neue';font-size:54px;border-bottom:2px dashed #999;padding-bottom:15px;margin-bottom:10px}.seal{position:absolute;left:100px;top:640px;width:330px;height:330px;border:16px double ${P.yellow};border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-family:'Anton';font-size:58px;line-height:.9;color:${P.yellow};transform:rotate(-8deg)}.bingo{position:absolute;left:90px;top:590px;width:390px;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.bingo i{aspect-ratio:1;border:4px solid rgba(244,241,232,.6)}.bingo .on{background:${P.orange};border-color:${P.orange}}.stats{position:absolute;left:90px;top:600px;display:grid;grid-template-columns:100px 240px;gap:7px 15px;align-items:center}.stats b{font-family:'Anton';font-size:72px;color:${P.yellow}}.stats span{font-size:22px;letter-spacing:.15em}.podium{position:absolute;left:90px;top:670px;width:400px;height:270px;display:flex;align-items:flex-end;gap:12px}.podium i{display:block;flex:1;background:${P.paper};height:52%}.podium i:nth-child(2){height:100%;background:${P.yellow}}.podium i:nth-child(3){height:72%;background:${P.orange}}`,
    body: `<div class="bg"></div><div class="frame"></div><img class="mascot" src="${mascot(pepper)}"><div class="shade"></div><div class="grain"></div><div class="top">${identity(P.paper)}<span class="mono">SHARE · ${String(i + 1).padStart(2, '0')}</span></div>${shareMiddle(row.id)}<div class="copy"><div class="line"></div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div></div><div class="foot"><span>${e(B.handle)}</span><span>${e(B.site)}</span></div>`,
  })
}

// Quiz result cards — use generated anchors automatically when they exist.
const quizMascots = { bell: 'bell-pepper', poblano: 'poblano', jalapeno: 'jalapeno', habanero: 'habanero', reaper: 'reaper', 'pepper-x': 'pepper-x' }
for (let i = 0; i < items('quizResults').length; i++) {
  const row = items('quizResults')[i]
  const pepper = quizMascots[row.id]
  await capture({
    category: 'share/quiz-results', name: row.id, width: 1080, height: 1920,
    note: 'Shareable result from What Pepper Are You?',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 44%,rgba(163,230,53,.28),transparent 34%),linear-gradient(145deg,#10130b,#070707 58%,#211006)}.ring{position:absolute;left:90px;top:370px;width:900px;height:900px;border:5px solid rgba(250,204,21,.28);border-radius:50%;box-shadow:0 0 100px rgba(249,115,22,.12)}.mascot{position:absolute;left:145px;top:380px;width:790px;height:950px;object-fit:contain;filter:drop-shadow(0 35px 70px rgba(0,0,0,.72))}.top{position:absolute;top:235px;left:80px;right:80px;display:flex;justify-content:space-between}.result{position:absolute;left:80px;right:80px;bottom:300px;text-align:center}.eyebrow{font-size:22px;letter-spacing:.24em;color:${P.orange};font-weight:700;text-transform:uppercase}.label{font-family:'Anton';font-size:${row.label.length > 13 ? 125 : 160}px;line-height:.86;text-transform:uppercase;margin-top:18px}.detail{font-size:28px;letter-spacing:.08em;text-transform:uppercase;color:${P.yellow};margin-top:24px}.cta{font-size:18px;letter-spacing:.12em;text-transform:uppercase;margin-top:30px;color:#aaa79e}`,
    body: `<div class="bg"></div><div class="ring"></div><img class="mascot" src="${mascot(pepper)}"><div class="grain"></div><div class="top">${identity(P.paper)}<span class="mono">QUIZ RESULT</span></div><div class="result"><div class="eyebrow">${e(byId('share', 'my-pepper').label)}</div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div><div class="cta">WHAT PEPPER ARE YOU? · ${e(B.site)}</div></div>`,
  })
}

// ── Web / Open Graph cards ─────────────────────────────────────────────────────
const webPeppers = ['poblano', 'jalapeno', 'bell-pepper', 'ghost-pepper', 'poblano']
for (let i = 0; i < items('webCards').length; i++) {
  const row = items('webCards')[i]
  await capture({
    category: 'web/og', name: row.id, width: 1200, height: 630,
    note: 'Open Graph and link-preview card.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 78% 50%,rgba(249,115,22,.26),transparent 35%),linear-gradient(135deg,#101010,#070707 65%,#211005)}.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(244,241,232,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(244,241,232,.035) 1px,transparent 1px);background-size:42px 42px}.mascot{position:absolute;right:-50px;top:20px;width:540px;height:610px;object-fit:contain;filter:drop-shadow(0 20px 45px rgba(0,0,0,.65))}.fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,7,7,.96) 0 50%,transparent 78%)}.top{position:absolute;left:58px;top:48px}.copy{position:absolute;left:58px;top:190px;width:760px}.rule{width:115px;height:11px;background:${P.orange};margin-bottom:24px}.label{font-family:'Anton';font-size:${row.label.length > 15 ? 82 : 105}px;line-height:.86;text-transform:uppercase}.detail{font-size:22px;line-height:1.45;color:#c9c5bb;max-width:640px;margin-top:22px}.url{position:absolute;left:58px;bottom:48px;font-size:17px;letter-spacing:.12em;text-transform:uppercase;color:${P.yellow}}`,
    body: `<div class="bg"></div><div class="grid"></div><img class="mascot" src="${mascot(webPeppers[i])}"><div class="fade"></div><div class="grain"></div><div class="top">${identity(P.paper)}</div><div class="copy"><div class="rule"></div><div class="label">${e(row.label)}</div><div class="detail">${e(row.detail)}</div></div><div class="url">${e(B.site)}</div>`,
  })
}

// ── Story highlight covers ─────────────────────────────────────────────────────
for (let i = 0; i < items('highlightLabels').length; i++) {
  const row = items('highlightLabels')[i]
  const accent = [P.orange, P.yellow, P.green, P.poblano][i % 4]
  await capture({
    category: 'social/highlights', name: row.id, width: 1080, height: 1080,
    note: 'Instagram Story Highlight cover; circle-safe.',
    css: `.bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 48%,rgba(244,241,232,.05),transparent 33%),${P.ink}}.circle{position:absolute;inset:128px;border:12px solid ${accent};border-radius:50%;box-shadow:0 0 50px ${accent}44,inset 0 0 40px ${accent}22;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:45px}.circle .peppermark{width:105px;height:145px;border-width:12px;color:${accent}}.label{font-family:'Bebas Neue';font-size:${row.label.length > 13 ? 62 : 82}px;line-height:.9;letter-spacing:.08em;text-transform:uppercase;text-align:center;max-width:630px}.index{position:absolute;bottom:185px;font-size:16px;letter-spacing:.2em;color:#96938b}`,
    body: `<div class="bg"></div><div class="grain"></div><div class="circle"><i class="peppermark"></i><div class="label">${e(row.label)}</div></div><div class="index">LP · ${String(i + 1).padStart(2, '0')}</div>`,
  })
}

await browser.close()
rmSync(TMP, { recursive: true, force: true })

const manifestPath = join(OUT, 'manifest-static.json')
writeFileSync(manifestPath, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), count: manifest.length, assets: manifest }, null, 2)}\n`)
console.log(`\nRendered ${manifest.length} static assets.`)
console.log(manifestPath)
