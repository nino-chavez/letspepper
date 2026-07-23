#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCREENSHOT = process.argv.includes('--screenshot')
  ? join(ROOT, 'creative', 'editor-kits', 'capcut', 'clip-mapper', 'clip-desk-tested.png')
  : null

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
  let path = resolve(ROOT, `.${pathname}`)
  if (path !== ROOT && !path.startsWith(`${ROOT}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html')
  if (!existsSync(path) || !statSync(path).isFile()) {
    response.writeHead(404).end('Not found')
    return
  }
  response.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' })
  createReadStream(path).pipe(response)
})

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const port = server.address().port
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(`http://127.0.0.1:${port}/creative/editor-kits/capcut/clip-mapper/`, { waitUntil: 'networkidle' })
  const values = {
    file: 'demo-ace.mp4',
    clip_id: 'demo-001',
    event: 'Demo Event',
    event_date: '2026-01-01',
    team_a: 'Northline',
    team_b: 'Sideout',
    players: 'Jordan Lee',
    participant_handles: '@demo.player',
    court: 'Court 2',
    round: 'Quarterfinal',
    score: '18–16',
    outcome: 'Northline wins the point',
    clip_in: '0:02.000',
    moment_time: '0:04.250',
    clip_out: '0:06.500',
    footage_credit: '@demo.creator',
    editor_credit: '@demo.editor',
  }
  for (const [field, value] of Object.entries(values)) await page.locator(`[data-field="${field}"]`).fill(value)
  await page.locator('[data-field="play_type"]').selectOption('ace')
  await page.locator('[data-field="rights_status"]').selectOption('approved')
  await page.locator('[data-field="copy_status"]').selectOption('approved')
  await page.locator('[data-field="caption_action"]').selectOption('gallery')

  await page.getByText('Ready to cut', { exact: true }).waitFor()
  const caption = await page.locator('#caption-copy').textContent()
  assert.match(caption, /Clean from the line\./)
  assert.match(caption, /Northline vs Sideout/)
  assert.match(caption, /Footage: @demo\.creator\./)
  assert.doesNotMatch(caption, /\{[^}]+\}|\bundefined\b|\bnull\b/)
  assert.equal(await page.locator('#stamp-preview').getAttribute('src'), '/creative/exports/media-kit-v1/capcut/moments/ace.png')
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))

  if (SCREENSHOT) await page.screenshot({ path: SCREENSHOT, fullPage: true })
  console.log(`✓ Clip Desk browser test passed${SCREENSHOT ? ` · ${SCREENSHOT}` : ''}`)
} finally {
  await page.close()
  await browser.close()
  await new Promise((resolveClose) => server.close(resolveClose))
}
