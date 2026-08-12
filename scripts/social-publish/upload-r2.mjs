/**
 * Upload queued media to a public Cloudflare R2 bucket and write back the URLs.
 *
 *   node scripts/social-publish/upload-r2.mjs \
 *     --event bell-pepper-2026 \
 *     --bucket flickday-social \
 *     --prefix bell-pepper-2026 \
 *     --public-base https://pub-068210f3c0834d56a2eef0f10bf15e2d.r2.dev
 *
 * The item's file extension decides the queue field written back: video files
 * (.mp4/.mov) → video_url, image files (.jpg/.png) → image_url — matching what
 * post-reels.mjs expects per media_type (REELS/video vs IMAGE/STORIES/image).
 *
 * CAROUSEL items carry `files` (an ordered array) instead of `file`, because
 * post-reels.mjs publishes them as `children`, each with its own hosted URL.
 * Those are uploaded in order and written back as
 * `children: [{media_type, image_url|video_url}, ...]`. Carousel order is the
 * array order — it is what the reader swipes through, so do not sort it.
 *
 * Skips items that already have their URL. Uses `wrangler r2 object put`
 * (wrangler must be authed: `npx wrangler login`, or CLOUDFLARE_API_TOKEN set).
 * The bucket must have public access enabled — see SETUP.md.
 *
 * `--queue <path>` overrides the default `queue/<event>.json` next to this
 * script, for a queue that lives in another checkout of this repo.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}
const kindOf = (file) => {
  const ct = CONTENT_TYPES[extname(file).toLowerCase()]
  if (!ct) throw new Error(`unsupported media extension: ${file}`)
  return { contentType: ct, urlField: ct.startsWith('video/') ? 'video_url' : 'image_url' }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, [])
)
const { event, bucket } = args
const prefix = args.prefix ?? event
const publicBase = args['public-base']
if (!event || !bucket || !publicBase) {
  console.error('Required: --event <slug> --bucket <r2-bucket> --public-base <https://...r2.dev>')
  process.exit(1)
}

const queuePath = args.queue && args.queue !== true
  ? args.queue
  : join(HERE, 'queue', `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath} (run build-queue first)`); process.exit(1) }
const q = JSON.parse(readFileSync(queuePath, 'utf8'))

// A carousel is pending until every child has a URL; a single item until its own
// field is set. Counting only `file` silently skipped carousels entirely.
const filesOf = (it) => (Array.isArray(it.files) && it.files.length ? it.files
  : it.file ? [it.file] : [])
const isCarousel = (it) => Array.isArray(it.files) && it.files.length > 0
const hostedCount = (it) => isCarousel(it)
  ? (it.children ?? []).filter((c) => c.image_url || c.video_url).length
  : (it.file && it[kindOf(it.file).urlField] ? 1 : 0)
const pending = (it) => filesOf(it).length > hostedCount(it)

const put = (file) => {
  const { contentType, urlField } = kindOf(file)
  const key = `${prefix}/${basename(file)}`
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
    `--file=${file}`, `--content-type=${contentType}`, '--remote'],
    { stdio: ['ignore', 'ignore', 'inherit'] })
  return { urlField, url: `${publicBase.replace(/\/$/, '')}/${key}` }
}

const todo = q.items.filter(pending)
const fileCount = todo.reduce((n, it) => n + filesOf(it).length, 0)
console.log(`Uploading ${fileCount} media file(s) across ${todo.length}/${q.items.length} item(s) to r2://${bucket}/${prefix}/ ...\n`)

for (const it of q.items) {
  if (!pending(it)) continue
  try {
    if (isCarousel(it)) {
      // Rebuilt whole rather than appended, so a rerun cannot double-add a child
      // or reorder one. Carousel order is the swipe order.
      it.children = it.files.map((file) => {
        const { urlField, url } = put(file)
        return { media_type: urlField === 'video_url' ? 'VIDEO' : 'IMAGE', [urlField]: url }
      })
      console.log(`✓ ${it.id} → ${it.children.length} child media`)
    } else {
      const { urlField, url } = put(it.file)
      it[urlField] = url
      console.log(`✓ ${it.id} → ${url}`)
    }
    writeFileSync(queuePath, JSON.stringify(q, null, 2)) // persist after each
  } catch (e) {
    console.error(`✗ ${it.id}: ${e.message}`)
  }
}
console.log(`\nDone. URLs written to ${queuePath}`)
