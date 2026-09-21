/**
 * Seed a campaign queue into the scheduled Worker's KV, carrying its route.
 *
 *   node scripts/social-publish/seed-kv.mjs --event cutting-board-announce          # write the payload, print the put
 *   node scripts/social-publish/seed-kv.mjs --event cutting-board-announce --put    # and write it to production KV
 *
 * The Worker publishes an item only when its queue carries `meta.route`. This
 * script is the one thing that writes that block, and it copies it from the
 * event's entry in the tracked graph-routes.json. With no complete entry, or one
 * that has expired or does not name every account the queue publishes to, it
 * refuses and writes nothing: the approval lives in the tracked file, and KV
 * holds a copy of it. Hand-writing `meta.route` into a KV value forges one.
 *
 * The payload is queue/<event>.kv.json, and it REPLACES the Worker's copy of the
 * queue — including the posted/building state the Worker has recorded since the
 * last seed. Read the live value first (`wrangler kv key get`) when the campaign
 * is already running.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadRoutes, REFUSED } from './route-gate.mjs'
import { standingEntry, entryCovers } from './route-shape.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * The KV value for `event`: the queue with `meta.route` copied from its
 * standing entry. Returns { payload } or { refused: <why> }.
 */
export function seedPayload(queue, event, routes, now = new Date()) {
  const entry = standingEntry(event, routes)
  if (!entry) return { refused: `"${event}" has no complete entry in graph-routes.json (reason, approved YYYY-MM-DD, accounts[], optional expires).` }
  if (!entryCovers(entry, [], now)) return { refused: `the graph-routes.json entry for "${event}" expired ${entry.expires}.` }
  const accounts = [...new Set((queue.items || []).map((it) => it.account))]
  const unlisted = accounts.filter((a) => !entryCovers(entry, [a], now))
  if (unlisted.length) return { refused: `the graph-routes.json entry for "${event}" does not list ${unlisted.map((a) => `"${a}"`).join(', ')}.` }
  const { reason, approved, accounts: approvedAccounts, expires } = entry
  const route = { reason, approved, accounts: [...approvedAccounts], ...(expires === undefined ? {} : { expires }) }
  return { payload: { ...queue, meta: { ...queue.meta, route } } }
}

function main() {
  const argv = process.argv.slice(2)
  const at = argv.indexOf('--event')
  const event = at >= 0 ? argv[at + 1] : undefined
  if (!event || event.startsWith('--')) { console.error('Required: --event <slug> [--put]'); process.exit(1) }

  const queuePath = join(HERE, 'queue', `${event}.json`)
  if (!existsSync(queuePath)) { console.error(`No queue: ${queuePath}`); process.exit(1) }

  const verdict = seedPayload(JSON.parse(readFileSync(queuePath, 'utf8')), event, loadRoutes())
  if (verdict.refused) {
    console.error(`REFUSED — ${verdict.refused} Nothing was written.`)
    console.error('The Worker publishes only a queue whose route Nino approved in graph-routes.json. Load the `meta-publish` skill.')
    process.exit(REFUSED)
  }

  const outPath = join(HERE, 'queue', `${event}.kv.json`)
  writeFileSync(outPath, JSON.stringify(verdict.payload, null, 2))
  const put = ['wrangler', 'kv', 'key', 'put', event, `--path=${outPath}`, '--binding=QUEUE',
    `--config=${join(HERE, 'worker', 'wrangler.jsonc')}`, '--remote']
  console.log(`Wrote ${outPath} (${verdict.payload.items.length} items, route approved ${verdict.payload.meta.route.approved}).`)
  if (!argv.includes('--put')) { console.log(`To seed: npx ${put.join(' ')}`); return }
  execFileSync('npx', put, { stdio: 'inherit' })
  console.log(`Seeded KV key "${event}".`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main()
