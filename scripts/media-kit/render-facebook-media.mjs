#!/usr/bin/env node

import { chromium } from 'playwright'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { assertPageReady, localFonts, requiredAsset, verifyPng } from '../story-assets/preflight.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const APPS = resolve(ROOT, '..')
const OUT = join(ROOT, 'creative', 'exports', 'facebook')
const TMP = join(OUT, '.render-tmp')

const FLICKDAY = join(APPS, 'flickdaymedia')
const PHOTOGRAPHY = join(APPS, 'photography')
const PHOTO = {
  grassReceive: join(TMP, 'grass-receive.jpg'),
  grassCourt: join(TMP, 'grass-court.jpg'),
  flickdayBeach: join(FLICKDAY, 'images', 'gallery', 'portfolio-16.jpg'),
  flickdayServe: join(FLICKDAY, 'images', 'gallery', 'portfolio-17.jpg'),
  flickdayNight: join(FLICKDAY, 'images', 'gallery', 'portfolio-23.jpg'),
  flickdayBlock: join(FLICKDAY, 'images', 'gallery', 'portfolio-29.jpg'),
}
const PHOTO_SOURCE = {
  grassReceive: 'https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-MKbtxb7/0/MGmNvWrKdGFhbQHwBwWM7DkpqR8LRnQhv9kjQ59RR/X3/lpo-green-pepper-2025-003-X3.jpg',
  grassCourt: 'https://photos.smugmug.com/Sports/Volleyball/Grass/LPO/Bell-Pepper-Open-20250719/i-kTh9bRS/0/LTtD3WCXjvSmKKVqJ3bzwJG7Cvb6MvDLdhwRk4GHn/X3/lpo-green-pepper-2025-231-X3.jpg',
}
const ASSET = {
  poblano: join(ROOT, 'public', 'images', 'mascots', 'anime', 'poblano-verde', 'champion.png'),
  flickdayWordmark: join(FLICKDAY, 'flickday-assets', 'brand', 'modular-wordmarks', 'flickday-core-color.svg'),
  flickdayProfile: join(FLICKDAY, 'flickday-assets', 'site', 'favicon', 'android-chrome-512x512.png'),
  ninoMark: join(PHOTOGRAPHY, 'src', 'lib', 'assets', 'favicon.svg'),
}

const FAMILIES = ['Bebas Neue', 'Anton', 'Space Mono']
const FONTS = localFonts(...FAMILIES)
const manifest = []

mkdirSync(TMP, { recursive: true })

async function download(source, destination) {
  const response = await fetch(source)
  if (!response.ok) throw new Error(`failed to download ${source}: HTTP ${response.status}`)
  writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
}

await Promise.all([
  download(PHOTO_SOURCE.grassReceive, PHOTO.grassReceive),
  download(PHOTO_SOURCE.grassCourt, PHOTO.grassCourt),
])

function url(path) {
  return requiredAsset(path)
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function document({ width, height, body, css = '' }) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${FONTS}
        *{box-sizing:border-box}
        html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#070707;color:#f4f1e8}
        body{position:relative;font-family:'Space Mono',monospace;-webkit-font-smoothing:antialiased}
        img{display:block}
        .display{font-family:'Anton',sans-serif;text-transform:uppercase}
        .condensed{font-family:'Bebas Neue',sans-serif;text-transform:uppercase}
        .mono{text-transform:uppercase;letter-spacing:.16em}
        .grain{position:absolute;inset:0;pointer-events:none;opacity:.11;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitchTiles'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.72'/%3E%3C/svg%3E");background-size:280px}
        ${css}
      </style>
    </head>
    <body>${body}</body>
  </html>`
}

const browser = await chromium.launch({ headless: true })

async function capture({ name, width, height, body, css = '' }) {
  const html = join(TMP, `${name}.html`)
  const output = join(OUT, `${name}.png`)
  writeFileSync(html, document({ width, height, body, css }))
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
  await assertPageReady(page, FAMILIES)
  await page.screenshot({ path: output, clip: { x: 0, y: 0, width, height } })
  await page.close()
  verifyPng(output, { width, height })
  manifest.push({ file: `${name}.png`, width, height })
  console.log(`✓ ${name}.png · ${width}×${height}`)
}

function pepperMark(color = '#a3e635') {
  return `<span class="pepper-mark" style="color:${color}"></span>`
}

const pepperMarkCss = `
  .pepper-mark{width:34px;height:48px;border:5px solid currentColor;border-radius:48% 48% 60% 60%;transform:rotate(-8deg);position:relative;display:inline-block}
  .pepper-mark:before{content:'';position:absolute;width:20px;height:12px;border-top:5px solid currentColor;border-radius:50%;left:12px;top:-15px;transform:rotate(-24deg)}
`

// Facebook Event covers render at roughly 1.91:1. All critical copy stays well
// inside the canvas so it remains readable in Facebook's list and detail crops.
await capture({
  name: 'poblano-event-cover',
  width: 1920,
  height: 1005,
  css: `
    ${pepperMarkCss}
    .photo{position:absolute;inset:0 0 0 49%;width:51%;height:100%;object-fit:cover;object-position:50% 56%;filter:saturate(.88) contrast(1.08)}
    .photo-wash{position:absolute;inset:0;background:linear-gradient(90deg,#071006 0 45%,rgba(7,16,6,.92) 53%,rgba(7,16,6,.04) 83%),linear-gradient(0deg,rgba(7,7,7,.55),transparent 42%)}
    .lime-rule{position:absolute;left:0;top:0;bottom:0;width:22px;background:linear-gradient(#a3e635,#facc15,#f97316)}
    .top{position:absolute;left:112px;right:104px;top:82px;display:flex;align-items:center;justify-content:space-between}
    .brand{display:flex;align-items:center;gap:20px;font-size:25px;font-weight:700;letter-spacing:.18em}
    .date{font-size:24px;font-weight:700;color:#facc15}
    .copy{position:absolute;left:112px;top:205px;width:1040px}
    .eyebrow{font-size:25px;font-weight:700;color:#a3e635;letter-spacing:.22em;text-transform:uppercase}
    h1{margin:22px 0 0;font-family:'Anton';font-size:145px;line-height:.82;letter-spacing:-.01em;text-transform:uppercase;text-wrap:balance}
    .season{display:inline-block;margin-top:34px;padding:14px 20px 13px;background:#a3e635;color:#071006;font-size:25px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .details{position:absolute;left:112px;bottom:102px;width:1180px;display:grid;grid-template-columns:max-content 1fr;gap:14px 28px;font-size:23px;line-height:1.3;text-transform:uppercase;letter-spacing:.08em}
    .label{color:#a3e635;font-weight:700}.value{color:#f4f1e8}
    .cta{position:absolute;right:104px;bottom:90px;background:#f97316;color:#070707;padding:20px 26px;font-family:'Bebas Neue';font-size:34px;letter-spacing:.08em;text-transform:uppercase;transform:rotate(-1.5deg)}
    .mascot{position:absolute;right:68px;bottom:44px;width:455px;height:810px;object-fit:contain;object-position:center bottom;filter:drop-shadow(0 28px 44px rgba(0,0,0,.68))}
  `,
  body: `
    <img class="photo" src="${url(PHOTO.grassReceive)}" alt="">
    <div class="photo-wash"></div>
    <div class="lime-rule"></div>
    <div class="top">
      <div class="brand">${pepperMark()}<span>LET'S PEPPER</span></div>
      <div class="date mono">SATURDAY · 08.01.26</div>
    </div>
    <div class="copy">
      <div class="eyebrow">Grass triples · Aurora, Illinois</div>
      <h1>POBLANO<br>PEPPER OPEN</h1>
      <div class="season">The season closes here.</div>
    </div>
    <div class="details">
      <span class="label">Check-in</span><span class="value">8:30 AM</span>
      <span class="label">First serve</span><span class="value">9:00 AM</span>
      <span class="label">Location</span><span class="value">Nature Meadows Park</span>
    </div>
    <img class="mascot" src="${url(ASSET.poblano)}" alt="">
    <div class="cta">REGISTER · LETSPEPPER.COM</div>
    <div class="grain"></div>
  `,
})

// Page covers use Facebook's wide desktop ratio. Brand and campaign essentials
// remain in the centered mobile-safe region; side photography is bonus context.
await capture({
  name: 'letspepper-page-cover',
  width: 3280,
  height: 1250,
  css: `
    ${pepperMarkCss}
    .photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 58%;filter:saturate(.82) contrast(1.1)}
    .wash{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,7,7,.18),rgba(7,7,7,.84) 31% 69%,rgba(7,7,7,.18)),linear-gradient(0deg,rgba(7,7,7,.72),transparent 46%,rgba(7,7,7,.26))}
    .safe{position:absolute;left:50%;top:0;bottom:0;width:1680px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;text-align:center}
    .copy{position:relative;margin-top:-10px}
    .brand{display:flex;justify-content:center;align-items:center;gap:28px;font-size:31px;font-weight:700;letter-spacing:.2em}
    .eyebrow{margin-top:56px;color:#a3e635;font-size:29px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
    h1{margin:22px 0 0;font-family:'Anton';font-size:164px;line-height:.83;text-transform:uppercase;letter-spacing:-.015em}
    .tagline{margin:30px auto 0;width:max-content;padding:16px 28px 14px;background:#a3e635;color:#070707;font-family:'Bebas Neue';font-size:45px;letter-spacing:.08em;text-transform:uppercase}
    .meta{margin-top:32px;font-size:26px;font-weight:700;letter-spacing:.13em;text-transform:uppercase}
    .side{position:absolute;top:82px;font-size:23px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
    .left{left:84px}.right{right:84px;color:#facc15}
    .bottom-rule{position:absolute;left:0;right:0;bottom:0;height:22px;background:linear-gradient(90deg,#4ade80,#a3e635 44%,#facc15 68%,#f97316)}
  `,
  body: `
    <img class="photo" src="${url(PHOTO.grassCourt)}" alt="">
    <div class="wash"></div>
    <div class="side left">SUMMER · 2026</div>
    <div class="side right">LET'SPEPPER.COM</div>
    <div class="safe"><div class="copy">
      <div class="brand">${pepperMark()}<span>LET'S PEPPER</span></div>
      <div class="eyebrow">Season finale · August 1 · Aurora</div>
      <h1>POBLANO<br>PEPPER OPEN</h1>
      <div class="tagline">The season closes here.</div>
      <div class="meta">Grass triples · Check-in 8:30 AM · First serve 9:00 AM</div>
    </div></div>
    <div class="bottom-rule"></div>
    <div class="grain"></div>
  `,
})

await capture({
  name: 'flickday-page-cover',
  width: 3280,
  height: 1250,
  css: `
    .panels{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr 1fr}
    .panels img{width:100%;height:100%;object-fit:cover;filter:saturate(.8) contrast(1.13)}
    .panels img:nth-child(1){object-position:50% 49%}.panels img:nth-child(2){object-position:50% 48%}.panels img:nth-child(3){object-position:50% 45%}
    .wash{position:absolute;inset:0;background:linear-gradient(90deg,rgba(17,19,24,.34),rgba(17,19,24,.91) 27% 73%,rgba(17,19,24,.34)),linear-gradient(0deg,rgba(17,19,24,.62),transparent 54%)}
    .safe{position:absolute;left:50%;top:0;bottom:0;width:1680px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;text-align:center}
    .copy{width:1420px}
    .wordmark{width:760px;height:205px;object-fit:contain;margin:0 auto}
    .kicker{margin-top:40px;color:#ffc719;font-size:29px;font-weight:700;letter-spacing:.25em;text-transform:uppercase}
    h1{margin:18px 0 0;font-family:'Anton';font-size:162px;line-height:.88;text-transform:uppercase}
    .tagline{margin-top:34px;color:#f7f4ed;font-size:29px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
    .site{position:absolute;right:84px;top:78px;color:#ffc719;font-size:23px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
    .rail{position:absolute;left:0;bottom:0;width:100%;height:24px;background:#ffc719}
  `,
  body: `
    <div class="panels">
      <img src="${url(PHOTO.flickdayBeach)}" alt="">
      <img src="${url(PHOTO.flickdayServe)}" alt="">
      <img src="${url(PHOTO.flickdayNight)}" alt="">
    </div>
    <div class="wash"></div>
    <div class="site">FLICKDAYMEDIA.COM</div>
    <div class="safe"><div class="copy">
      <img class="wordmark" src="${url(ASSET.flickdayWordmark)}" alt="Flickday">
      <div class="kicker">Grassroots sports media</div>
      <h1>EVERY DAY'S<br>A FLICKDAY</h1>
      <div class="tagline">Raw · Fast · Player-first</div>
    </div></div>
    <div class="rail"></div>
    <div class="grain"></div>
  `,
})

await capture({
  name: 'nino-page-cover',
  width: 3280,
  height: 1250,
  css: `
    .photos{position:absolute;inset:0;display:grid;grid-template-columns:1fr 1.14fr 1fr}
    .photos img{width:100%;height:100%;object-fit:cover;filter:saturate(.55) contrast(1.18)}
    .photos img:nth-child(1){object-position:50% 40%}.photos img:nth-child(2){object-position:50% 53%;filter:grayscale(1) contrast(1.14)}.photos img:nth-child(3){object-position:50% 46%}
    .wash{position:absolute;inset:0;background:linear-gradient(90deg,rgba(24,24,27,.2),rgba(24,24,27,.93) 29% 71%,rgba(24,24,27,.2)),linear-gradient(0deg,rgba(24,24,27,.64),transparent 48%)}
    .safe{position:absolute;left:50%;top:0;bottom:0;width:1680px;transform:translateX(-50%);display:flex;align-items:center;justify-content:center;text-align:center}
    .mark{width:142px;height:142px;margin:0 auto 30px;filter:drop-shadow(0 14px 24px rgba(0,0,0,.48))}
    .kicker{color:#facc15;font-size:27px;font-weight:700;letter-spacing:.24em;text-transform:uppercase}
    h1{margin:22px 0 0;font-family:'Anton';font-size:183px;line-height:.84;text-transform:uppercase}
    .tagline{margin:34px auto 0;width:max-content;border-top:4px solid #facc15;border-bottom:4px solid #facc15;padding:20px 14px 17px;font-family:'Bebas Neue';font-size:47px;letter-spacing:.1em;text-transform:uppercase}
    .site{position:absolute;right:84px;top:78px;color:#facc15;font-size:23px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .rail{position:absolute;left:0;bottom:0;width:100%;height:22px;background:linear-gradient(90deg,#eab308,#facc15,#eab308)}
  `,
  body: `
    <div class="photos">
      <img src="${url(PHOTO.flickdayBlock)}" alt="">
      <img src="${url(PHOTO.grassCourt)}" alt="">
      <img src="${url(PHOTO.flickdayServe)}" alt="">
    </div>
    <div class="wash"></div>
    <div class="site">PHOTOGRAPHY.NINOCHAVEZ.CO</div>
    <div class="safe"><div>
      <img class="mark" src="${url(ASSET.ninoMark)}" alt="">
      <div class="kicker">Action sports photography</div>
      <h1>NINO CHAVEZ</h1>
      <div class="tagline">Motion. Emotion. Frame by Frame.</div>
    </div></div>
    <div class="rail"></div>
    <div class="grain"></div>
  `,
})

await capture({
  name: 'flickday-profile',
  width: 1024,
  height: 1024,
  css: `
    body{background:#111318}
    .halo{position:absolute;inset:92px;border-radius:50%;background:#ffc719;box-shadow:0 0 0 24px #111318,0 0 0 31px rgba(255,199,25,.28)}
    .icon{position:absolute;inset:178px;width:668px;height:668px;object-fit:contain;border-radius:132px;filter:drop-shadow(0 24px 32px rgba(0,0,0,.28))}
  `,
  body: `<div class="halo"></div><img class="icon" src="${url(ASSET.flickdayProfile)}" alt="Flickday"><div class="grain"></div>`,
})

await capture({
  name: 'nino-profile',
  width: 1024,
  height: 1024,
  css: `
    body{background:#18181b}
    .halo{position:absolute;inset:90px;border-radius:50%;background:radial-gradient(circle,#27272a 0 56%,#18181b 57%);box-shadow:0 0 0 7px #facc15,0 0 0 28px #18181b}
    .mark{position:absolute;inset:174px;width:676px;height:676px;object-fit:contain;filter:drop-shadow(0 28px 34px rgba(0,0,0,.38))}
  `,
  body: `<div class="halo"></div><img class="mark" src="${url(ASSET.ninoMark)}" alt="Nino Chavez Photography"><div class="grain"></div>`,
})

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  purpose: 'Facebook Page and Event media',
  assets: manifest,
}, null, 2)}\n`)

await browser.close()
rmSync(TMP, { recursive: true, force: true })
