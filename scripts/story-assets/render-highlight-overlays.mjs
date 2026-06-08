/**
 * Bell Pepper Open 2026 — video highlight overlay kit (CapCut / Premiere).
 *
 * Co-brands Let's Pepper (bell green #4ade80) × Flickday Media (yellow #facc15),
 * fronted by "Pep" — the Let's Pepper mascot (mascot-pep-*.png). Dark cinematic
 * backdrops; Pep overlays on top so the mascot is the graphic, not a baked scene.
 *
 *   node scripts/story-assets/render-highlight-overlays.mjs
 *
 * Output: scripts/story-assets/highlights/   (reel = 1080x1920, wide = 1920x1080)
 *   intro-*      opaque  — title card
 *   lowerthird-* alpha   — name / play callout
 *   bug-*        alpha   — persistent corner watermark
 *   outro-*      opaque  — co-brand end card → gallery
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const outDir = join(HERE, 'highlights')
mkdirSync(outDir, { recursive: true })

// Pep — the Let's Pepper mascot (charming brand-mascot character, reference-locked
// poses). Built via tools/gen-images/scripts/lpo-pep-poses.mjs.
const pepHero = pathToFileURL(join(HERE, 'mascot-pep-hero.png')).href      // cool, ball-spin
const pepSpike = pathToFileURL(join(HERE, 'mascot-pep-spike.png')).href    // action
const pepCelebrate = pathToFileURL(join(HERE, 'mascot-pep-celebrate.png')).href // win
const FD = '/Users/nino/Workspace/dev/apps/flickdaymedia/flickday-assets/outro'
const fdAperture = pathToFileURL(join(FD, 'aperture-icon-transparent.png')).href

const E = {
  year: '2026',
  tier: 'Season Opener',
  format: 'Grass Triples · 3v3',
  date: 'June 7, 2026',
  handle: '@letspepper.open',
  gallery: 'letspepper.com/gallery',
  media: '@flickday.media',
  readout: 'f/2.8 · 1/2000 · ISO 200 · 200MM',
}

/* ─────────────────────────  shared CSS  ───────────────────────── */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Anton&family=Space+Mono:wght@400;700&family=JetBrains+Mono:wght@400;500;700&display=swap');`
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`

const reset = (w, h, transparent) =>
  `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;${
    transparent ? 'background:transparent' : 'background:#070707'
  }}body{position:relative;font-family:'Space Mono',monospace;color:#f5f5f0;-webkit-font-smoothing:antialiased}`

// Co-brand bug: Pep mascot + LET'S PEPPER wordmark ✕ Flickday Media.
const coBug = (scale = 1) => `
  <div class="cobug" style="--s:${scale}">
    <img class="pep" src="${pepHero}" alt="">
    <span class="lp">Let's Pepper</span>
    <span class="x">✕</span>
    <img class="ap" src="${fdAperture}" alt="">
    <span class="fd">Flickday<br>Media</span>
  </div>`

const coBugCss = `
  .cobug{display:inline-flex;align-items:center;gap:calc(14px * var(--s));
    padding:calc(10px * var(--s)) calc(22px * var(--s)) calc(10px * var(--s)) calc(14px * var(--s));
    border-radius:calc(16px * var(--s));background:rgba(7,7,7,0.55);backdrop-filter:blur(8px);
    border:1px solid rgba(250,204,21,0.22);box-shadow:0 8px 40px rgba(0,0,0,0.45)}
  .cobug .pep{height:calc(60px * var(--s));width:auto;flex:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.5))}
  .cobug .lp{font-family:'Bebas Neue',sans-serif;font-size:calc(34px * var(--s));letter-spacing:0.06em;
    text-transform:uppercase;color:#4ade80;text-shadow:0 0 20px rgba(74,222,128,0.4);white-space:nowrap}
  .cobug .x{font-family:'Space Mono',monospace;font-size:calc(20px * var(--s));color:rgba(245,245,240,0.4)}
  .cobug .ap{width:calc(40px * var(--s));height:calc(40px * var(--s));flex:none;
    filter:drop-shadow(0 0 12px rgba(250,204,21,0.35))}
  .cobug .fd{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:calc(15px * var(--s));
    line-height:1.0;letter-spacing:0.06em;text-transform:uppercase;color:#facc15}`

const film = `
  .grain{position:absolute;inset:0;background-image:${GRAIN};background-size:340px;opacity:0.09;
    mix-blend-mode:overlay;pointer-events:none}
  .grid{position:absolute;inset:0;background-image:
    linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px);
    background-size:64px 64px;mask-image:radial-gradient(ellipse at center, black 35%, transparent 80%)}
  .spr{position:absolute;left:0;right:0;height:18px;display:flex;gap:24px;padding:0 56px;align-items:center;opacity:0.45}
  .spr span{flex:1;height:11px;background:rgba(250,204,21,0.18);border-radius:2px}
  .bgglow{position:absolute;inset:0;background:
    radial-gradient(70% 52% at 50% 36%, rgba(74,222,128,0.20), transparent 60%),
    radial-gradient(120% 60% at 50% 110%, rgba(250,204,21,0.12), transparent 60%)}
  .vign{position:absolute;inset:0;box-shadow:inset 0 0 320px 60px rgba(0,0,0,0.7);pointer-events:none}`

const sprockets = (n) =>
  `<div class="spr" style="top:42px">${'<span></span>'.repeat(n)}</div>` +
  `<div class="spr" style="bottom:42px">${'<span></span>'.repeat(n)}</div>`

const darkBg = `<div class="bgglow"></div><div class="grid"></div><div class="grain"></div><div class="vign"></div>`

const doc = (w, h, transparent, head, body) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}${reset(w, h, transparent)}${coBugCss}${film}${head}</style></head><body>${body}</body></html>`

/* ─────────────────────────  INTRO  ───────────────────────── */
function introReel() {
  const head = `
    .frame{position:absolute;inset:0;padding:170px 84px 200px;display:flex;flex-direction:column;text-align:center;align-items:center}
    .kick{font-family:'JetBrains Mono',monospace;font-size:26px;letter-spacing:0.42em;text-transform:uppercase;color:#facc15;text-shadow:0 0 18px rgba(250,204,21,0.4)}
    .hero{position:absolute;top:300px;left:50%;transform:translateX(-50%);width:680px;filter:drop-shadow(0 30px 60px rgba(0,0,0,0.6)) drop-shadow(0 0 70px rgba(74,222,128,0.28))}
    .stack{margin-top:auto;display:flex;flex-direction:column;align-items:center}
    .tier{display:flex;align-items:center;gap:16px;font-size:26px;letter-spacing:0.3em;text-transform:uppercase;color:#4ade80;margin-bottom:24px}
    .tier .dot{width:12px;height:12px;border-radius:50%;background:#4ade80;box-shadow:0 0 16px #4ade80}
    .title{font-family:'Anton',sans-serif;font-size:236px;line-height:0.82;letter-spacing:-0.01em;color:#f5f5f0;text-shadow:0 10px 44px rgba(0,0,0,0.6)}
    .title em{font-style:normal;color:#4ade80;text-shadow:0 0 50px rgba(74,222,128,0.5)}
    .year{font-family:'Bebas Neue',sans-serif;font-size:120px;letter-spacing:0.16em;color:#facc15;margin-top:6px;text-shadow:0 0 36px rgba(250,204,21,0.4)}
    .meta{font-size:24px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.78);margin-top:26px}
    .meta b{color:#facc15}
    .cred{position:absolute;bottom:116px;left:0;right:0;display:flex;justify-content:center}`
  const body = `
    ${darkBg}${sprockets(11)}
    <img class="hero" src="${pepSpike}" alt="">
    <div class="frame">
      <div class="kick">${E.format}</div>
      <div class="stack">
        <div class="tier"><span class="dot"></span>${E.tier}</div>
        <div class="title">BELL<br>PEPPER<br><em>OPEN</em></div>
        <div class="year">${E.year}</div>
        <div class="meta">${E.date} &middot; <b>Aurora, IL</b></div>
      </div>
    </div>
    <div class="cred">${coBug(1)}</div>`
  return doc(1080, 1920, false, head, body)
}

function introWide() {
  const head = `
    .hero{position:absolute;right:120px;bottom:0;height:980px;filter:drop-shadow(0 24px 56px rgba(0,0,0,0.6)) drop-shadow(0 0 70px rgba(74,222,128,0.26))}
    .frame{position:absolute;inset:0;padding:120px 130px;display:flex;flex-direction:column;justify-content:center}
    .kick{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.42em;text-transform:uppercase;color:#facc15;text-shadow:0 0 18px rgba(250,204,21,0.4)}
    .tier{display:flex;align-items:center;gap:16px;font-size:24px;letter-spacing:0.3em;text-transform:uppercase;color:#4ade80;margin-top:20px}
    .tier .dot{width:12px;height:12px;border-radius:50%;background:#4ade80;box-shadow:0 0 16px #4ade80}
    .title{font-family:'Anton',sans-serif;font-size:210px;line-height:0.82;letter-spacing:-0.01em;color:#f5f5f0;margin-top:22px;text-shadow:0 10px 44px rgba(0,0,0,0.6)}
    .title em{font-style:normal;color:#4ade80;text-shadow:0 0 50px rgba(74,222,128,0.5)}
    .row{display:flex;align-items:baseline;gap:34px;margin-top:14px}
    .year{font-family:'Bebas Neue',sans-serif;font-size:96px;letter-spacing:0.16em;color:#facc15;text-shadow:0 0 36px rgba(250,204,21,0.4)}
    .meta{font-size:24px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(245,245,240,0.78)}
    .meta b{color:#facc15}
    .cred{position:absolute;top:64px;left:90px}`
  const body = `
    ${darkBg}${sprockets(20)}
    <img class="hero" src="${pepSpike}" alt="">
    <div class="frame">
      <div class="kick">${E.format}</div>
      <div class="tier"><span class="dot"></span>${E.tier}</div>
      <div class="title">BELL PEPPER<br><em>OPEN</em></div>
      <div class="row"><span class="year">${E.year}</span><span class="meta">${E.date} &middot; <b>Aurora, IL</b></span></div>
    </div>
    <div class="cred">${coBug(0.95)}</div>`
  return doc(1920, 1080, false, head, body)
}

/* ─────────────────────────  LOWER-THIRDS (alpha)  ───────────────────────── */
function lowerThirdReel({ lead, sub, tag }) {
  const head = `
    .lt{position:absolute;left:60px;right:60px;bottom:300px}
    .mini{position:absolute;right:18px;top:-150px;height:212px;z-index:3;filter:drop-shadow(0 12px 24px rgba(0,0,0,0.55))}
    .ey{display:inline-flex;align-items:center;gap:12px;font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:0.22em;text-transform:uppercase;color:#facc15;margin-bottom:14px}
    .ey .ap{width:26px;height:26px}
    .card{position:relative;background:linear-gradient(180deg, rgba(7,7,7,0.86), rgba(7,7,7,0.74));backdrop-filter:blur(10px);border-radius:22px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 70px rgba(0,0,0,0.5);padding:34px 40px;overflow:hidden}
    .card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:linear-gradient(180deg,#4ade80,#facc15)}
    .tag{display:inline-flex;align-items:center;gap:12px;font-family:'Space Mono',monospace;font-size:22px;letter-spacing:0.24em;text-transform:uppercase;color:#4ade80;margin-bottom:10px}
    .tag .dot{width:10px;height:10px;border-radius:50%;background:#4ade80;box-shadow:0 0 12px #4ade80}
    .lead{font-family:'Bebas Neue',sans-serif;font-size:86px;line-height:0.94;letter-spacing:0.01em;color:#f5f5f0}
    .sub{font-family:'JetBrains Mono',monospace;font-size:23px;letter-spacing:0.08em;color:rgba(245,245,240,0.62);margin-top:14px}
    .sub b{color:#facc15}`
  const body = `
    <div class="lt">
      <img class="mini" src="${pepCelebrate}" alt="">
      <div class="ey"><img class="ap" src="${fdAperture}" alt="">Shot by Flickday Media</div>
      <div class="card">
        ${tag ? `<div class="tag"><span class="dot"></span>${tag}</div>` : ''}
        <div class="lead">${lead}</div>
        <div class="sub">${sub}</div>
      </div>
    </div>`
  return doc(1080, 1920, true, head, body)
}

function lowerThirdWide({ lead, sub, tag }) {
  const head = `
    .lt{position:absolute;left:96px;bottom:96px;max-width:1320px}
    .mini{position:absolute;right:-12px;top:-170px;height:250px;z-index:3;filter:drop-shadow(0 12px 24px rgba(0,0,0,0.55))}
    .ey{display:inline-flex;align-items:center;gap:12px;font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:0.22em;text-transform:uppercase;color:#facc15;margin-bottom:14px}
    .ey .ap{width:26px;height:26px}
    .card{position:relative;background:linear-gradient(110deg, rgba(7,7,7,0.88) 60%, rgba(7,7,7,0.66));backdrop-filter:blur(10px);border-radius:20px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 70px rgba(0,0,0,0.5);padding:30px 48px 32px 44px;overflow:hidden}
    .card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:linear-gradient(180deg,#4ade80,#facc15)}
    .tag{display:inline-flex;align-items:center;gap:12px;font-family:'Space Mono',monospace;font-size:20px;letter-spacing:0.24em;text-transform:uppercase;color:#4ade80;margin-bottom:8px}
    .tag .dot{width:10px;height:10px;border-radius:50%;background:#4ade80;box-shadow:0 0 12px #4ade80}
    .lead{font-family:'Bebas Neue',sans-serif;font-size:78px;line-height:0.92;letter-spacing:0.02em;color:#f5f5f0}
    .sub{font-family:'JetBrains Mono',monospace;font-size:21px;letter-spacing:0.08em;color:rgba(245,245,240,0.62);margin-top:12px}
    .sub b{color:#facc15}`
  const body = `
    <div class="lt">
      <img class="mini" src="${pepCelebrate}" alt="">
      <div class="ey"><img class="ap" src="${fdAperture}" alt="">Shot by Flickday Media</div>
      <div class="card">
        ${tag ? `<div class="tag"><span class="dot"></span>${tag}</div>` : ''}
        <div class="lead">${lead}</div>
        <div class="sub">${sub}</div>
      </div>
    </div>`
  return doc(1920, 1080, true, head, body)
}

/* ─────────────────────────  CORNER BUG (alpha)  ───────────────────────── */
function bug(w, h, pos) {
  return doc(w, h, true, `.wrap{position:absolute;${pos}}`, `<div class="wrap">${coBug(w > 1300 ? 0.92 : 1)}</div>`)
}

/* ─────────────────────────  OUTRO  ───────────────────────── */
function outroReel() {
  const head = `
    .frame{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px}
    .hero{width:520px;filter:drop-shadow(0 24px 56px rgba(0,0,0,0.6)) drop-shadow(0 0 60px rgba(74,222,128,0.26));margin-bottom:14px}
    .kick{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.4em;text-transform:uppercase;color:#4ade80;margin-bottom:18px;display:flex;align-items:center;gap:16px}
    .kick .ap{width:34px;height:34px;filter:drop-shadow(0 0 12px rgba(250,204,21,0.4))}
    .shot{font-family:'Anton',sans-serif;font-size:96px;line-height:0.9;color:#f5f5f0}
    .shot em{font-style:normal;color:#facc15;text-shadow:0 0 44px rgba(250,204,21,0.45)}
    .slogan{font-family:'Bebas Neue',sans-serif;font-size:60px;letter-spacing:0.04em;color:#4ade80;margin-top:24px;text-shadow:0 0 30px rgba(74,222,128,0.4)}
    .readout{font-family:'JetBrains Mono',monospace;font-size:23px;letter-spacing:0.26em;text-transform:uppercase;color:rgba(250,204,21,0.85);margin-top:30px}
    .div{width:90px;height:3px;background:linear-gradient(90deg,#4ade80,#facc15);border-radius:2px;margin:44px 0 0;box-shadow:0 0 20px rgba(250,204,21,0.5)}
    .gal{font-family:'Bebas Neue',sans-serif;font-size:52px;letter-spacing:0.06em;color:#f5f5f0;margin-top:36px}
    .gal b{color:#facc15}
    .foot{position:absolute;bottom:120px;left:0;right:0;display:flex;justify-content:center}
    .handles{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:30px;letter-spacing:0.04em}
    .handles .sep{color:rgba(255,255,255,0.3);margin:0 16px}
    .handles .g{color:#4ade80}.handles .y{color:#facc15}`
  const body = `
    ${darkBg}${sprockets(11)}
    <div class="frame">
      <img class="hero" src="${pepCelebrate}" alt="">
      <div class="kick"><img class="ap" src="${fdAperture}" alt="">Bell Pepper Open ${E.year}</div>
      <div class="shot">SHOT BY<br><em>FLICKDAY MEDIA</em></div>
      <div class="slogan">Every Day's a Flickday</div>
      <div class="readout">${E.readout}</div>
      <div class="div"></div>
      <div class="gal">Full gallery → <b>${E.gallery}</b></div>
    </div>
    <div class="foot"><div class="handles"><span class="g">${E.handle}</span><span class="sep">✕</span><span class="y">${E.media}</span></div></div>`
  return doc(1080, 1920, false, head, body)
}

function outroWide() {
  const head = `
    .frame{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:90px;padding:0 130px}
    .left{display:flex;flex-direction:column;align-items:center;flex:none}
    .hero{height:680px;filter:drop-shadow(0 24px 56px rgba(0,0,0,0.6)) drop-shadow(0 0 64px rgba(74,222,128,0.26))}
    .slogan{font-family:'Bebas Neue',sans-serif;font-size:52px;letter-spacing:0.04em;color:#4ade80;margin-top:14px;text-shadow:0 0 30px rgba(74,222,128,0.4)}
    .right{display:flex;flex-direction:column;align-items:flex-start;max-width:760px}
    .kick{font-family:'JetBrains Mono',monospace;font-size:24px;letter-spacing:0.4em;text-transform:uppercase;color:#4ade80;margin-bottom:26px;display:flex;align-items:center;gap:14px}
    .kick .ap{width:34px;height:34px;filter:drop-shadow(0 0 12px rgba(250,204,21,0.4))}
    .shot{font-family:'Anton',sans-serif;font-size:118px;line-height:0.86;color:#f5f5f0}
    .shot em{font-style:normal;color:#facc15;text-shadow:0 0 44px rgba(250,204,21,0.45)}
    .readout{font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:0.26em;text-transform:uppercase;color:rgba(250,204,21,0.85);margin-top:32px}
    .div{width:90px;height:3px;background:linear-gradient(90deg,#4ade80,#facc15);border-radius:2px;margin:34px 0;box-shadow:0 0 20px rgba(250,204,21,0.5)}
    .gal{font-family:'Bebas Neue',sans-serif;font-size:50px;letter-spacing:0.05em;color:#f5f5f0}
    .gal b{color:#facc15}
    .handles{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:27px;letter-spacing:0.04em;margin-top:26px}
    .handles .sep{color:rgba(255,255,255,0.3);margin:0 14px}
    .handles .g{color:#4ade80}.handles .y{color:#facc15}`
  const body = `
    ${darkBg}${sprockets(20)}
    <div class="frame">
      <div class="left">
        <img class="hero" src="${pepCelebrate}" alt="">
        <div class="slogan">Every Day's a Flickday</div>
      </div>
      <div class="right">
        <div class="kick"><img class="ap" src="${fdAperture}" alt="">Bell Pepper Open ${E.year}</div>
        <div class="shot">SHOT BY<br><em>FLICKDAY MEDIA</em></div>
        <div class="readout">${E.readout}</div>
        <div class="div"></div>
        <div class="gal">Full gallery → <b>${E.gallery}</b></div>
        <div class="handles"><span class="g">${E.handle}</span><span class="sep">✕</span><span class="y">${E.media}</span></div>
      </div>
    </div>`
  return doc(1920, 1080, false, head, body)
}

/* ─────────────────────────  render queue  ───────────────────────── */
const jobs = [
  { name: 'intro-reel', w: 1080, h: 1920, alpha: false, html: introReel() },
  { name: 'intro-wide', w: 1920, h: 1080, alpha: false, html: introWide() },
  { name: 'lowerthird-champs-reel', w: 1080, h: 1920, alpha: true,
    html: lowerThirdReel({ tag: 'Champions', lead: 'COLIN MERK · RYAN MERK · DAVE WIECZOREK', sub: 'Bell Pepper Open <b>2026</b> · 1st Place' }) },
  { name: 'lowerthird-champs-wide', w: 1920, h: 1080, alpha: true,
    html: lowerThirdWide({ tag: 'Champions', lead: 'COLIN MERK · RYAN MERK · DAVE WIECZOREK', sub: 'Bell Pepper Open <b>2026</b> · 1st Place' }) },
  { name: 'lowerthird-play-reel', w: 1080, h: 1920, alpha: true,
    html: lowerThirdReel({ tag: 'Play of the Day', lead: 'DIG → SET → CRANK', sub: 'Bell Pepper Open · <b>letspepper.com/gallery</b>' }) },
  { name: 'lowerthird-play-wide', w: 1920, h: 1080, alpha: true,
    html: lowerThirdWide({ tag: 'Play of the Day', lead: 'DIG → SET → CRANK', sub: 'Bell Pepper Open · <b>letspepper.com/gallery</b>' }) },
  { name: 'bug-reel', w: 1080, h: 1920, alpha: true, html: bug(1080, 1920, 'top:70px;left:60px') },
  { name: 'bug-wide', w: 1920, h: 1080, alpha: true, html: bug(1920, 1080, 'top:64px;left:80px') },
  { name: 'outro-reel', w: 1080, h: 1920, alpha: false, html: outroReel() },
  { name: 'outro-wide', w: 1920, h: 1080, alpha: false, html: outroWide() },
]

const browser = await chromium.launch()
console.log(`Rendering ${jobs.length} highlight overlays...\n`)
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 })
  const tmp = join(outDir, `_tmp.html`)
  writeFileSync(tmp, job.html)
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(outDir, `${job.name}.png`), omitBackground: job.alpha, clip: { x: 0, y: 0, width: job.w, height: job.h } })
  console.log(`✓ ${job.name}.png  (${job.w}x${job.h})${job.alpha ? '  alpha' : ''}`)
  await page.close()
  rmSync(tmp)
}
await browser.close()
console.log('\nDone. Highlight overlay kit in scripts/story-assets/highlights/')
