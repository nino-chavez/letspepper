/**
 * Rewrite captions for PENDING queue items that do not yet have clip-specific
 * copy. This is a neutral fallback, not a substitute for identifying the play.
 *
 *   node scripts/social-publish/vary-captions.mjs --event bell-pepper-2026
 *
 * Posted items and captions marked copy_status==='approved' are never touched.
 * The current Instagram limit is five hashtags, so this generator always emits
 * five specific tags and avoids broad tags that do not describe grass triples.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((a, t, i, arr) => {
  if (t.startsWith('--')) { const n = arr[i + 1]; a.push([t.slice(2), n === undefined || n.startsWith('--') ? true : n]) }
  return a
}, []))
const event = args.event
if (!event) { console.error('Required: --event <slug>'); process.exit(1) }

const HOOKS = [
  'One rally from the 2026 Bell Pepper Open.',
  'A point from the grass in Aurora.',
  'Bell Pepper Open, viewed from court level.',
  'From the first event of the 2026 series.',
  'Grass triples from the Bell Pepper Open.',
  'One more look at the Bell Pepper Open.',
  'From a Sunday on the grass in Aurora.',
  'Bell Pepper Open, one point at a time.',
  'A courtside view from the Bell Pepper Open.',
  'Back to the grass at the Bell Pepper Open.',
]
const CTAS = [
  'Full gallery: letspepper.com/gallery',
  'Find your team: letspepper.com/gallery',
  'Recognize the players? Tag the team.',
  'In this rally? Add your handle below.',
  'Know the team? Tag them below.',
  'More from the day: letspepper.com/gallery',
]
const CREDIT = 'Footage: @flickday.media.'
const TAGS = '#letspepper #grassvolleyball #grasstriples #chicagovolleyball #volleyball'

const caption = (i) =>
  `${HOOKS[i % HOOKS.length]}\n\nBell Pepper Open 2026 · grass triples · Aurora, IL\n` +
  `${CTAS[(i * 2) % CTAS.length]}\n\n${CREDIT}\n\n${TAGS}`

const p = join(HERE, 'queue', `${event}.json`)
if (!existsSync(p)) { console.error(`No queue: ${p}`); process.exit(1) }
const q = JSON.parse(readFileSync(p, 'utf8'))
let n = 0
q.items.forEach((it, i) => {
  if (it.status === 'pending' && it.copy_status !== 'approved') {
    it.caption = caption(i)
    n++
  }
})
writeFileSync(p, JSON.stringify(q, null, 2))
console.log(`Refreshed ${n} pending captions (posted items untouched).`)
const sample = q.items.find((it) => it.status === 'pending')
if (sample) console.log('--- sample ---\n' + sample.caption)
