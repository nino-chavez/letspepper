import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { parseAlbumName, buildGalleryAnnounceCaption } from '../gallery-announce-caption.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')
const REPO = join(SOCIAL, '..', '..')

const RE7KHO_ALBUM_NAME = 'HS Girls VB - JCA at ACC - 09-22-2026'

test('parseAlbumName: pulls the teams and a readable date out of the real Re7kho album name', () => {
  const { teams, eventDateLabel, title } = parseAlbumName(RE7KHO_ALBUM_NAME)
  assert.equal(teams, 'JCA at ACC')
  assert.equal(eventDateLabel, 'Sept. 22, 2026')
  assert.equal(title, 'HS Girls VB')
})

test('parseAlbumName: never throws on an unfamiliar shape, returns nulls instead', () => {
  const r = parseAlbumName('Some Random Album Title')
  assert.equal(r.teams, null)
  assert.equal(r.eventDateLabel, null)
  assert.equal(r.title, 'Some Random Album Title')
})

test('caption: never contains a player name, a score, or "tag yourselves"', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: RE7KHO_ALBUM_NAME, galleryUrl: 'https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho',
    selectedOf: '8 of 120', series: 'other',
  })
  assert.doesNotMatch(caption, /tag yourselves/i)
  assert.doesNotMatch(caption, /\bwon\b|\bwins\b|\bdefeat|\bscore\b|\bfinal\b/i)
  assert.match(caption, /JCA at ACC/)
  assert.match(caption, /Sept\. 22, 2026/)
  assert.match(caption, /8 of 120/)
})

test('caption: links the direct album URL, not letspepper.com/gallery, when the album is not in the letspepper series', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: RE7KHO_ALBUM_NAME, galleryUrl: 'https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho',
    selectedOf: '8 of 120', series: 'other',
  })
  assert.doesNotMatch(caption, /letspepper\.com\/gallery/)
  assert.match(caption, /ninochavez\.co\/photography\/albums\/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho/)
})

test('caption: links letspepper.com/gallery when the album IS in the letspepper series', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: 'Bell Pepper Open - Teams A at B - 09-22-2026', galleryUrl: 'https://ninochavez.co/photography/albums/whatever-abc123',
    selectedOf: '8 of 40', series: 'lpo',
  })
  assert.match(caption, /letspepper\.com\/gallery/)
  assert.doesNotMatch(caption, /ninochavez\.co\/photography\/albums/, 'no direct album link when routed to letspepper.com/gallery')
})

test('caption: --venue and --teams override the parsed album name', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: RE7KHO_ALBUM_NAME, venue: 'Angels Christian Academy', teams: 'Jesuit Catholic vs. Angels Christian',
    selectedOf: '8 of 120', series: 'other',
  })
  assert.match(caption, /Jesuit Catholic vs\. Angels Christian/)
  assert.match(caption, /Angels Christian Academy/)
})

// --- the real reader-contract gate ------------------------------------------

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'gallery-caption-audit-'))
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true })
  mkdirSync(join(root, 'scripts', 'social-publish', 'queue'), { recursive: true })
  cpSync(join(REPO, 'tools', 'lib', 'encounter-audit.mjs'), join(root, 'tools', 'lib', 'encounter-audit.mjs'))
  cpSync(join(REPO, 'reader-contract.json'), join(root, 'reader-contract.json'))
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('the generated Re7kho caption passes pnpm reader:check:social (--strict) unmodified', () => {
  const caption = buildGalleryAnnounceCaption({
    albumName: RE7KHO_ALBUM_NAME, galleryUrl: 'https://ninochavez.co/photography/albums/hs-girls-vb-jca-at-acc-09-22-2026-Re7kho',
    selectedOf: '8 of 120', series: 'other',
  })
  const sb = sandbox()
  try {
    writeFileSync(join(sb.root, 'scripts', 'social-publish', 'queue', 'gallery-announce.json'),
      JSON.stringify({ event: 'gallery-announce', items: [{ id: 'Re7kho-gallery-announce', caption }] }, null, 2))
    // Throws (non-zero exit) on any BLOCK, or on any WARN under --strict — exactly
    // what post-reels.mjs's inline encounter-audit call, and `pnpm reader:check:social`,
    // both enforce before a real publish.
    execFileSync('node', [join(sb.root, 'tools', 'lib', 'encounter-audit.mjs'),
      `--root=${sb.root}`, '--surface=social publishing queue', '--strict'], { stdio: 'pipe' })
  } finally { sb.cleanup() }
})
