/**
 * One-shot ad-hoc publish: upload + queue + post in a single command.
 *
 *   node scripts/social-publish/post-now.mjs \
 *     --account letspepper --file /path/to/media.jpg \
 *     --caption "..." [--story] [--collab user,user] [--tag user,user] [--dry-run]
 *
 * Media type is inferred from the file extension (.jpg/.png → IMAGE,
 * .mp4/.mov → REELS); --story posts it as a Story instead (bare media —
 * the API ignores captions/tags on Stories, verified live 2026-07-20).
 * --tag on a feed IMAGE lands as a real Graph API tag dead-center on the
 * photo (post-reels.mjs's tagParams() supplies the x/y Meta requires for a
 * single image); pass {username,x,y} objects directly in the queue item
 * for a precise position instead of the CLI flag's flat username list.
 *
 * Composes the existing pipeline rather than reimplementing it: appends the
 * item to queue/adhoc.json (the permanent ad-hoc ledger), hosts the media on
 * the flickday-social R2 bucket via upload-r2.mjs (override with --bucket /
 * --public-base), then publishes exactly this item via post-reels.mjs --id.
 * Token: IG_ACCESS_TOKEN if set, else read from 1Password at runtime.
 * --dry-run prints the composed item and exits — nothing persisted, uploaded,
 * or posted.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const EVENT = 'adhoc'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, [])
)
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const account = typeof args.account === 'string' ? args.account : null
const file = typeof args.file === 'string' ? resolve(args.file) : null
const caption = typeof args.caption === 'string' ? args.caption : ''
const story = !!args.story
const dryRun = !!args['dry-run']
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev'

if (!account || !file) {
  console.error('Required: --account <slug> --file <path> [--caption "..."] [--story] [--collab u,u] [--tag u,u] [--dry-run]')
  process.exit(1)
}
const registry = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts
if (!registry[account]) { console.error(`Unknown account "${account}". Known: ${Object.keys(registry).join(', ')}`); process.exit(1) }
if (!existsSync(file)) { console.error(`No such file: ${file}`); process.exit(1) }

const KIND = { '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE', '.mp4': 'REELS', '.mov': 'REELS' }
const inferred = KIND[extname(file).toLowerCase()]
if (!inferred) { console.error(`Unsupported extension "${extname(file)}" — use jpg/jpeg/png/mp4/mov.`); process.exit(1) }
const media_type = story ? 'STORIES' : inferred
if (story && caption) console.warn('Note: Stories are bare media — the caption will not appear on the story.')

const queuePath = join(HERE, 'queue', `${EVENT}.json`)
const q = existsSync(queuePath)
  ? JSON.parse(readFileSync(queuePath, 'utf8'))
  : { event: EVENT, items: [], meta: { note: 'Ad-hoc one-shot posts published by post-now.mjs' } }

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
let id = `adhoc-${stamp}`
for (let n = 2; q.items.some((it) => it.id === id); n++) id = `adhoc-${stamp}-${n}`

const item = {
  id,
  account,
  media_type,
  file,
  caption: story ? '' : caption,
  video_url: null,
  image_url: null,
  user_tags: story ? [] : list(args.tag),
  collaborators: story ? [] : list(args.collab),
  scheduledAt: new Date().toISOString(),
  status: 'pending',
}

if (dryRun) {
  console.log(`[dry-run] would upload + publish to @${registry[account].handle}:\n`)
  console.log(JSON.stringify(item, null, 2))
  process.exit(0)
}

q.items.push(item)
writeFileSync(queuePath, JSON.stringify(q, null, 2))
console.log(`Queued ${id} [${media_type}] → @${registry[account].handle}\n`)

// Copy is part of the publish payload. Gate the rendered queue before any
// upload or Graph API mutation; a local queue write is recoverable, a live post
// is not. The contract limits JSON inspection to caption fields.
execFileSync('node', [join(HERE, '..', '..', 'tools', 'lib', 'encounter-audit.mjs'),
  `--root=${join(HERE, '..', '..')}`, '--surface=social publishing queue', '--strict'],
  { stdio: 'inherit' })

execFileSync('node', [join(HERE, 'upload-r2.mjs'),
  '--event', EVENT, '--bucket', bucket, '--prefix', EVENT, '--public-base', publicBase],
  { stdio: 'inherit' })

const token = process.env.IG_ACCESS_TOKEN ||
  execFileSync('op', ['read', 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'], { encoding: 'utf8' }).trim()

console.log('')
execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', EVENT, '--count', '1', '--id', id],
  { stdio: 'inherit', env: { ...process.env, IG_ACCESS_TOKEN: token } })
