/**
 * Render per-team Instagram Story announcement cards for the Bell Pepper Open.
 *
 * Uses the BPO roster brand template (bpo-template.png) as the background and
 * composites each men's team roster into a fresh neon names box, one PNG per team.
 *
 *   node scripts/story-assets/teams/render-team-cards.mjs
 *
 * Data: bpo-mens.csv (exported from the men's tab of the roster sheet).
 * Output: team-NN-<slug>.png (1080x1920).
 */
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const shell = pathToFileURL(join(__dirname, 'card.html')).href
const bg = pathToFileURL(join(__dirname, 'bpo-template.png')).href

/** Minimal CSV line parser handling quoted fields with embedded commas. */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
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
  out.push(cur)
  return out
}

const csv = readFileSync(join(__dirname, 'bpo-mens.csv'), 'utf8').split(/\r?\n/)
const teams = []
for (const line of csv) {
  if (!line.trim()) continue
  const f = parseCsvLine(line)
  // columns: ['', '#', 'Team List', 'Status', ...]
  const num = (f[1] || '').trim()
  const players = (f[2] || '').trim()
  const status = (f[3] || '').trim()
  if (!/^\d+$/.test(num) || !players) continue
  const names = players
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s.toUpperCase() !== 'TBD')
  if (!names.length) continue
  teams.push({ num: num.padStart(2, '0'), names, status })
}

console.log(`Parsed ${teams.length} teams.\n`)

function slug(names) {
  return names[0].toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '')
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
await page.goto(shell, { waitUntil: 'networkidle' })
await page.evaluate((src) => { document.getElementById('bg').src = src }, bg)
await page.waitForLoadState('networkidle')
await page.evaluate(() => document.fonts.ready)

for (const team of teams) {
  await page.evaluate((names) => {
    const box = document.getElementById('box')
    box.innerHTML = names.map((n) => `<div class="name">${n}</div>`).join('')
    // Fit: scale font down until the longest line fits the box interior width.
    const style = getComputedStyle(box)
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    const inner = box.clientWidth - padX
    let fs = names.length >= 4 ? 58 : 66
    box.style.fontSize = fs + 'px'
    const lines = [...box.querySelectorAll('.name')]
    const maxw = Math.max(...lines.map((l) => l.scrollWidth))
    if (maxw > inner) {
      fs = Math.floor(fs * (inner / maxw))
      box.style.fontSize = fs + 'px'
    }
  }, team.names)
  await page.waitForTimeout(120)
  const name = `team-${team.num}-${slug(team.names)}`
  await page.screenshot({ path: join(__dirname, `${name}.png`), clip: { x: 0, y: 0, width: 1080, height: 1920 } })
  console.log(`✓ ${name}.png  [${team.status}]  ${team.names.join(', ')}`)
}

await browser.close()
console.log('\nDone. Team cards in scripts/story-assets/teams/')
