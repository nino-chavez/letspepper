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
 * Skips items that already have their URL. Uses `wrangler r2 object put`
 * (wrangler must be authed: `npx wrangler login`, or CLOUDFLARE_API_TOKEN set).
 * The bucket must have public access enabled — see SETUP.md.
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

const queuePath = join(HERE, 'queue', `${event}.json`)
if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath} (run build-queue first)`); process.exit(1) }
const q = JSON.parse(readFileSync(queuePath, 'utf8'))

const pending = (it) => it.file && !it[kindOf(it.file).urlField]
const todo = q.items.filter(pending)
console.log(`Uploading ${todo.length}/${q.items.length} media files to r2://${bucket}/${prefix}/ ...\n`)

for (const it of q.items) {
  if (!pending(it)) continue
  const { contentType, urlField } = kindOf(it.file)
  const key = `${prefix}/${basename(it.file)}`
  try {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
      `--file=${it.file}`, `--content-type=${contentType}`, '--remote'],
      { stdio: ['ignore', 'ignore', 'inherit'] })
    it[urlField] = `${publicBase.replace(/\/$/, '')}/${key}`
    writeFileSync(queuePath, JSON.stringify(q, null, 2)) // persist after each
    console.log(`✓ ${it.id} → ${it[urlField]}`)
  } catch (e) {
    console.error(`✗ ${it.id}: ${e.message}`)
  }
}
console.log(`\nDone. URLs written to ${queuePath}`)
