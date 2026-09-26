import assert from 'node:assert/strict'
import test from 'node:test'
import { createAlbumSlug, slugify, accountForSeries, appendGalleryAnnounceItem, main } from '../build-gallery-announce.mjs'

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

// --- main(), against the real live album (network) --------------------------
// These hit the real public gallery API and album page, the same endpoints
// build-album-carousel.mjs already reads from with no DB credential. No R2
// upload, no queue write, no Graph/wrangler call happens in --dry-run — that
// contract is the thing under test.

test('main(): refuses without --series, before any network call', async () => {
  await assert.rejects(() => main(['--album-key', 'Re7kho']), /Required: --series/)
})

test('main(): refuses without --album-key', async () => {
  await assert.rejects(() => main(['--series', 'other']), /Required: --album-key/)
})

test('main(): --dry-run on the real Re7kho album produces a manifest and touches nothing else', { timeout: 30_000 }, async () => {
  const result = await main(['--album-key', 'Re7kho', '--series', 'other', '--dry-run', '--count', '3'])
  assert.equal(result.manifest.account, 'ninophoto')
  assert.equal(result.manifest.collaborators[0], 'flickday.media')
  assert.equal(result.manifest.selected.length, 3)
  assert.match(result.manifest.assets, /^3 of \d+$/)
  assert.ok(result.manifest.selected.every((s) => /imagedelivery\.net/.test(s.url)), 'dry-run must use the unhosted imagedelivery.net URL, never R2')
  assert.ok(result.manifest.selected.every((s) => /NOT yet re-hosted/.test(s.source)))
  assert.doesNotMatch(result.manifest.caption, /tag yourselves/i)
  assert.equal(result.manifest.gallery_url, 'https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho')
})

test('main(): refuses an unlisted/private album (album page 404) rather than announcing it', { timeout: 30_000 }, async () => {
  await assert.rejects(
    () => main(['--album-key', 'thisAlbumKeyShouldNotExist999', '--series', 'other', '--dry-run']),
    /is not public|could not confirm/,
  )
})
