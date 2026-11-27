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
 * A release with a Facebook destination (release-contract.mjs `destinations`, `facebook`) also
 * publishes to the account's paired Page, with the Page's own reviewed caption, through
 * post-reels.mjs. The Page credential (FB_ACCESS_TOKEN, else accounts.json fb_token_ref) and the
 * Instagram one are both read before the queue write, so neither destination can go out while
 * the other was never going to. --facebook-draft saves a Facebook-only Reel as a Page DRAFT
 * instead of publishing it — the proof run. An unknown flag is refused rather than ignored.
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
import { assertItemMatchesPackage, assertLocalFiles, validateReviewPackage } from './review-package.mjs'
import { loadRelease, measure, releaseItem, verify, refusalText, describeDelivery, destinationsOf, ReleaseError, REFUSED_RELEASE } from './release-contract.mjs'

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
// A flag this script does not know is refused, not ignored: a mistyped --facebook-draft would
// otherwise fall through to a live publish.
const KNOWN_FLAGS = ['account', 'file', 'caption', 'alt-text', 'story', 'cover', 'collab', 'tag', 'audio-id', 'audio-volume', 'video-volume',
  'prepare-only', 'dry-run', 'release', 'review-package', 'graph-route', 'bucket', 'public-base', 'facebook-draft']
for (const flag of Object.keys(args)) {
  if (!KNOWN_FLAGS.includes(flag)) { console.error(`Unknown flag --${flag}; nothing was queued, uploaded or published. post-now.mjs takes: ${KNOWN_FLAGS.map((f) => `--${f}`).join(' ')}`); process.exit(1) }
}
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])
const dryRun = !!args['dry-run']
const bucket = typeof args.bucket === 'string' ? args.bucket : 'flickday-social'
const publicBase = typeof args['public-base'] === 'string' ? args['public-base'] : 'https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev'
const reviewPackage = typeof args['review-package'] === 'string'
  ? JSON.parse(readFileSync(resolve(args['review-package']), 'utf8')) : null

// --release: the package owns the content. A flag that would set any of it is refused outright —
// not compared, not merged — so the post cannot be the file plus whatever was typed beside it.
const releasePath = typeof args.release === 'string' ? resolve(args.release) : null
if (releasePath && reviewPackage) { console.error('Choose one release package format: --release or --review-package, not both.'); process.exit(3) }
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

// Destinations come from the package; without one, a post-now post is Instagram only, as always.
const dests = fromRelease ? destinationsOf(fromRelease.release) : ['instagram']
const toInstagram = dests.includes('instagram'), toFacebook = dests.includes('facebook')
const facebookDraft = !!args['facebook-draft']
if (facebookDraft) {
  const r = fromRelease?.release
  if (!r || toInstagram || !toFacebook || r.media_type !== 'REELS' || r.delivery?.immediate !== true || args['prepare-only']) {
    console.error('--facebook-draft saves a Facebook-only Reel (destinations ["facebook"], delivery {"immediate": true}) as a Page draft, so nothing goes live anywhere. ' +
      `${!r ? 'It needs --release.' : toInstagram ? 'This package also publishes to Instagram.' : r.media_type !== 'REELS' ? `This package is a ${r.media_type}.` : args['prepare-only'] ? 'It cannot be combined with --prepare-only.' : 'This package is scheduled.'} Nothing was queued, uploaded or published.`)
    process.exit(1)
  }
}
if (args['prepare-only'] && !toInstagram) { console.error('--prepare-only prepares an Instagram container, and this package has no Instagram destination. Nothing was queued, uploaded or published.'); process.exit(1) }

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
if (reviewPackage) {
  try {
    validateReviewPackage(reviewPackage, { approved: true }); assertLocalFiles(reviewPackage)
    if (reviewPackage.account !== account || reviewPackage.media_type !== media_type || resolve(reviewPackage.media.file) !== file || reviewPackage.caption !== (story ? '' : caption) || JSON.stringify(reviewPackage.user_tags || []) !== JSON.stringify(list(args.tag)) || JSON.stringify(reviewPackage.collaborators || []) !== JSON.stringify(story ? [] : list(args.collab))) throw new Error('CLI account, media, caption, tags, or collaborators differ from reviewed package')
    const selectedAudio = audio ? { representation: 'native', configuration: audio } : { representation: reviewPackage.audio.representation === 'embedded' ? 'embedded' : 'none' }
    if (JSON.stringify(reviewPackage.audio || { representation: 'none' }) !== JSON.stringify(selectedAudio)) throw new Error('CLI audio differs from reviewed package')
    if ((reviewPackage.cover?.file || null) !== (coverFile || null)) throw new Error('CLI cover differs from reviewed package')
  } catch (error) { console.error(`REFUSED — ${error.message}`); process.exit(3) }
}

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
  ...(reviewPackage ? { review_package: reviewPackage, review_package_digest: reviewPackage.digest, review_binding: { version: 1, package_digest: reviewPackage.digest } } : {}),
}
if (reviewPackage) {
  try { assertItemMatchesPackage(item, reviewPackage, 'immediate') }
  catch (error) { console.error(`REFUSED — ${error.message}`); process.exit(3) }
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
// A scheduled time already more than LATE_GRACE_MS behind is refused inside verify(): it does not
// fall through to the immediate path. Within the grace it is due, and publishes now as the file said.
const dueAt = fromRelease ? new Date(item.scheduledAt).getTime() : 0
const scheduledAhead = fromRelease && dueAt > Date.now()
if (fromRelease) {
  const problems = verify(fromRelease.release, item, fromRelease.measured, { now: new Date() })
  if (problems.length) { console.error(refusalText(releasePath, problems)); process.exit(REFUSED_RELEASE) }
  console.log(`Release contract ok — ${releasePath} matches its review record (${item.release.review.digest}); delivery: ${describeDelivery(item.release.delivery)}`)
  if (scheduledAhead && args['prepare-only']) {
    console.error(`--prepare-only cannot prepare a post scheduled for ${describeDelivery(item.release.delivery)}: a Meta container made now expires before then. Queue it without --prepare-only; post-reels.mjs publishes it when due.`)
    process.exit(1)
  }
}

const IG_REF = registry[account].token_ref || 'op://Developer Secrets/Meta Lets Pepper Instagram Publisher/credential'
const FB_REF = registry[account].fb_token_ref || null
const where = [toInstagram && `@${registry[account].handle}`, toFacebook && `the Facebook Page ${registry[account].page_id}${facebookDraft ? ' (as a draft)' : ''}`].filter(Boolean).join(' and ')

if (dryRun) {
  console.log(`[dry-run] would upload + ${scheduledAhead ? `queue for ${item.scheduledAt}` : 'publish'} to ${where}:\n`)
  console.log(JSON.stringify(item, null, 2))
  console.log(`\nroute: one-off, "${args['graph-route']}" — recorded on the item by post-reels.mjs when it publishes`)
  process.exit(0)
}

// Both credentials before the queue write, the upload or any Graph call. A missing Page credential
// must not let the Instagram half go out first; a missing Instagram one must not let the Page go.
// Never printed. A scheduled post reads them when it is published, not now.
function credential(envName, ref, what) {
  if (process.env[envName]) return process.env[envName]
  if (!ref) { console.error(`No ${what} credential for "${account}": accounts.json has no ${envName === 'FB_ACCESS_TOKEN' ? 'fb_token_ref' : 'token_ref'}. Nothing was queued, uploaded or published.`); process.exit(1) }
  try {
    const value = execFileSync('op', ['read', ref], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    if (!value) throw new Error('empty')
    return value
  } catch (e) {
    console.error(`No ${what} credential: set ${envName}, or check the 1Password item ${ref} (op read failed: ${e.code || 'error'}). Nothing was queued, uploaded or published.`)
    process.exit(1)
  }
}
const token = !scheduledAhead && toInstagram ? credential('IG_ACCESS_TOKEN', IG_REF, 'Instagram') : null
const fbToken = !scheduledAhead && toFacebook && !args['prepare-only'] ? credential('FB_ACCESS_TOKEN', FB_REF, 'Facebook Page') : null

// Another session may have appended since the read above; take the id again under the lock so two
// posts in the same minute never share one ledger entry.
updateQueueFile(queuePath, q, (fresh) => {
  for (let n = 2; fresh.items.some((it) => it.id === item.id); n++) item.id = `adhoc-${stamp}-${n}`
  id = item.id
  fresh.items.push(item)
})
console.log(`Queued ${id} [${media_type}] → ${where}\n`)

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
  if (toInstagram) console.log(`  IG_ACCESS_TOKEN=$(op read "${IG_REF}") \\`)
  if (toFacebook) console.log(`  FB_ACCESS_TOKEN=$(op read "${FB_REF}") \\`)
  console.log(`    node scripts/social-publish/post-reels.mjs --event adhoc --id ${id} --count 1 --graph-route "<Nino's words>"`)
  console.log('--force does not pull it forward: the delivery time is part of what was reviewed.')
  process.exit(0)
}

console.log('')
const env = { ...process.env, ...(token ? { IG_ACCESS_TOKEN: token } : {}), ...(fbToken ? { FB_ACCESS_TOKEN: fbToken } : {}) }
execFileSync('node', [join(HERE, 'post-reels.mjs'), '--event', EVENT, '--count', '1', '--id', id, '--graph-route', args['graph-route'],
  ...(args['prepare-only'] ? ['--prepare-only'] : []), ...(facebookDraft ? ['--facebook-draft'] : [])],
  { stdio: 'inherit', env })
