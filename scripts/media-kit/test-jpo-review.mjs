#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCREENSHOT = process.argv.includes('--screenshot')
  ? join(ROOT, 'creative', 'editor-kits', 'capcut', 'jpo-review', 'jpo-review-tested.png')
  : null
const DETAIL_SCREENSHOT = process.argv.includes('--screenshot')
  ? join(ROOT, 'creative', 'editor-kits', 'capcut', 'jpo-review', 'jpo-review-detail-tested.png')
  : null

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
await page.addInitScript(() => localStorage.clear())

try {
  await page.goto(`http://127.0.0.1:${port}/creative/editor-kits/capcut/jpo-review/`, { waitUntil: 'networkidle' })
  await page.locator('.clip-card').first().waitFor()
  assert.equal(await page.locator('.clip-card').count(), 138)
  assert.equal(await page.locator('.stat').nth(2).locator('strong').textContent(), '15')
  assert.equal(await page.locator('.stat').nth(3).locator('strong').textContent(), '10')
  assert.equal(await page.locator('.stat').nth(4).locator('strong').textContent(), '9')

  await page.locator('#ratingFilter').selectOption('shortlist')
  assert.equal(await page.locator('.clip-card').count(), 25)

  await page.locator('#search').fill('C2353')
  assert.equal(await page.locator('.clip-card').count(), 1)
  await page.locator('[data-open="C2353"]').click()
  await page.locator('#detailDialog[open]').waitFor()
  assert.equal(await page.locator('#detailTitle').textContent(), 'C2353.MP4')
  assert.equal(await page.locator('#detailType').inputValue(), 'defense')
  assert.match(await page.locator('#keepReason').inputValue(), /commits to the grass/i)
  assert.match(await page.locator('#detailMeta').textContent(), /1080×1920 · 119\.88 fps/)
  assert.equal(await page.locator('.video-shell').getAttribute('class'), 'video-shell')

  await page.locator('[data-detail-rating="B"]').click()
  assert.equal(await page.locator('.stat').nth(2).locator('strong').textContent(), '14')
  assert.equal(await page.locator('.stat').nth(3).locator('strong').textContent(), '11')
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'))
  if (DETAIL_SCREENSHOT) await page.locator('#detailDialog').screenshot({ path: DETAIL_SCREENSHOT })

  await page.locator('[data-detail-rating="A"]').click()
  assert.equal(await page.locator('.stat').nth(2).locator('strong').textContent(), '15')
  assert.equal(await page.locator('.stat').nth(3).locator('strong').textContent(), '10')

  await page.locator('.dialog-close-row button').click()
  if (SCREENSHOT) {
    await page.locator('#search').fill('')
    await page.locator('#ratingFilter').selectOption('all')
    await page.screenshot({ path: SCREENSHOT, fullPage: true })
  }
  console.log(`✓ JPO Footage Desk browser test passed${SCREENSHOT ? ` · ${SCREENSHOT}` : ''}`)
} finally {
  await page.close()
  await browser.close()
  await new Promise((resolveClose) => server.close(resolveClose))
}
