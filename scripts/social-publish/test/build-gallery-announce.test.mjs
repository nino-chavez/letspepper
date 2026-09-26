import assert from 'node:assert/strict'
import test, { beforeEach, afterEach } from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAlbumSlug, slugify, accountForSeries, appendGalleryAnnounceItem, main } from '../build-gallery-announce.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RE7KHO = JSON.parse(readFileSync(join(HERE, 'fixtures', 're7kho-photos.json'), 'utf8'))
const RE7KHO_ALBUM_NAME = 'HS Girls VB - JCA at ACC - 09-22-2026'
const SITE = 'https://ninochavez.co/photography'

/** Stubs the exact two endpoints build-gallery-announce.mjs reads — the public
 * /api/album-photos page-mode payload and the album page's og:title — with the
 * real Re7kho fixture (pulled live 2026-09-25, same file select-gallery-photos
 * and alt-text tests use). No live network in this test file. */
function stubFetch({ albumKey = 'Re7kho', albumName = RE7KHO_ALBUM_NAME, photos = RE7KHO } = {}) {
  return async (url) => {
    const u = String(url)
    if (u.includes('/api/album-photos')) {
      if (!u.includes(`albumKey=${albumKey}`)) return Response.json({ photos: [] }) // a different key: no photos
      const page = Number(new URL(u).searchParams.get('page') || '1')
      return Response.json({ photos: page === 1 ? photos : [], totalCount: photos.length })
    }
    if (u.endsWith(`/albums/${albumKey}`)) {
      return new Response(`<meta property="og:title" content="${albumName} | Nino Chavez Photography">`, { status: 200 })
    }
    if (u.includes('/albums/')) return new Response('not found', { status: 404 }) // any other album key: unlisted/nonexistent
    throw new Error(`stubFetch: unexpected URL ${u}`)
  }
}

let originalFetch
beforeEach(() => { originalFetch = globalThis.fetch })
afterEach(() => { globalThis.fetch = originalFetch })

test('slugify/createAlbumSlug replicate the photography site\'s own src/lib/utils.ts exactly', () => {
  // Verified live 2026-09-25: this exact slug 200s at
  // https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho
  assert.equal(slugify('HS Girls VB - JCA at ACC - 09-22-2026'), 'hs-girls-vb-jca-at-acc-09-22-2026')
  assert.equal(createAlbumSlug('HS Girls VB - JCA at ACC - 09-22-2026', 'Re7kho'), 'hs-girls-vb-jca-at-acc-09-22-2026-Re7kho')
  assert.equal(createAlbumSlug("Lewis vs Pepperdine - Winter 2026", 'pHqw25'), 'lewis-vs-pepperdine-winter-2026-pHqw25')
})

test('accountForSeries: letspepper for lpo, nino.chavez.photo\'s slug for everything else', () => {
  assert.equal(accountForSeries('lpo'), 'letspepper')
  assert.equal(accountForSeries('other'), 'ninophoto')
  assert.equal(accountForSeries(undefined), 'ninophoto')
})

test('appendGalleryAnnounceItem: adds a new item, keeps every existing one exactly as it was', () => {
  const queue = { event: 'gallery-announce', items: [{ id: 'album-1-gallery-announce', status: 'posted', ig_media_id: 'x' }] }
  const { queue: next } = appendGalleryAnnounceItem(queue, { id: 'album-2-gallery-announce', status: 'held' })
  assert.equal(next.items.length, 2)
  assert.deepEqual(next.items[0], queue.items[0])
  assert.equal(next.items[1].id, 'album-2-gallery-announce')
})

test('appendGalleryAnnounceItem: refuses a duplicate id rather than double-adding the album', () => {
  const queue = { items: [{ id: 'album-1-gallery-announce' }] }
  const r = appendGalleryAnnounceItem(queue, { id: 'album-1-gallery-announce' })
  assert.match(r.refused, /already in queue\/gallery-announce\.json/)
})

test('appendGalleryAnnounceItem: an empty/missing queue just gets the one item', () => {
  const { queue } = appendGalleryAnnounceItem(undefined, { id: 'album-1-gallery-announce' })
  assert.equal(queue.items.length, 1)
  assert.equal(queue.event, 'gallery-announce')
})

// --- main(), against a stubbed fetch (the real Re7kho fixture, no live network) ---
// build-gallery-announce.mjs itself has been run live against the real album
// separately (see the report) to prove the endpoints and the slug/URL it
// derives are real; these tests exercise its LOGIC deterministically, offline,
// and — critically — write their manifest to a throwaway tmp path via --out,
// never to the repo's real .temp/gallery-announce-Re7kho.dry-run.json (a run of
// this test file must never silently overwrite that deliverable with a
// --count 3 test manifest).

test('main(): refuses without --series, before any network call', async () => {
  await assert.rejects(() => main(['--album-key', 'Re7kho']), /Required: --series/)
})

test('main(): refuses without --album-key', async () => {
  await assert.rejects(() => main(['--series', 'other']), /Required: --album-key/)
})

test('main(): --dry-run produces a manifest at --out and touches nothing else', async () => {
  globalThis.fetch = stubFetch()
  const dir = mkdtempSync(join(tmpdir(), 'gallery-announce-build-test-'))
  const out = join(dir, 'manifest.json')
  try {
    const result = await main(['--album-key', 'Re7kho', '--series', 'other', '--dry-run', '--count', '3', '--out', out])
    assert.equal(result.outPath, out)
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).account, 'ninophoto')
    assert.equal(result.manifest.account, 'ninophoto')
    assert.equal(result.manifest.collaborators[0], 'flickday.media')
    assert.equal(result.manifest.selected.length, 3)
    assert.match(result.manifest.assets, /^3 of \d+$/)
    assert.ok(result.manifest.selected.every((s) => /imagedelivery\.net/.test(s.url)), 'dry-run must use the unhosted imagedelivery.net URL, never R2')
    assert.ok(result.manifest.selected.every((s) => /NOT yet re-hosted/.test(s.source)))
    assert.doesNotMatch(result.manifest.caption, /tag yourselves/i)
    assert.equal(result.manifest.gallery_url, 'https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('main(): refuses an unlisted/private album (album page 404) rather than announcing it', async () => {
  globalThis.fetch = stubFetch() // only Re7kho's album page resolves; anything else 404s
  await assert.rejects(
    () => main(['--album-key', 'thisAlbumKeyShouldNotExist999', '--series', 'other', '--dry-run']),
    /is not public|could not confirm/,
  )
})

// One live check, against the real site, that the endpoints and the derived
// slug/URL are real — not a mock's opinion of them. Gated behind an env var so
// `pnpm test:social` stays fully offline by default (that's the point of the
// stub above); set LIVE_NETWORK=1 to actually hit the real site.
test('live: the real album page for the derived Re7kho slug actually resolves (200, not 404)',
  { timeout: 15_000, skip: !process.env.LIVE_NETWORK && 'set LIVE_NETWORK=1 to run this against the real site' },
  async () => {
    const res = await fetch(`${SITE}/albums/${createAlbumSlug(RE7KHO_ALBUM_NAME, 'Re7kho')}`)
    assert.equal(res.status, 200)
  })
