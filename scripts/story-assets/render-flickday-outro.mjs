/**
 * Render Flickday Media outro / end cards for fading reels & highlights into (CapCut overlay).
 *
 * Brand assets (shell, transparent lockup, outputs) live in the flickdaymedia repo;
 * this render harness lives here because Playwright is installed in this repo.
 *
 *   node scripts/story-assets/render-flickday-outro.mjs
 *
 * Output (apps/flickdaymedia/flickday-assets/outro/):
 *   outro-reel.png       1080x1920  vertical — IG reels / TikTok / Shorts
 *   outro-highlight.png  1920x1080  horizontal — YouTube / highlight reels
 */
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const OUTRO = '/Users/nino/Workspace/dev/apps/flickdaymedia/flickday-assets/outro'
const shell = pathToFileURL(join(OUTRO, 'outro.html')).href
const lockup = pathToFileURL(join(OUTRO, 'lockup-transparent.png')).href

const READOUT = `f/2.8<span class="sep"> · </span>1/1000<span class="sep"> · </span>ISO 400<span class="sep"> · </span>24MM`

const cards = [
  {
    name: 'outro-reel',
    w: 1080,
    h: 1920,
    sprockets: 11,
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:64px;padding:0 90px;">
        <div class="kicker" style="font-size:26px;letter-spacing:0.42em;">Grassroots Sports Media</div>
        <img class="lockup" src="${lockup}" style="width:760px;height:auto;filter:drop-shadow(0 0 60px rgba(250,204,21,0.25));" alt="Flickday Media" />
        <div class="divider"></div>
        <div class="slogan" style="font-size:128px;">Every Day's<br/>a Flickday</div>
        <div class="readout" style="gap:8px;font-size:24px;letter-spacing:0.28em;margin-top:8px;">${READOUT}</div>
      </div>
      <div style="position:absolute;bottom:120px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div class="handle" style="font-size:34px;">@flickday.media</div>
        <div class="site" style="font-size:24px;">flickdaymedia.com</div>
      </div>`,
  },
  {
    name: 'outro-highlight',
    w: 1920,
    h: 1080,
    sprockets: 20,
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:50px;">
        <div class="kicker" style="font-size:24px;letter-spacing:0.46em;">Grassroots Sports Media</div>
        <img class="lockup" src="${lockup}" style="width:1000px;height:auto;filter:drop-shadow(0 0 70px rgba(250,204,21,0.25));" alt="Flickday Media" />
        <div class="slogan" style="font-size:96px;">Every Day's a Flickday</div>
        <div class="readout" style="gap:8px;font-size:24px;letter-spacing:0.3em;">${READOUT}</div>
      </div>
      <div style="position:absolute;bottom:78px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:36px;">
        <div class="handle" style="font-size:30px;">@flickday.media</div>
        <div class="site" style="font-size:24px;color:rgba(255,255,255,0.3);">·</div>
        <div class="site" style="font-size:26px;">flickdaymedia.com</div>
      </div>`,
  },
]

const browser = await chromium.launch()

for (const card of cards) {
  const page = await browser.newPage({ viewport: { width: card.w, height: card.h }, deviceScaleFactor: 1 })
  await page.goto(shell, { waitUntil: 'networkidle' })
  await page.evaluate(
    ({ html, w, h, sprockets }) => {
      document.body.style.width = w + 'px'
      document.body.style.height = h + 'px'
      document.getElementById('frame').innerHTML = html
      const fill = (id) => {
        const el = document.getElementById(id)
        el.innerHTML = Array.from({ length: sprockets }, () => '<span></span>').join('')
      }
      fill('spr-top')
      fill('spr-bot')
    },
    { html: card.html, w: card.w, h: card.h, sprockets: card.sprockets }
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUTRO, `${card.name}.png`), clip: { x: 0, y: 0, width: card.w, height: card.h } })
  console.log(`✓ ${card.name}.png  (${card.w}x${card.h})`)
  await page.close()
}

await browser.close()
console.log('\nDone. Outro cards in apps/flickdaymedia/flickday-assets/outro/')
