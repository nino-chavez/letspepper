/**
 * Rewrite captions for PENDING queue items with real variation, so a fast drip
 * doesn't post byte-identical captions/hashtags (an Instagram spam signal).
 *
 *   node scripts/social-publish/vary-captions.mjs --event bell-pepper-2026
 *
 * Posted items are never touched. Hook / CTA / hashtag subset rotate on
 * different cycles so consecutive posts differ in all three. Edit the pools
 * below to taste, then re-run — it only refreshes items with status==='pending'.
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
  'Grass triples, full send. 🌶️',
  'Dig. Set. Crank. Repeat.',
  'This is what a Sunday on the grass looks like.',
  'Bell Pepper Open — the season opener went off.',
  '3v3, no refs, all heart.',
  'When the pass is on, anything is possible.',
  'Pancakes, pokes, and pure chaos. 🏐',
  'Sideout volleyball at its finest.',
  'The grass was greener at the Bell Pepper Open.',
  'Hot start to the season. 🌶️🔥',
  'Aurora showed up — so did the highlights.',
  'Triples season is officially open.',
  'Every rally earned.',
  'Big swings, bigger energy.',
]
const CTAS = [
  // Mix of gallery links + self-tag nudges. Self-tagging is the distribution
  // engine: participants ID themselves (no per-clip tagging work for us) and
  // their tags/comments feed reach. Gallery is the canonical "where's my highlight".
  'Full gallery → letspepper.com/gallery',
  'Find your team → letspepper.com/gallery',
  'See your squad? Tag your crew 👇',
  'Spot yourself? Drop your @ below 👇',
  'Who do you see? Tag your team 👇',
  'Catch the full set → letspepper.com/gallery · tag your crew 👇',
  'More from the day → letspepper.com/gallery',
]
const CREDITS = ['📸 @flickday.media', 'Shot by @flickday.media 📸', 'Captured by @flickday.media']
const TAGS = [
  '#letspepper', '#grassvolleyball', '#volleyball', '#beachvolleyball', '#avp',
  '#volleyballreels', '#grasstriples', '#3v3', '#volleyballlife', '#digsetspike',
  '#summervolleyball', '#volleyballcommunity', '#peppertime', '#ballislife', '#sideout',
]
// rotate a window over the tag pool so each post gets a different mix (always leads with #letspepper)
function tagsFor(i) {
  const pool = TAGS.slice(1)
  const start = (i * 3) % pool.length
  const pick = []
  for (let k = 0; k < 6; k++) pick.push(pool[(start + k) % pool.length])
  return ['#letspepper', ...pick].join(' ')
}

const caption = (i) =>
  `${HOOKS[i % HOOKS.length]}\n\nBell Pepper Open 2026 · grass triples · Aurora, IL\n` +
  `${CTAS[(i * 2) % CTAS.length]}\n\n${CREDITS[i % CREDITS.length]}\n\n${tagsFor(i)}`

const p = join(HERE, 'queue', `${event}.json`)
if (!existsSync(p)) { console.error(`No queue: ${p}`); process.exit(1) }
const q = JSON.parse(readFileSync(p, 'utf8'))
let n = 0
q.items.forEach((it, i) => { if (it.status === 'pending') { it.caption = caption(i); n++ } })
writeFileSync(p, JSON.stringify(q, null, 2))
console.log(`Refreshed ${n} pending captions (posted items untouched).`)
console.log('--- sample ---\n' + q.items.find((it) => it.status === 'pending').caption)
