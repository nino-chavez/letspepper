/**
 * Upload queued reels to a public Cloudflare R2 bucket and write back the URLs.
 *
 *   node scripts/social-publish/upload-r2.mjs \
 *     --event bell-pepper-2026 \
 *     --bucket letspepper-reels \
 *     --prefix bell-pepper-2026 \
 *     --public-base https://pub-xxxx.r2.dev
 *
 * Skips items that already have a video_url. Uses `wrangler r2 object put`
 * (wrangler must be authed: `npx wrangler login`, or CLOUDFLARE_API_TOKEN set).
 * The bucket must have public access enabled — see SETUP.md.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const todo = q.items.filter((it) => !it.video_url)
console.log(`Uploading ${todo.length}/${q.items.length} reels to r2://${bucket}/${prefix}/ ...\n`)

for (const it of q.items) {
  if (it.video_url) continue
  const key = `${prefix}/${basename(it.file)}`
  try {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`,
      `--file=${it.file}`, '--content-type=video/mp4', '--remote'],
      { stdio: ['ignore', 'ignore', 'inherit'] })
    it.video_url = `${publicBase.replace(/\/$/, '')}/${key}`
    writeFileSync(queuePath, JSON.stringify(q, null, 2)) // persist after each
    console.log(`✓ ${it.id} → ${it.video_url}`)
  } catch (e) {
    console.error(`✗ ${it.id}: ${e.message}`)
  }
}
console.log(`\nDone. URLs written to ${queuePath}`)
