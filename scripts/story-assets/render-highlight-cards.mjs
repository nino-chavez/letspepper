/**
 * Bell Pepper Open 2026 — video highlight INTRO / OUTRO cards (fade in/out).
 *
 * Opaque full-frame cards (no transparency needed — they fade in/out over the
 * cut, they don't overlay live footage). Fronted by the OPM-green pepper hero
 * (mascot/pep-hero-green.png), composited full-bleed via mix-blend-mode:screen.
 *
 *   node scripts/story-assets/render-highlight-cards.mjs            # validation subset
 *   RENDER=all node scripts/story-assets/render-highlight-cards.mjs # full batch (all teams)
 *
 * Output: scripts/story-assets/highlights/
 *   generic/{intro,outro}-{reel,wide}.png
 *   teams/team-NN-<lead>-{intro,outro}-{reel,wide}.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const hero = pathToFileURL(join(HERE, 'mascot', 'pep-hero-green.png')).href
const FD = '/Users/nino/Workspace/dev/apps/flickdaymedia/flickday-assets/outro/aperture-icon-transparent.png'
const ap = pathToFileURL(FD).href
const RENDER = process.env.RENDER || 'validate'

const E = {
  year: '2026', date: 'June 7, 2026', loc: 'Aurora, IL', format: 'Grass Triples · 3v3',
  gallery: 'letspepper.com/gallery', handle: '@letspepper.open', media: '@flickday.media',
  readout: 'f/2.8 · 1/2000 · ISO 200 · 200MM',
}

// Roster (Bell Pepper Open 2026 men's). Headline = surnames; sub = full names.
const TEAMS = [
  ['01', ['Nick Maruyama', 'Braydon Savitski-Lynde', 'Lincoln Geist']],
  ['02', ['Nate Meyer', 'Charlie Podgorny', 'Ian Schuller']],
  ['03', ['Jack Stolzer', 'Will Elias', 'Ty Steponaitus']],
  ['04', ['Elijah Skutt', 'Owen Randel', 'Ian']],
  ['05', ['David Hill', 'Quinn Bozarth', 'Braxton Francis']],
  ['06', ['Brad Hornstein', 'Cooper Hansen', 'Mason Kolar']],
  ['07', ['Urvil Patel', 'Evan Hughes', 'Jake Reishus']],
  ['08', ['Erik Kirschbaum', 'Mike Hallman', 'Joe Glatz']],
  ['09', ['Everett Haynes', 'Will Mensching', 'Blayr Young']],
  ['10', ['Tyler Donovan', 'Sammy Atkinson', 'Abhi Lakkamsani', 'Justin McCartney']],
  ['11', ['Mitchell Carrera', 'Connor Jaral', 'Connor Studer']],
  ['12', ['Sriram Sundareswaram', 'Cedric', 'Shane']],
  ['13', ['Colin Merk', 'Ryan Merk', 'Dave Wieczorek']],
  ['14', ['David Johnson', 'Tam', 'Kenyon Hayes']],
  ['15', ['Pat Paasch', 'Joel Paasch']],
  ['16', ['Tom Blankenstein', 'Rolando', 'Jack Huizinga']],
  ['17', ['Justin Arrowood', 'Ben Boron', 'Bella Thompson']],
  ['18', ['Noah Konopack', 'Josh Bloom', 'Ray Driver']],
  ['19', ['Kyle Swarens', 'Carter Geiger', 'Tony Solis']],
].map(([num, players]) => ({
  num, players,
  surnames: players.map(p => p.split(' ').slice(-1)[0].toUpperCase()).join(' · '),
  slug: players[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, ''),
}))

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@500;700&display=swap');`

const reset = (w, h, transparent) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? 'transparent' : '#070707'};
   font-family:'JetBrains Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`

// Full-bleed hero, screen-blend (black -> bg, no rectangle). `pos`/`scrim` per layout.
const heroLayer = (w, h, objpos, scrim) => `
  <img class="hero" src="${hero}">
  <div class="scrim"></div>
  <style>
    .hero{position:absolute;inset:0;width:${w}px;height:${h}px;object-fit:cover;object-position:${objpos};mix-blend-mode:screen}
    .scrim{position:absolute;inset:0;background:${scrim}}
  </style>`

const doc = (w, h, body, transparent) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h, transparent)}</style></head><body>${body}</body></html>`

/* ─────────────  INTRO  ───────────── */
function intro({ w, h, team }) {
  const reel = h > w
  const objpos = reel ? '50% 28%' : '76% 22%'
  const scrim = team
    ? (reel
        ? `linear-gradient(180deg, rgba(7,7,7,0.34) 0%, rgba(7,7,7,0.30) 26%, rgba(7,7,7,0.74) 46%, #070707 56%)`
        : `linear-gradient(90deg, #070707 0%, rgba(7,7,7,0.94) 38%, rgba(7,7,7,0.5) 64%, rgba(7,7,7,0.26) 100%)`)
    : (reel
        ? `radial-gradient(120% 70% at 50% 28%, transparent 42%, rgba(7,7,7,0.35) 100%),linear-gradient(180deg, rgba(7,7,7,0.45) 0%, transparent 16%, transparent 38%, rgba(7,7,7,0.8) 64%, #070707 86%)`
        : `linear-gradient(90deg, rgba(7,7,7,0.92) 0%, rgba(7,7,7,0.55) 46%, transparent 78%),linear-gradient(0deg, rgba(7,7,7,0.6) 0%, transparent 36%)`)
  const head = team
    ? `<div class="eyebrow">Bell Pepper Open ${E.year} · Highlights</div>
       <div class="rule"></div>
       <div class="roster">${team.players.map(p => `<div class="pl"><span class="tick"></span>${p}</div>`).join('')}</div>`
    : `<div class="title">BELL<br>PEPPER<br><span class="o">OPEN</span></div>
       <div class="year">${E.year}</div>
       <div class="meta">${E.date} &middot; <b>${E.loc}</b></div>`

  const css = reel ? `
    .kick{position:absolute;top:128px;left:0;right:0;text-align:center;font-size:30px;letter-spacing:0.4em;text-transform:uppercase;color:#facc15;text-shadow:0 0 18px rgba(250,204,21,0.45)}
    .block{position:absolute;left:64px;right:64px;bottom:170px;text-align:center}
    .title{font-family:'Anton',sans-serif;font-size:210px;line-height:0.96;color:#f5f5f0;text-shadow:0 8px 40px rgba(0,0,0,0.7)}
    .title .o{color:#4ade80;text-shadow:0 0 60px rgba(74,222,128,0.6)}
    .year{font-family:'Bebas Neue',sans-serif;font-size:130px;letter-spacing:0.18em;color:#facc15;margin-top:14px;text-shadow:0 0 36px rgba(250,204,21,0.45)}
    .meta{font-size:26px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.82);margin-top:24px}.meta b{color:#facc15}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(245,245,240,0.52);margin-bottom:14px;text-align:left}
    .rule{width:128px;height:3px;background:#4ade80;box-shadow:0 0 16px rgba(74,222,128,0.6);margin:0 0 34px}
    .roster{text-align:left}
    .roster .pl{display:flex;align-items:center;gap:24px;font-family:'Bebas Neue',sans-serif;font-size:112px;line-height:1.0;letter-spacing:0.01em;color:#f5f5f0;padding:14px 0;text-shadow:0 6px 30px rgba(0,0,0,0.95);white-space:nowrap}
    .roster .pl + .pl{border-top:1px solid rgba(245,245,240,0.12)}
    .roster .tick{width:14px;height:50px;flex:none;background:#4ade80;box-shadow:0 0 18px rgba(74,222,128,0.7)}
    .tblock{left:80px;right:80px;text-align:left;z-index:1}
    .tblock .roster .pl{font-size:118px}` : `
    .kick{position:absolute;top:96px;left:130px;font-size:24px;letter-spacing:0.4em;text-transform:uppercase;color:#facc15;text-shadow:0 0 18px rgba(250,204,21,0.45)}
    .block{position:absolute;left:130px;max-width:1150px;top:50%;transform:translateY(-50%)}
    .title{font-family:'Anton',sans-serif;font-size:190px;line-height:0.94;color:#f5f5f0;text-shadow:0 8px 40px rgba(0,0,0,0.7)}
    .title .o{color:#4ade80;text-shadow:0 0 60px rgba(74,222,128,0.6)}
    .year{font-family:'Bebas Neue',sans-serif;font-size:104px;letter-spacing:0.18em;color:#facc15;margin-top:10px}
    .meta{font-size:24px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.82);margin-top:18px}.meta b{color:#facc15}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(245,245,240,0.52);margin-bottom:14px}
    .rule{width:120px;height:3px;background:#4ade80;box-shadow:0 0 16px rgba(74,222,128,0.6);margin:0 0 30px}
    .roster .pl{display:flex;align-items:center;gap:22px;font-family:'Bebas Neue',sans-serif;font-size:96px;line-height:1.0;letter-spacing:0.01em;color:#f5f5f0;padding:12px 0;text-shadow:0 6px 30px rgba(0,0,0,0.95);white-space:nowrap}
    .roster .pl + .pl{border-top:1px solid rgba(245,245,240,0.12)}
    .roster .tick{width:13px;height:44px;flex:none;background:#4ade80;box-shadow:0 0 18px rgba(74,222,128,0.7)}
    .tblock{text-align:left}
    .tblock .roster .pl{font-size:104px;gap:24px}`

  return doc(w, h, `${heroLayer(w, h, objpos, scrim)}<style>${css}</style>
    ${team ? '' : `<div class="kick">${E.format}</div>`}
    <div class="block${team ? ' tblock' : ''}">${head}</div>`)
}

/* ─────────────  OUTRO  ─────────────
   One job: credit + one CTA. Generic (identical for every team). Accent = yellow
   (Flickday's). Cut from last round: slogan, readout, handles, kicker, divider. */
function outro({ w, h }) {
  const reel = h > w
  const objpos = reel ? '50% 16%' : '64% 22%'
  // light scrim — let the character read through the lower half behind the wordmarks;
  // a soft pocket + black text-glow carry legibility instead of a flat black floor.
  const scrim = reel
    ? `radial-gradient(125% 52% at 26% 82%, rgba(7,7,7,0.72), transparent 72%),linear-gradient(180deg, rgba(7,7,7,0.24) 0%, rgba(7,7,7,0.16) 32%, rgba(7,7,7,0.30) 56%, rgba(7,7,7,0.46) 100%)`
    : `radial-gradient(74% 120% at 18% 66%, rgba(7,7,7,0.72), transparent 74%),linear-gradient(90deg, rgba(7,7,7,0.64) 0%, rgba(7,7,7,0.34) 48%, rgba(7,7,7,0.18) 100%)`
  const glow = 'text-shadow:0 0 46px rgba(250,204,21,0.3),0 6px 26px rgba(0,0,0,0.92),0 0 16px rgba(0,0,0,0.85)'
  const wglow = 'text-shadow:0 4px 22px rgba(0,0,0,0.92),0 0 14px rgba(0,0,0,0.8)'
  const lglow = 'text-shadow:0 2px 12px rgba(0,0,0,0.9)'
  const css = reel ? `
    .frame{position:absolute;left:80px;right:80px;bottom:170px;text-align:left}
    .ap{width:104px;display:block;filter:drop-shadow(0 0 34px rgba(250,204,21,0.4)) drop-shadow(0 4px 14px rgba(0,0,0,0.7));margin-bottom:30px}
    .lbl{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.34em;text-transform:uppercase;color:rgba(245,245,240,0.74);margin-bottom:12px;${lglow}}
    .cred{font-family:'Anton',sans-serif;font-size:124px;line-height:0.9;letter-spacing:-0.01em;color:#facc15;${glow}}
    .cta{margin-top:66px}
    .cta .url{font-family:'Bebas Neue',sans-serif;font-size:78px;letter-spacing:0.03em;color:#f5f5f0;${wglow}}.cta .url b{color:#facc15}` : `
    .frame{position:absolute;left:130px;right:130px;top:50%;transform:translateY(-50%);text-align:left;max-width:1320px}
    .ap{width:92px;display:block;filter:drop-shadow(0 0 34px rgba(250,204,21,0.4)) drop-shadow(0 4px 14px rgba(0,0,0,0.7));margin-bottom:26px}
    .lbl{font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.34em;text-transform:uppercase;color:rgba(245,245,240,0.74);margin-bottom:12px;${lglow}}
    .cred{font-family:'Anton',sans-serif;font-size:138px;line-height:0.88;letter-spacing:-0.01em;color:#facc15;${glow}}
    .cta{margin-top:54px}
    .cta .url{font-family:'Bebas Neue',sans-serif;font-size:74px;letter-spacing:0.03em;color:#f5f5f0;${wglow}}.cta .url b{color:#facc15}`

  return doc(w, h, `${heroLayer(w, h, objpos, scrim)}<style>${css}</style>
    <div class="frame">
      <img class="ap" src="${ap}">
      <div class="lbl">Shot by</div>
      <div class="cred">FLICKDAY<br>MEDIA</div>
      <div class="cta">
        <div class="lbl">Full gallery</div>
        <div class="url">letspepper.com/<b>gallery</b></div>
      </div>
    </div>`)
}

/* ─────────────  LOWER-THIRD (alpha, tight)  ─────────────
   One job: name the player/play over live footage. Single strip, green accent
   (roster side), its own value field. Cropped to content (screenshot .cap) — the
   editor positions it in the lower third; we don't ship an empty full frame. */
function lowerThird({ tag, lead, sub }) {
  return doc(1900, 520, `<style>
    .cap{position:absolute;top:0;left:0;padding:90px}
    .panel{position:relative;display:inline-block;background:linear-gradient(180deg, rgba(8,8,8,0.92), rgba(8,8,8,0.82));backdrop-filter:blur(8px);border-radius:18px;border:1px solid rgba(255,255,255,0.07);box-shadow:0 26px 70px rgba(0,0,0,0.55);padding:34px 60px 38px 50px;overflow:hidden}
    .panel::before{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:#4ade80;box-shadow:0 0 22px rgba(74,222,128,0.6)}
    .tag{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.28em;text-transform:uppercase;color:#4ade80;margin-bottom:14px}
    .lead{font-family:'Bebas Neue',sans-serif;font-size:92px;line-height:0.94;letter-spacing:0.01em;color:#f5f5f0;white-space:nowrap}
    .sub{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.06em;color:rgba(245,245,240,0.6);margin-top:16px}.sub b{color:#4ade80}
  </style>
    <div class="cap"><div class="panel">
      ${tag ? `<div class="tag">${tag}</div>` : ''}
      <div class="lead">${lead}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div></div>`, true)
}

/* ─────────────  WATERMARK / BUG (alpha, tight)  ─────────────
   Persistent corner attribution. Simple co-brand wordmark, low opacity, survives
   reshares. Not the detailed hero. Cropped to content — one asset, editor places
   it in any corner of either orientation. */
function bug() {
  return doc(1400, 360, `<style>
    .cap{position:absolute;top:0;left:0;padding:30px 34px;display:inline-flex;align-items:center;gap:18px;opacity:0.9}
    .cap .wm{font-family:'Bebas Neue',sans-serif;font-size:46px;letter-spacing:0.06em;line-height:1;color:#f5f5f0;text-shadow:0 2px 12px rgba(0,0,0,0.6)}
    .cap .wm b{color:#4ade80}
    .cap .x{font-family:'JetBrains Mono',monospace;font-size:24px;color:rgba(245,245,240,0.42)}
    .cap .ap{width:54px;height:54px;filter:drop-shadow(0 0 11px rgba(250,204,21,0.3)) drop-shadow(0 2px 8px rgba(0,0,0,0.5))}
  </style>
    <div class="cap">
      <span class="wm"><b>LET'S</b> PEPPER</span>
      <span class="x">&times;</span>
      <img class="ap" src="${ap}">
    </div>`, true)
}

/* ─────────────  queue  ───────────── */
const FORMATS = [['reel', 1080, 1920], ['wide', 1920, 1080]]
const jobs = []
const add = (dir, name, w, h, html, alpha = false, sel = null) => jobs.push({ path: join('highlights', dir, name), w, h, html, alpha, sel })

if (process.env.ITER) {
  // single-surface sign-off loop — opaque cards full-frame, overlays cropped tight
  const t = TEAMS.find(x => x.num === '13')
  add('teams', `team-${t.num}-${t.slug}-intro-reel`, 1080, 1920, intro({ w: 1080, h: 1920, team: t }))
  add('generic', `lowerthird-champs`, 1900, 520, lowerThird({ tag: 'Champions', lead: 'MERK · MERK · WIECZOREK', sub: '1st Place · Bell Pepper Open 2026' }), true, '.cap')
  add('generic', `bug`, 1400, 360, bug(), true, '.cap')
  add('generic', `outro-reel`, 1080, 1920, outro({ w: 1080, h: 1920 }))
} else {
  // generic opaque cards — brand intro + credit outro, both orientations
  for (const [fmt, w, h] of FORMATS) {
    add('generic', `intro-${fmt}`, w, h, intro({ w, h }))
    add('generic', `outro-${fmt}`, w, h, outro({ w, h }))
  }
  // tight alpha overlays — orientation-agnostic, editor places them
  add('generic', `bug`, 1400, 360, bug(), true, '.cap')
  const LOWERTHIRDS = [
    ['champions', 'Champions', 'MERK · MERK · WIECZOREK', '1st Place · Bell Pepper Open 2026'],
    ['play', 'Play of the Day', 'DIG → SET → CRANK', 'Bell Pepper Open 2026'],
    ['finalists', 'Finalists', 'MARUYAMA · SAVITSKI-LYNDE · GEIST', '2nd Place · Bell Pepper Open 2026'],
  ]
  for (const [slug, tag, lead, sub] of LOWERTHIRDS)
    add('generic', `lowerthird-${slug}`, 1900, 520, lowerThird({ tag, lead, sub }), true, '.cap')
  // per-team intros — roster is hero, both orientations
  const teamsToRender = RENDER === 'all' ? TEAMS : TEAMS.filter(t => ['13', '10', '15'].includes(t.num))
  for (const t of teamsToRender)
    for (const [fmt, w, h] of FORMATS)
      add('teams', `team-${t.num}-${t.slug}-intro-${fmt}`, w, h, intro({ w, h, team: t }))
}

mkdirSync(join(HERE, 'highlights', 'generic'), { recursive: true })
mkdirSync(join(HERE, 'highlights', 'teams'), { recursive: true })

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} cards (${RENDER})...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  const tmp = join(HERE, `_tmp.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // auto-fit roster names to width (shrink the whole list to the widest line)
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('.roster .pl')]; if (!els.length) return
    const avail = els[0].parentElement.clientWidth
    let fs = parseInt(getComputedStyle(els[0]).fontSize)
    const tooWide = () => els.some(e => e.scrollWidth > avail)
    while (tooWide() && fs > 34) { fs -= 3; els.forEach(e => (e.style.fontSize = fs + 'px')) }
  })
  await page.waitForTimeout(250)
  if (job.sel) {
    // tight overlay asset — crop to the element's bounding box, transparent
    await page.locator(job.sel).screenshot({ path: join(HERE, `${job.path}.png`), omitBackground: true })
  } else {
    await page.screenshot({ path: join(HERE, `${job.path}.png`), omitBackground: job.alpha, clip: { x: 0, y: 0, width: job.w, height: job.h } })
  }
  console.log(`✓ ${job.path}.png`)
  await page.close(); rmSync(tmp)
}
await browser.close()
console.log(`\nDone → scripts/story-assets/highlights/  (RENDER=all for every team)`)
