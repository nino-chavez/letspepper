/**
 * Where the publisher's queues live — the one owner of that answer.
 *
 *   import { QUEUE_DIR, QUEUE_CHECKOUT } from './queue-dir.mjs'
 *
 * queue/ holds the ad hoc ledger (adhoc.json), every campaign queue, and the prepared-container and
 * route-receipt state a timed-out publish is reconciled from. It is gitignored, so it exists only in
 * the checkout that wrote it. Scripts used to join their own folder with 'queue', and a run from a
 * linked worktree (`.worktrees/<branch>`, where agent sessions write) then recorded the post only in
 * that worktree, deleted with it: on 2026-10-15 the 630 readiness Story, adhoc-202610151752, reached
 * the main ledger only because it was copied over by hand.
 *
 * So the queue is always the main checkout's:
 * - main checkout → the folder beside the scripts;
 * - linked worktree → the same path under the main checkout, which must already have it (refuses
 *   otherwise, rather than writing a ledger that disappears);
 * - not a git checkout (a copied bundle, a test sandbox) → the folder beside the scripts.
 *
 * QUEUE_CHECKOUT is that checkout's root: the copy audit (`tools/lib/encounter-audit.mjs
 * --surface="social publishing queue"`) runs against it, so it reads the same queue that publishes.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')
}

// The scripts sit at <checkout>/scripts/social-publish, so the checkout root is two levels up.
const besideScripts = (scriptDir) => ({ queueDir: join(scriptDir, 'queue'), checkoutRoot: resolve(scriptDir, '..', '..') })

// git needs a directory that exists to run in; a caller may name one that does not yet.
function nearestExisting(dir) {
  while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir)
  return dir
}

export function resolveQueueLocation(scriptDir = HERE) {
  const cwd = nearestExisting(scriptDir)
  let gitDir, commonDir, top
  try {
    ;[gitDir, commonDir, top] = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel'])
  } catch (e) {
    if (/not a git repository/i.test(String(e.stderr || ''))) return besideScripts(scriptDir)
    throw new Error(`queue-dir: could not ask git where this checkout's queue lives (${e.message.split('\n')[0]}); refusing to guess a ledger location.`)
  }
  if (realpathSync(gitDir) === realpathSync(commonDir)) return besideScripts(scriptDir)

  // A linked worktree: the main checkout owns <common git dir>/.., unless the repository keeps its
  // git dir somewhere else, in which case there is no main checkout to find.
  if (basename(commonDir) !== '.git') {
    throw new Error(`queue-dir: ${scriptDir} is in a linked worktree of a repository without a main checkout (${commonDir}); the queue has no durable home here.`)
  }
  const mainRoot = dirname(realpathSync(commonDir))
  const rel = relative(realpathSync(top), join(realpathSync(cwd), relative(cwd, scriptDir)))
  const mainScriptDir = join(mainRoot, rel)
  if (!existsSync(mainScriptDir)) {
    throw new Error(`queue-dir: the main checkout ${mainRoot} has no ${rel}, so a queue written from this worktree would be lost when it is removed. Merge the publisher to the main checkout's branch first.`)
  }
  return besideScripts(mainScriptDir)
}

const { queueDir, checkoutRoot } = resolveQueueLocation()
export const QUEUE_DIR = queueDir
export const QUEUE_CHECKOUT = checkoutRoot
