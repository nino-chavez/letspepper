/**
 * One-shot ad-hoc publish: upload + queue + post in a single command.
 *
 *   node scripts/social-publish/post-now.mjs \
 *     --account letspepper --file /path/to/media.jpg \
 *     --caption "..." --graph-route "<Nino's words>" \
 *     [--alt-text "..."] [--cover /path/to/cover.jpg] [--story] [--collab user,user] [--tag user,user] [--prepare-only] [--dry-run]
 *
 *   node scripts/social-publish/post-now.mjs --release /path/to/release.json --graph-route "<Nino's words>" [--prepare-only] [--dry-run]
 *
 * --release <path> publishes from a reviewed release package (release-contract.mjs) and nothing
 * else: account, media, caption, mentions, tags, collaborators, audio, cover and delivery all come
 * from the file, so every content flag is refused beside it. The media is hashed again here and
 * the item is checked against the file's review record; any difference is refused with exit
 * code 4 before the queue write, naming the field (2026-10-18: the TPS Reel went out from the
 * wrong export, with an older caption, no tags, and at once instead of Sunday 7am CT, and every
 * check passed). Delivery comes from the file too — there is no silent "now" default: an
 * immediate delivery publishes as before, a scheduled one is queued and hosted for its time and
 * left for post-reels.mjs to publish when due.
 *
 * --graph-route is REQUIRED. An ad hoc post to one of Nino's accounts goes out
 * by hand (native Instagram or Meta Business Suite — the `meta-publish` skill
 * owns the choice) unless he named the Graph API for it. Pass what he said; it
 * is recorded on the ledger item. Without it this script refuses before it
 * writes the queue, uploads to R2, or calls Meta (route-gate.mjs, exit code 3).
 *
 * --alt-text sets the screen-reader text on a feed IMAGE (post-reels.mjs sends it as
 * the container's alt_text, which Meta supports on a single image). It is refused on a
 * Story or a video, where Meta has no alt text field, rather than silently dropped.
 *
 * --prepare-only uploads and waits for Meta to finish an unpublished container.
 * --audio-id <numeric-id> attaches selected Instagram catalog music to a Reel;
 * --audio-volume / --video-volume are optional integers 1–100. See SETUP.md.
 * It saves the queue item ID. Publish or retry that item with post-reels.mjs --id;
 * re-running post-now creates another item and can duplicate the post.
 *
 * Media type is inferred from the file extension (.jpg/.png → IMAGE,
 * .mp4/.mov → REELS); --story posts it as a Story instead. Stories support
 * --tag mentions, but no caption, collaborators, or link/poll/location sticker.
 * --tag on a feed IMAGE lands as a real Graph API tag dead-center on the
 * photo (post-reels.mjs's tagParams() supplies the x/y Meta requires for a
 * single image); pass {username,x,y} objects directly in the queue item
 * for a precise position instead of the CLI flag's flat username list.
 *
 * Composes the existing pipeline rather than reimplementing it: appends the
 * item to queue/adhoc.json (the permanent ad-hoc ledger, kept in the main
 * checkout even from a linked worktree; see queue-dir.mjs), hosts the media on
 * the flickday-social R2 bucket via upload-r2.mjs (override with --bucket /
 * --public-base), then publishes exactly this item via post-reels.mjs --id.
 * Token: IG_ACCESS_TOKEN if set, else read from 1Password at runtime.
 * --dry-run prints the composed item and exits — nothing persisted, uploaded,
 * or posted.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRouteBeforeBuild } from './route-gate.mjs'
import { queueDir, queueCheckout } from './queue-dir.mjs'
import { updateQueueFile } from './queue-store.mjs'
import { audioConfiguration, audioFromArgs } from './reel-audio.mjs'
import { loadRelease, measure, releaseItem, verify, refusalText, describeDelivery, ReleaseError, REFUSED_RELEASE } from './release-contract.mjs'

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
const dryRun = !!args['dry-run']
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev'

// --release: the package owns the content. A flag that would set any of it is refused outright —
// not compared, not merged — so the post cannot be the file plus whatever was typed beside it.
const releasePath = typeof args.release === 'string' ? resolve(args.release) : null
const OWNED_BY_RELEASE = { account: 'account', file: 'source.file', caption: 'caption', 'alt-text': 'alt_text', story: 'media_type', cover: 'cover', collab: 'collaborators', tag: 'user_tags', 'audio-id': 'audio_configuration', 'audio-volume': 'audio_configuration', 'video-volume': 'audio_configuration' }
if (releasePath) {
  for (const [flag, field] of Object.entries(OWNED_BY_RELEASE)) {
    if (args[flag] !== undefined) { console.error(`--${flag} cannot be combined with --release: the release file owns ${field}. Edit the file and review it again instead.`); process.exit(1) }
  }
}
let fromRelease = null // { release, dir, measured } — the package as read and the media as it is on disk now
if (releasePath) {
  try { const { release, dir } = loadRelease(releasePath); fromRelease = { release, dir, measured: measure(release, dir, { path: releasePath }) } }
  catch (e) { console.error(e instanceof ReleaseError ? e.message : `--release: ${e.message}`); process.exit(e instanceof ReleaseError ? e.exitCode : 1) }
}
const account = fromRelease ? fromRelease.release.account : typeof args.account === 'string' ? args.account : null
const file = fromRelease ? fromRelease.measured.file : typeof args.file === 'string' ? resolve(args.file) : null
const caption = fromRelease ? fromRelease.release.caption : typeof args.caption === 'string' ? args.caption : ''
const altText = fromRelease ? (fromRelease.release.alt_text || '').trim() : typeof args['alt-text'] === 'string' ? args['alt-text'].trim() : ''
const story = fromRelease ? fromRelease.release.media_type === 'STORIES' : !!args.story
const coverFile = fromRelease ? fromRelease.measured.cover_file : typeof args.cover === 'string' ? resolve(args.cover) : null
const userTags = fromRelease ? fromRelease.release.user_tags : list(args.tag)
const collaborators = fromRelease ? fromRelease.release.collaborators : list(args.collab)

if (!account || !file) {
  console.error('Required: --account <slug> --file <path> --graph-route "<Nino\'s words>" [--caption "..."] [--alt-text "..."] [--story] [--collab u,u] [--tag u,u] [--cover cover.jpg] [--prepare-only] [--dry-run]\n    or: --release <release.json> --graph-route "<Nino\'s words>" [--prepare-only] [--dry-run]')
  process.exit(1)
}
const registry = JSON.parse(readFileSync(join(HERE, 'accounts.json'), 'utf8')).accounts
if (!registry[account]) { console.error(`Unknown account "${account}". Known: ${Object.keys(registry).join(', ')}`); process.exit(1) }
if (!existsSync(file)) { console.error(`No such file: ${file}`); process.exit(1) }

const KIND = { '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.png': 'IMAGE', '.mp4': 'REELS', '.mov': 'REELS' }
const inferred = KIND[extname(file).toLowerCase()]
if (!inferred) { console.error(`Unsupported extension "${extname(file)}" — use jpg/jpeg/png/mp4/mov.`); process.exit(1) }
const media_type = story ? 'STORIES' : inferred
if (coverFile && (media_type !== 'REELS' || !/\.jpe?g$/i.test(coverFile) || !existsSync(coverFile))) {
  console.error('--cover requires an existing JPEG and applies to a Reel only.'); process.exit(1)
}
if (story && collaborators.length) {
  console.error('Stories support mentions (--tag), but cannot carry collaborators.'); process.exit(1)
}
if (altText && media_type !== 'IMAGE') {
  console.error(`--alt-text applies to a feed image only; Meta has no alt text on ${media_type}.`)
  process.exit(1)
}
if (story && caption) console.warn('Note: the caption will not appear on a Story; render its text into the media.')
let audio
try {
  audio = fromRelease
    ? (fromRelease.release.audio_configuration ? audioConfiguration({ media_type, audio_configuration: fromRelease.release.audio_configuration }) : undefined)
    : audioFromArgs(args, media_type)
} catch (error) { console.error(error.message); process.exit(1) }

const queuePath = join(queueDir(), `${EVENT}.json`)
const q = existsSync(queuePath)
  ? JSON.parse(readFileSync(queuePath, 'utf8'))
  : { event: EVENT, items: [], meta: { note: 'Ad-hoc one-shot posts published by post-now.mjs' } }

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
let id = `adhoc-${stamp}`
for (let n = 2; q.items.some((it) => it.id === id); n++) id = `adhoc-${stamp}-${n}`

// From a package, the item is built by release-contract.mjs so that what review() digested and
// what is published here are one function's output; scheduledAt comes from `delivery`. Without
// one, an ad hoc post is due the moment it is queued, as it always was.
const item = fromRelease ? releaseItem(fromRelease.release, fromRelease.measured, { id, now: new Date(), path: releasePath }) : {
  id,
  account,
  media_type,
  file,
  ...(coverFile ? { cover_file: coverFile, cover_url: null } : {}),
  caption: story ? '' : caption,
  ...(altText ? { alt_text: altText } : {}),
  ...(audio ? { audio_configuration: audio } : {}),
  video_url: null,
  image_url: null,
  user_tags: userTags,
  collaborators: story ? [] : collaborators,
  scheduledAt: new Date().toISOString(),
  status: 'pending',
}

// Every post-now item is a one-off, so each needs its own route. Checked before
// the queue write and the R2 upload — the first two side effects — and on
// --dry-run as well. The receipt itself is written by post-reels.mjs, which gets
// the reason passed through and records it only once it is about to publish.
assertRouteBeforeBuild({ event: EVENT, account, reasonFlag: args['graph-route'], script: 'post-now.mjs' })

// Release contract, after the route and before the first side effect, on --dry-run too: the media
// as it is on disk and the item as it will be queued, against the package's review record. Exit
// code 4 names the field. Routing says whether this publisher may be used; this says whether what
// it is about to send is what was reviewed.
const dueAt = fromRelease ? new Date(item.scheduledAt).getTime() : 0
const scheduledAhead = fromRelease && dueAt > Date.now()
if (fromRelease) {
  const problems = verify(fromRelease.release, item, fromRelease.measured)
  if (problems.length) { console.error(refusalText(releasePath, problems)); process.exit(REFUSED_RELEASE) }
  console.log(`Release contract ok — ${releasePath} matches its review record (${item.release.review.digest}); delivery: ${describeDelivery(item.release.delivery)}`)
  if (scheduledAhead && args['prepare-only']) {
    console.error(`--prepare-only cannot prepare a post scheduled for ${describeDelivery(item.release.delivery)}: a Meta container made now expires before then. Queue it without --prepare-only; post-reels.mjs publishes it when due.`)
    process.exit(1)
  }
}

if (dryRun) {
  console.log(`[dry-run] would upload + ${scheduledAhead ? `queue for ${item.scheduledAt}` : 'publish'} to @${registry[account].handle}:\n`)
  console.log(JSON.stringify(item, null, 2))
  console.log(`\nroute: one-off, "${args['graph-route']}" — recorded on the item by post-reels.mjs when it publishes`)
  process.exit(0)
}

// Another session may have appended since the read above; take the id again under the lock so two
// posts in the same minute never share one ledger entry.
updateQueueFile(queuePath, q, (fresh) => {
  for (let n = 2; fresh.items.some((it) => it.id === item.id); n++) item.id = `adhoc-${stamp}-${n}`
  id = item.id
  fresh.items.push(item)
})
console.log(`Queued ${id} [${media_type}] → @${registry[account].handle}\n`)

// Copy is part of the publish payload. Gate the rendered queue before any
// upload or Graph API mutation; a local queue write is recoverable, a live post
// is not. The contract limits JSON inspection to caption fields.
execFileSync('node', [join(HERE, '..', '..', 'tools', 'lib', 'encounter-audit.mjs'),
  `--root=${queueCheckout()}`, '--surface=social publishing queue', '--strict'],
  { stdio: 'inherit' })

execFileSync('node', [join(HERE, 'upload-r2.mjs'),
  '--event', EVENT, '--bucket', bucket, '--prefix', `${EVENT}/${account}/${id}`, '--public-base', publicBase],
  { stdio: 'inherit' })

// A scheduled delivery: queued and hosted, nothing published. post-reels.mjs treats the item as due
// at its scheduledAt and re-checks it against the same review record then; --force cannot pull a
// release-bound schedule forward. The one-off reason is given again on that run, because the
// receipt is written at publish time and would go stale on a long wait.
if (scheduledAhead) {
  console.log(`\nQueued and hosted; not published — due ${describeDelivery(item.release.delivery)} (${item.scheduledAt}).`)
  console.log('When due, publish it with:')
  console.log(`  IG_ACCESS_TOKEN=$(op read "${registry[account].token_ref || 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'}") \\`)
  console.log(`    node scripts/social-publish/post-reels.mjs --event adhoc --id ${id} --count 1 --graph-route "<Nino's words>"`)
  console.log('--force does not pull it forward: the delivery time is part of what was reviewed.')
  process.exit(0)
}

const token = process.env.IG_ACCESS_TOKEN ||
  execFileSync('op', ['read', registry[account].token_ref || 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'], { encoding: 'utf8' }).trim()

console.log('')
execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', EVENT, '--count', '1', '--id', id, '--graph-route', args['graph-route'], ...(args['prepare-only'] ? ['--prepare-only'] : [])],
  { stdio: 'inherit', env: { ...process.env, IG_ACCESS_TOKEN: token } })
