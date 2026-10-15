import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQueueLocation } from '../queue-dir.mjs'

const SOCIAL = join(dirname(fileURLToPath(import.meta.url)), '..')

// A throwaway repo with a main checkout and a linked worktree under .worktrees/, the layout every
// agent session uses. Commits skip the machine's global hooks so no review job fires on a fixture.
function sandbox() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'queue-dir-')))
  const main = join(root, 'repo')
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    '-c', 'user.name=queue-dir test', '-c', 'user.email=queue-dir@example.invalid', ...args], { cwd, stdio: 'pipe' })
  mkdirSync(join(main, 'scripts', 'social-publish'), { recursive: true })
  writeFileSync(join(main, 'scripts', 'social-publish', 'post-now.mjs'), '')
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'add', '.')
  git(main, 'commit', '-q', '-m', 'fixture')
  git(main, 'worktree', 'add', '-q', join('.worktrees', 'feature'), '-b', 'feature')
  return { root, main, worktree: join(main, '.worktrees', 'feature'), git, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

test('main checkout: the queue is the folder beside the scripts', () => {
  const sb = sandbox()
  try {
    const { queueDir, checkoutRoot } = resolveQueueLocation(join(sb.main, 'scripts', 'social-publish'))
    assert.equal(queueDir, join(sb.main, 'scripts', 'social-publish', 'queue'))
    assert.equal(checkoutRoot, sb.main)
  } finally { sb.cleanup() }
})

test('linked worktree: the queue resolves to the main checkout, so removing the worktree loses nothing', () => {
  const sb = sandbox()
  try {
    const { queueDir, checkoutRoot } = resolveQueueLocation(join(sb.worktree, 'scripts', 'social-publish'))
    assert.equal(queueDir, join(sb.main, 'scripts', 'social-publish', 'queue'))
    assert.equal(checkoutRoot, sb.main)
  } finally { sb.cleanup() }
})

test('not a git checkout (a copied bundle or test sandbox): the folder beside the scripts', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'queue-dir-plain-')))
  try {
    const { queueDir, checkoutRoot } = resolveQueueLocation(join(dir, 'scripts', 'social-publish'))
    assert.equal(queueDir, join(dir, 'scripts', 'social-publish', 'queue'))
    assert.equal(checkoutRoot, dir)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('linked worktree whose main checkout lacks the publisher folder: refuses instead of writing a ledger that will be lost', () => {
  const sb = sandbox()
  try {
    const extra = join(sb.worktree, 'tools', 'social-publish')
    mkdirSync(extra, { recursive: true })
    writeFileSync(join(extra, 'post-now.mjs'), '')
    sb.git(sb.worktree, 'add', '.')
    sb.git(sb.worktree, 'commit', '-q', '-m', 'only on the branch')
    assert.throws(() => resolveQueueLocation(extra), /main checkout .* has no tools\/social-publish/)
  } finally { sb.cleanup() }
})

// Every reader and writer of queue/ goes through queue-dir.mjs. A script that joins its own folder
// with 'queue' writes into whichever checkout it runs from, which is how adhoc-202610151752 was
// recorded only in a worktree on 2026-10-15. The pre-publish copy audit must also read the shared
// queue, not the worktree's.
test('no script builds its own queue path or audit root', () => {
  const offenders = []
  for (const name of readdirSync(SOCIAL).filter((f) => f.endsWith('.mjs') && f !== 'queue-dir.mjs')) {
    const lines = readFileSync(join(SOCIAL, name), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (/join\(\s*HERE\s*,\s*['"`]queue['"`]/.test(line) || /--root=\$\{join\(HERE/.test(line)) offenders.push(`${name}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [])
})
