/**
 * Kill a gallery-announce item before it publishes: sets status/facebook_status
 * to "vetoed" on the LOCAL queue file. hold-shape.mjs's holdBlock() then refuses
 * both destinations, permanently — vetoed is terminal, unlike a hold, and
 * neither post-reels.mjs nor the Worker opens it again with --force.
 *
 *   node scripts/social-publish/veto-announce.mjs --album-key Re7kho
 *   node scripts/social-publish/veto-announce.mjs --album-key Re7kho --reason "wrong gallery scope"
 *   node scripts/social-publish/veto-announce.mjs --album-key Re7kho --dry-run
 *
 * Local-only: this edits queue/gallery-announce.json, never KV. --append never
 * touches an item KV already has, so vetoing an item already seeded to the
 * Worker needs a second step against the LIVE queue: seed-kv.mjs's own
 * `--veto <id,id>` mode, which goes through the same tick-window + re-read
 * guard as every other `--put`. This script tells the operator to run it
 * rather than hand-editing KV.
 */
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { notify, vetoedNotification } from './notify.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EVENT = 'gallery-announce'

/** Same pattern as build-gallery-announce.mjs's resolveNtfyTopic(): local caller looks up
 * its own topic; notify.mjs never does. */
function resolveNtfyTopic() {
  if (process.env.NTFY_TOPIC) return process.env.NTFY_TOPIC
  if (process.env.NTFY_DISABLED) return undefined // tests: skip the real `op read`, never send a real notification
  try {
    return execFileSync('op', ['read', 'op://Developer Secrets/ntfy gallery-announce/credential'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch { return undefined }
}

function parseArgs(argv) {
  return Object.fromEntries(argv.reduce((a, t, i, arr) => {
    if (t.startsWith('--')) {
      const next = arr[i + 1]
      a.push([t.slice(2), next === undefined || next.startsWith('--') ? true : next])
    }
    return a
  }, []))
}

/** Pure: veto every item for this album key that is not already posted. Returns { queue, vetoed } or { refused }. */
export function vetoAlbum(queue, albumKey, reason) {
  const targets = (queue.items || []).filter((it) => it.album_key === albumKey || it.id === albumKey || it.id?.startsWith(`${albumKey}-`))
  if (!targets.length) return { refused: `no item for album key or id "${albumKey}" in this queue.` }
  const already = targets.filter((it) => it.status === 'posted')
  const next = structuredClone(queue)
  const vetoed = []
  for (const it of next.items) {
    if (!targets.some((t) => t.id === it.id)) continue
    if (it.status === 'posted') continue // already live — vetoing it here does nothing; say so
    it.status = 'vetoed'
    if ('facebook_status' in it) it.facebook_status = 'vetoed'
    it.veto_reason = reason || 'vetoed by operator'
    vetoed.push(it.id)
  }
  return { queue: next, vetoed, alreadyPosted: already.map((it) => it.id) }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const albumKey = typeof args['album-key'] === 'string' ? args['album-key'] : null
  if (!albumKey) { console.error('Required: --album-key <key> [--reason "..."] [--dry-run]'); process.exit(1) }
  const reason = typeof args.reason === 'string' ? args.reason : null
  const dryRun = !!args['dry-run']

  const queuePath = join(HERE, 'queue', `${EVENT}.json`)
  if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath} — nothing to veto.`); process.exit(1) }
  const queue = JSON.parse(readFileSync(queuePath, 'utf8'))

  const result = vetoAlbum(queue, albumKey, reason)
  if (result.refused) { console.error(`REFUSED — ${result.refused}`); process.exit(1) }

  if (result.alreadyPosted.length) {
    console.warn(`Already posted, unaffected: ${result.alreadyPosted.join(', ')}. A published post is not un-published by this script.`)
  }
  if (!result.vetoed.length) {
    console.log('Nothing to veto (every matching item was already posted).')
    return
  }

  console.log(`${dryRun ? '[dry-run] would veto' : 'Vetoing'}: ${result.vetoed.join(', ')}${reason ? ` — "${reason}"` : ''}`)
  if (dryRun) return

  writeFileSync(queuePath, JSON.stringify(result.queue, null, 2))
  console.log(`Wrote ${queuePath}.`)
  console.log('This is LOCAL only. If this item was already seeded to the Worker (seed-kv.mjs --put), it is still live in KV')
  console.log('and neither --append nor a plain re-seed touches an item KV already has. Kill it there too, through the same')
  console.log('tick-window + re-read guard every other --put uses (no hand-edit needed):')
  console.log(`  node ${join(HERE, 'seed-kv.mjs')} --event ${EVENT} --veto ${result.vetoed.join(',')} --reason "${reason || 'vetoed by operator'}" --put`)

  // VETOED notification. This script only ever edits the LOCAL queue (never KV), so the
  // notification MUST say "LOCAL ONLY" every time it's sent from here — never mark it
  // otherwise, even though seed-kv.mjs --veto (called separately) sends the honest
  // "reached the Worker" version.
  const topic = resolveNtfyTopic()
  for (const id of result.vetoed) {
    const item = result.queue.items.find((it) => it.id === id)
    await notify({ topic, ...vetoedNotification({ albumName: item?.album_name || item?.album_key || id, reason, localOnly: true }) })
  }
}

// realpathSync before comparing: on macOS, node's own module resolution canonicalizes
// symlinked paths (e.g. a mkdtemp'd /var/folders/... path is really /private/var/...),
// but process.argv[1] is left exactly as the caller (or a test's spawn()) supplied it —
// so the direct pathToFileURL(process.argv[1]) comparison silently loses here, and
// main() never runs. Same fix seed-kv.mjs's own guard needs, not yet applied there.
let isEntryPoint = false
try { isEntryPoint = import.meta.url === pathToFileURL(realpathSync(process.argv[1] || '')).href } catch { /* argv[1] unreadable — not the entry point */ }
if (isEntryPoint) main().catch((e) => { console.error(`ERROR — ${e.message}`); process.exit(1) })
