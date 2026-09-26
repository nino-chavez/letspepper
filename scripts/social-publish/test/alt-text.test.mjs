import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { altTextFromCaption, stripVisibleText, stripLikelyNames, stripQuotedSignage } from '../alt-text.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const RE7KHO = JSON.parse(readFileSync(join(HERE, 'fixtures', 're7kho-photos.json'), 'utf8'))

test('strips "number N" jersey mentions', () => {
  const out = altTextFromCaption('Players in black and white jerseys stand on the court, with one player in a black jersey with number 3 looking down.')
  assert.doesNotMatch(out, /number\s*3/i)
  assert.doesNotMatch(out, /\b3\b/)
})

test('strips "#N" and "No. N" jersey mentions', () => {
  assert.doesNotMatch(altTextFromCaption('A player wearing #12 digs the ball.'), /#12|\b12\b/)
  assert.doesNotMatch(altTextFromCaption('A player wearing No. 7 sets the ball.'), /No\.?\s*7|\b7\b/)
})

test('never quotes visible_text when it is supplied', () => {
  const out = altTextFromCaption('A player named Sikora spikes the ball near a Wildcats banner.', { visibleText: ['Sikora', 'Wildcats'] })
  assert.doesNotMatch(out, /Sikora/)
  assert.doesNotMatch(out, /Wildcats/)
})

test('the Title-Case backstop strips a likely name pair when visible_text is unavailable', () => {
  const out = stripLikelyNames('A player, John Sikora, digs the ball near the net.')
  assert.doesNotMatch(out, /John Sikora/)
})

test('the Title-Case backstop leaves an ordinary sentence-initial capital alone', () => {
  const out = stripLikelyNames('Players in blue jerseys stand near the net.')
  assert.match(out, /^Players in blue jerseys/)
})

test('stripVisibleText is whole-word and case-insensitive', () => {
  assert.equal(stripVisibleText('LEWIS is on the left, lewis again', ['Lewis']), ' is on the left,  again')
})

test('strips a quoted banner/signage transcription — measured live on Re7kho: "A banner reads \\"CENTRAL CATHOLIC TIGERS.\\""', () => {
  const caption = 'Players in blue and yellow uniforms celebrate on the court, with one player jumping in the air. A banner reads "CENTRAL CATHOLIC TIGERS."'
  const out = altTextFromCaption(caption)
  assert.doesNotMatch(out, /CENTRAL CATHOLIC TIGERS/)
  assert.doesNotMatch(out, /"/)
  assert.match(out, /celebrate on the court/)
})

test('stripQuotedSignage removes any quoted span and its "X reads" lead-in clause', () => {
  assert.doesNotMatch(stripQuotedSignage('A scoreboard reads "48-12" behind the net.'), /48-12/)
  assert.doesNotMatch(stripQuotedSignage('A player in a jersey that reads "LEWIS" digs the ball.'), /LEWIS/)
})

test('returns null for empty or missing captions', () => {
  assert.equal(altTextFromCaption(''), null)
  assert.equal(altTextFromCaption(null), null)
  assert.equal(altTextFromCaption(undefined), null)
})

test('truncates to the 1000-char Instagram alt_text limit', () => {
  const long = 'A player spikes the ball. '.repeat(60)
  const out = altTextFromCaption(long)
  assert.ok(out.length <= 1000)
})

test('every caption in the real Re7kho fixture produces alt text with no digit-based jersey number surviving', () => {
  let produced = 0
  for (const p of RE7KHO) {
    const out = altTextFromCaption(p.caption)
    if (out) {
      produced++
      assert.doesNotMatch(out, /\bnumber\s+\d+\b/i, p.caption)
      assert.doesNotMatch(out, /#\d+\b/, p.caption)
      assert.doesNotMatch(out, /["“]/, p.caption)
    }
  }
  assert.ok(produced > 100, `expected most of the 120 captions to produce alt text, got ${produced}`)
})
