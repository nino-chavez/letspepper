/**
 * Jalapeño Open 2026 — video highlight INTRO / OUTRO cards (fade in/out).
 *
 * Ported from render-highlight-cards.mjs (Bell Pepper Open), same job structure
 * and file naming, retargeted to the Jalapeño Open's orange (#f97316) heat color
 * and roster data. One structural change: BPO's hero (mascot/pep-hero-green.png)
 * is a full-bleed illustrated background meant for object-fit:cover + mix-blend
 * screen. The JPO mascot (2026-jpo/announce/jalapeno-cutout.png) is a cropped
 * character cutout with real alpha instead — so heroLayer here positions/sizes
 * the character against a dark-ink + radial-glow field (matching the already
 * shipped render-jalapeno-announce.mjs look) rather than covering the frame.
 *
 *   node scripts/story-assets/render-jalapeno-highlights.mjs            # validation subset
 *   RENDER=all node scripts/story-assets/render-jalapeno-highlights.mjs # full batch (all teams)
 *
 * Reel (1080x1920) only — Stories/Reels is the only format these ever ship to.
 *
 * Output: scripts/story-assets/2026-jpo/jalapeno-highlights/
 *   generic/{intro,outro}-reel.png
 *   teams/NN-<place>-<slug>-intro-reel.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { EVENT, TEAMS, TIER, ordinal, byFinish } from './jalapeno-open-2026.mjs'
import { requiredAsset, localFonts, assertPageReady, verifyPng } from './preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// Durable source art (keyed from public/images/mascots/jalapeno-action.png) —
// never reference render-output dirs for inputs; that's how the cutout got lost.
const hero = requiredAsset(join(HERE, 'jpo-mascot', 'jalapeno-cutout.png'))
const RENDER = process.env.RENDER || 'validate'

// Event meta = shared canonical fields (year/date/loc/format) + highlights-only handles.
const E = {
  ...EVENT,
  gallery: 'letspepper.com/gallery', handle: '@letspepper.open', media: '@flickday.media',
}

const ORANGE = '#f97316', YELLOW = '#facc15'
const FAMILIES = ['Bebas Neue', 'Anton', 'JetBrains Mono']
const FONTS = localFonts(...FAMILIES)
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

const reset = (w, h, transparent) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? 'transparent' : '#070707'};
   font-family:'JetBrains Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`

// Dark-ink + radial-glow field with the mascot character positioned/sized within it
// (not full-bleed cover — the source art is a cropped cutout, not background art).
const heroLayer = ({ mascotWidth, mascotRight, mascotTop, glowX = '62%', glowY = '38%' } = {}) => `
  <div class="field"></div>
  <div class="grain"></div>
  ${mascotWidth ? `<img class="hero" src="${hero}">` : ''}
  <style>
    .field{position:absolute;inset:0;background:
      radial-gradient(55% 45% at ${glowX} ${glowY}, rgba(249,115,22,0.28), transparent 62%),
      radial-gradient(80% 60% at ${glowX} ${glowY}, rgba(250,204,21,0.08), transparent 70%), #070707}
    .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.08;mix-blend-mode:overlay;pointer-events:none}
    .hero{position:absolute;top:${mascotTop};right:${mascotRight};width:${mascotWidth};filter:drop-shadow(0 20px 50px rgba(0,0,0,0.6))}
  </style>`

const doc = (w, h, body, transparent) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h, transparent)}</style></head><body>${body}</body></html>`

/* ─────────────  INTRO  ───────────── */
function intro({ w, h, team }) {
  const mascotOpts = team
    ? { mascotWidth: '760px', mascotRight: '-140px', mascotTop: '80px', glowX: '68%', glowY: '30%' }
    : { mascotWidth: '880px', mascotRight: '100px', mascotTop: '190px', glowX: '50%', glowY: '30%' } // below the kicker line — the cutout's ball collides with it at the top edge
  const tier = team ? TIER[team.place] : null
  const finish = tier ? `${tier.label}${tier.short ? ` · ${tier.short.toUpperCase()}` : ''}` : ''
  const head = team
    ? `<div class="eyebrow">Jalapeño Open ${E.year} · Highlights</div>
       <div class="finish">${finish}</div>
       <div class="rule"></div>
       <div class="roster">${team.players.map(p => `<div class="pl"><span class="tick"></span>${p}</div>`).join('')}</div>`
    : `<div class="title">JALAPE&Ntilde;O<br><span class="o">OPEN</span></div>
       <div class="year">${E.year}</div>
       <div class="meta">${E.date} &middot; <b>${E.loc}</b></div>`

  const css = `
    .kick{position:absolute;top:128px;left:0;right:0;text-align:center;font-size:30px;letter-spacing:0.4em;text-transform:uppercase;color:${YELLOW};text-shadow:0 0 18px rgba(250,204,21,0.45)}
    .block{position:absolute;left:64px;right:64px;bottom:170px;text-align:center}
    .title{font-family:'Anton',sans-serif;font-size:210px;line-height:0.96;color:#f5f5f0;text-shadow:0 8px 40px rgba(0,0,0,0.7)}
    .title .o{color:${ORANGE};text-shadow:0 0 60px rgba(249,115,22,0.6)}
    .year{font-family:'Bebas Neue',sans-serif;font-size:130px;letter-spacing:0.18em;color:${YELLOW};margin-top:14px;text-shadow:0 0 36px rgba(250,204,21,0.45)}
    .meta{font-size:26px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(245,245,240,0.82);margin-top:24px}.meta b{color:${YELLOW}}
    .eyebrow{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.24em;text-transform:uppercase;color:rgba(245,245,240,0.52);margin-bottom:14px;text-align:left}
    .rule{width:128px;height:3px;background:${ORANGE};box-shadow:0 0 16px rgba(249,115,22,0.6);margin:0 0 34px}
    .roster{text-align:left}
    .roster .pl{display:flex;align-items:center;gap:24px;font-family:'Bebas Neue',sans-serif;font-size:112px;line-height:1.0;letter-spacing:0.01em;color:#f5f5f0;padding:14px 0;text-shadow:0 6px 30px rgba(0,0,0,0.95);white-space:nowrap}
    .roster .pl + .pl{border-top:1px solid rgba(245,245,240,0.12)}
    .roster .tick{width:14px;height:50px;flex:none;background:${ORANGE};box-shadow:0 0 18px rgba(249,115,22,0.7)}
    .tblock{left:80px;right:80px;text-align:left;z-index:1}
    .tblock .roster .pl{font-size:118px}`

  const finishCss = tier
    ? `.finish{font-family:'JetBrains Mono',monospace;font-weight:700;text-transform:uppercase;
        color:${tier.accent};text-shadow:0 0 24px ${tier.glow};font-size:30px;
        letter-spacing:0.2em;margin:2px 0 10px}`
    : ''
  return doc(w, h, `${heroLayer(mascotOpts)}<style>${css}${finishCss}</style>
    ${team ? '' : `<div class="kick">${E.format}</div>`}
    <div class="block${team ? ' tblock' : ''}">${head}</div>`)
}

/* ─────────────  OUTRO  ─────────────
   One job: credit + one CTA. Generic (identical for every team). Accent = yellow
   (Flickday's, kept as-is — it's the media partner's brand color, not a heat color). */
function outro({ w, h }) {
  const mascotOpts = { mascotWidth: '540px', mascotRight: '-60px', mascotTop: '60px', glowX: '78%', glowY: '22%' }
  const glow = 'text-shadow:0 0 46px rgba(250,204,21,0.3),0 6px 26px rgba(0,0,0,0.92),0 0 16px rgba(0,0,0,0.85)'
  const wglow = 'text-shadow:0 4px 22px rgba(0,0,0,0.92),0 0 14px rgba(0,0,0,0.8)'
  const lglow = 'text-shadow:0 2px 12px rgba(0,0,0,0.9)'
  const css = `
    .frame{position:absolute;left:80px;right:80px;bottom:170px;text-align:left}
    .lbl{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.34em;text-transform:uppercase;color:rgba(245,245,240,0.74);margin-bottom:12px;${lglow}}
    .cred{font-family:'Anton',sans-serif;font-size:124px;line-height:0.9;letter-spacing:-0.01em;color:${YELLOW};${glow}}
    .cta{margin-top:66px}
    .cta .url{font-family:'Bebas Neue',sans-serif;font-size:78px;letter-spacing:0.03em;color:#f5f5f0;${wglow}}.cta .url b{color:${YELLOW}}`

  return doc(w, h, `${heroLayer(mascotOpts)}<style>${css}</style>
    <div class="frame">
      <div class="lbl">Shot by</div>
      <div class="cred">FLICKDAY<br>MEDIA</div>
      <div class="cta">
        <div class="lbl">Full gallery</div>
        <div class="url">letspepper.com/<b>gallery</b></div>
      </div>
    </div>`)
}

/* ─────────────  LOWER-THIRD (alpha, tight)  ─────────────
   One job: name the player/play over live footage. Single strip, orange accent
   (roster side). Cropped to content (screenshot .cap) — the editor positions it
   in the lower third; we don't ship an empty full frame. */
function lowerThird({ tag, lead, sub }) {
  return doc(1900, 520, `<style>
    .cap{position:absolute;top:0;left:0;padding:90px}
    .panel{position:relative;display:inline-block;background:linear-gradient(180deg, rgba(8,8,8,0.92), rgba(8,8,8,0.82));border-radius:18px;border:1px solid rgba(255,255,255,0.07);box-shadow:0 26px 70px rgba(0,0,0,0.55);padding:34px 60px 38px 50px;overflow:hidden}
    .panel::before{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:${ORANGE};box-shadow:0 0 22px rgba(249,115,22,0.6)}
    .tag{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.28em;text-transform:uppercase;color:${ORANGE};margin-bottom:14px}
    .lead{font-family:'Bebas Neue',sans-serif;font-size:92px;line-height:0.94;letter-spacing:0.01em;color:#f5f5f0;white-space:nowrap}
    .sub{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.06em;color:rgba(245,245,240,0.6);margin-top:16px}.sub b{color:${ORANGE}}
  </style>
    <div class="cap"><div class="panel">
      ${tag ? `<div class="tag">${tag}</div>` : ''}
      <div class="lead">${lead}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
    </div></div>`, true)
}

/* ─────────────  WATERMARK / BUG (alpha, tight)  ─────────────
   Persistent corner attribution. Simple co-brand wordmark, low opacity, survives
   reshares. Cropped to content — one asset, editor places it in any corner. */
function bug() {
  return doc(1400, 240, `<style>
    .cap{position:absolute;top:0;left:0;padding:30px 34px;display:inline-flex;align-items:center;gap:18px;opacity:0.9}
    .cap .wm{font-family:'Bebas Neue',sans-serif;font-size:46px;letter-spacing:0.06em;line-height:1;color:#f5f5f0;text-shadow:0 2px 12px rgba(0,0,0,0.6)}
    .cap .wm b{color:${ORANGE}}
    .cap .x{font-family:'JetBrains Mono',monospace;font-size:24px;color:rgba(245,245,240,0.42)}
  </style>
    <div class="cap">
      <span class="wm"><b>@letspepper</b>.open</span>
      <span class="x">&times;</span>
      <span class="wm" style="font-size:32px">${E.media}</span>
    </div>`, true)
}

/* ─────────────  queue  ───────────── */
const FORMATS = [['reel', 1080, 1920]]
const jobs = []
const add = (dir, name, w, h, html, alpha = false, sel = null) => jobs.push({ path: join('2026-jpo', 'jalapeno-highlights', dir, name), w, h, html, alpha, sel })

// Team intros are named + ordered by FINISH (champion → play-in), matching the result cards.
const FINISH_ORDER = [...TEAMS].sort(byFinish)
const rankOf = new Map(FINISH_ORDER.map((t, i) => [t, i + 1]))
const introName = (t, fmt) => `${String(rankOf.get(t)).padStart(2, '0')}-${ordinal(t.place)}-${t.slug}-intro-${fmt}`
const champ = TEAMS.find(t => t.place === 1)
const finalist = TEAMS.find(t => t.place === 2)

if (process.env.ITER) {
  add('teams', introName(champ, 'reel'), 1080, 1920, intro({ w: 1080, h: 1920, team: champ }))
  add('generic', `lowerthird-champs`, 1900, 520, lowerThird({ tag: 'Champions', lead: champ.surnames, sub: `1st Place · Jalapeño Open ${E.year}` }), true, '.cap')
  add('generic', `bug`, 1400, 240, bug(), true, '.cap')
  add('generic', `outro-reel`, 1080, 1920, outro({ w: 1080, h: 1920 }))
} else {
  for (const [fmt, w, h] of FORMATS) {
    add('generic', `intro-${fmt}`, w, h, intro({ w, h }))
    add('generic', `outro-${fmt}`, w, h, outro({ w, h }))
  }
  add('generic', `bug`, 1400, 240, bug(), true, '.cap')
  const LOWERTHIRDS = [
    ['champions', 'Champions', champ.surnames, `1st Place · Jalapeño Open ${E.year}`],
    ['play', 'Play of the Day', 'DIG → SET → CRANK', `Jalapeño Open ${E.year}`],
    ['finalists', 'Finalists', finalist.surnames, `2nd Place · Jalapeño Open ${E.year}`],
  ]
  for (const [slug, tag, lead, sub] of LOWERTHIRDS)
    add('generic', `lowerthird-${slug}`, 1900, 520, lowerThird({ tag, lead, sub }), true, '.cap')
  const teamsToRender = RENDER === 'all' ? FINISH_ORDER : FINISH_ORDER.slice(0, 3)
  for (const t of teamsToRender)
    for (const [fmt, w, h] of FORMATS)
      add('teams', introName(t, fmt), w, h, intro({ w, h, team: t }))
}

mkdirSync(join(HERE, '2026-jpo', 'jalapeno-highlights', 'generic'), { recursive: true })
mkdirSync(join(HERE, '2026-jpo', 'jalapeno-highlights', 'teams'), { recursive: true })

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} cards (${RENDER})...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  const tmp = join(HERE, `_tmp-jhl.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await assertPageReady(page, FAMILIES)
  await page.evaluate(() => {
    const els = [...document.querySelectorAll('.roster .pl')]; if (!els.length) return
    const avail = els[0].parentElement.clientWidth
    let fs = parseInt(getComputedStyle(els[0]).fontSize)
    const tooWide = () => els.some(e => e.scrollWidth > avail)
    while (tooWide() && fs > 34) { fs -= 3; els.forEach(e => (e.style.fontSize = fs + 'px')) }
  })
  await page.waitForTimeout(250)
  const out = join(HERE, `${job.path}.png`)
  if (job.sel) {
    await page.locator(job.sel).screenshot({ path: out, omitBackground: true })
  } else {
    await page.screenshot({ path: out, omitBackground: job.alpha, clip: { x: 0, y: 0, width: job.w, height: job.h } })
  }
  // Cropped-to-content assets (sel) have content-driven dimensions — verify alpha only.
  verifyPng(out, job.sel ? { alpha: job.alpha } : { width: job.w, height: job.h, alpha: job.alpha })
  console.log(`✓ ${job.path}.png`)
  await page.close(); rmSync(tmp)
}
await browser.close()
console.log(`\nDone → scripts/story-assets/2026-jpo/jalapeno-highlights/  (RENDER=all for every team)`)
