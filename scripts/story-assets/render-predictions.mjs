/**
 * Render Instagram story assets (1080x1920) for the Pepper Props / predictions page.
 *
 * Reuses the in-repo story-asset pattern: an on-brand HTML shell (predictions.html)
 * whose .frame is filled per-asset, then screenshotted with Playwright.
 *
 *   node scripts/story-assets/render-predictions.mjs
 *
 * Output: scripts/story-assets/predictions-*.png
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const shell = pathToFileURL(join(__dirname, 'predictions.html')).href

const HEAT = {
  bell: { c: '#4ade80', label: 'Bell · 1 pt' },
  jalapeno: { c: '#f97316', label: 'Jalapeño · 3 pts' },
  reaper: { c: '#dc2626', label: 'Reaper · 5 pts' },
}

const KEYS = ['A', 'B', 'C', 'D']

function optionsHtml(options, c) {
  return options
    .map(
      (o, i) =>
        `<div class="option" style="--c:${c}"><span class="key">${KEYS[i]}</span>${o}</div>`
    )
    .join('')
}

/** Asset definitions. Each returns the .frame innerHTML. */
const assets = [
  {
    name: 'predictions-announcement',
    vars: {
      '--glow-top': 'rgba(74,222,128,0.18)',
      '--glow-bot': 'rgba(74,222,128,0.10)',
      '--mascot-glow': 'rgba(74,222,128,0.40)',
      '--poblano': '#4ade80',
    },
    html: `
      <div class="brand"><span class="dot"></span>Let's Pepper</div>
      <div class="eyebrow">Predictions are open</div>
      <div class="badge"><span class="pulse"></span>Pepper Props</div>
      <div class="title">Make Your<br/><span class="accent">Picks</span></div>
      <div class="subtitle">Bell Pepper Open · June 7, 2026 — call the<br/>upsets, the celebrations, the chaos.</div>
      <div class="mascot-wrap"><img class="mascot" src="${pathToFileURL(join(__dirname, 'poblano-cutout.png')).href}" alt="" /></div>
      <div class="legend">
        <div class="tier" style="--c:${HEAT.bell.c}"><div class="pts">1<small>pt</small></div><div class="name">Bell</div><div class="desc">Safe call</div></div>
        <div class="tier" style="--c:${HEAT.jalapeno.c}"><div class="pts">3<small>pt</small></div><div class="name">Jalapeño</div><div class="desc">Bring the heat</div></div>
        <div class="tier" style="--c:${HEAT.reaper.c}"><div class="pts">5<small>pt</small></div><div class="name">Reaper</div><div class="desc">Go for glory</div></div>
      </div>
      <div class="footer">
        <div class="cta">Lock in your picks</div>
        <div class="url">letspepper.com/predictions</div>
      </div>`,
  },
  {
    name: 'predictions-prop-reaper',
    heat: 'reaper',
    vars: {
      '--glow-top': 'rgba(220,38,38,0.20)',
      '--glow-bot': 'rgba(220,38,38,0.12)',
    },
    html: `
      <div class="brand" style="color:#dc2626"><span class="dot" style="background:#dc2626;box-shadow:0 0 24px #dc2626"></span>Let's Pepper</div>
      <div class="prop-body">
        <div class="prop-heat" style="--c:${HEAT.reaper.c}">${HEAT.reaper.label}</div>
        <div class="question">Biggest upset:<br/>a first-time team<br/>wins it all?</div>
        <div class="options">${optionsHtml(['Yes', 'No way'], HEAT.reaper.c)}</div>
      </div>
      <div class="footer">
        <div class="cta">Call it before lock-in</div>
        <div class="url">letspepper.com/predictions</div>
      </div>`,
  },
  {
    name: 'predictions-prop-jalapeno',
    heat: 'jalapeno',
    vars: {
      '--glow-top': 'rgba(249,115,22,0.20)',
      '--glow-bot': 'rgba(249,115,22,0.12)',
    },
    html: `
      <div class="brand" style="color:#f97316"><span class="dot" style="background:#f97316;box-shadow:0 0 24px #f97316"></span>Let's Pepper</div>
      <div class="prop-body">
        <div class="prop-heat" style="--c:${HEAT.jalapeno.c}">${HEAT.jalapeno.label}</div>
        <div class="question">Photo of the day<br/>will feature:</div>
        <div class="options">${optionsHtml(['A diving save', 'A monster kill', 'A celebration', 'A candid sideline moment'], HEAT.jalapeno.c)}</div>
      </div>
      <div class="footer">
        <div class="cta">Make the call</div>
        <div class="url">letspepper.com/predictions</div>
      </div>`,
  },
  {
    name: 'predictions-prop-bell',
    heat: 'bell',
    vars: {
      '--glow-top': 'rgba(74,222,128,0.18)',
      '--glow-bot': 'rgba(74,222,128,0.10)',
    },
    html: `
      <div class="brand" style="color:#4ade80"><span class="dot" style="background:#4ade80;box-shadow:0 0 24px #4ade80"></span>Let's Pepper</div>
      <div class="prop-body">
        <div class="prop-heat" style="--c:${HEAT.bell.c}">${HEAT.bell.label}</div>
        <div class="question">Total pepper puns<br/>heard all day?</div>
        <div class="options">${optionsHtml(['0–5', '6–10', '11–20', '20+'], HEAT.bell.c)}</div>
      </div>
      <div class="footer">
        <div class="cta">You know it's a lot</div>
        <div class="url">letspepper.com/predictions</div>
      </div>`,
  },
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })

for (const asset of assets) {
  await page.goto(shell, { waitUntil: 'networkidle' })
  await page.evaluate(
    ({ html, vars }) => {
      const frame = document.getElementById('frame')
      frame.innerHTML = html
      for (const [k, v] of Object.entries(vars || {})) {
        document.querySelector('.glow').style.setProperty(k, v)
        document.body.style.setProperty(k, v)
      }
    },
    { html: asset.html, vars: asset.vars }
  )
  // Wait for fonts + mascot images to settle.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  const out = join(__dirname, `${asset.name}.png`)
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  console.log(`✓ ${asset.name}.png`)
}

await browser.close()
console.log('\nDone. 4 story assets in scripts/story-assets/')
