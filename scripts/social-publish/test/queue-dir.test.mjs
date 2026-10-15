import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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

test('importing queue-dir.mjs resolves nothing; only a caller that needs the queue meets the refusal', () => {
  const sb = sandbox()
  try {
    const extra = join(sb.worktree, 'tools', 'social-publish')
    mkdirSync(extra, { recursive: true })
    cpSync(join(SOCIAL, 'queue-dir.mjs'), join(extra, 'queue-dir.mjs'))
    sb.git(sb.worktree, 'add', '.')
    sb.git(sb.worktree, 'commit', '-q', '-m', 'only on the branch')
    const run = (code) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: extra, encoding: 'utf8' })
    assert.equal(run(`await import('./queue-dir.mjs')`).status, 0)
    const called = run(`const m = await import('./queue-dir.mjs'); m.queueDir()`)
    assert.notEqual(called.status, 0)
    assert.match(called.stderr, /has no tools\/social-publish/)
  } finally { sb.cleanup() }
})

// Tests import these for pure helpers. Loading them must not reach for git, so a git problem
// cannot turn an unrelated unit test into a queue-dir failure. With no git on PATH, any lookup at
// import time would throw.
test('modules imported for pure helpers load without running git', () => {
  for (const name of ['seed-kv.mjs', 'build-gallery-announce.mjs', 'veto-announce.mjs']) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(SOCIAL, name)).href)})`],
      { encoding: 'utf8', env: { ...process.env, PATH: '' } })
    assert.equal(r.status, 0, `${name}: ${r.stderr}`)
  }
})

// Every reader and writer of queue/ goes through queue-dir.mjs. A script that joins its own folder
// with 'queue' writes into whichever checkout it runs from, which is how adhoc-202610151752 was
// recorded only in a worktree on 2026-10-15. The pre-publish copy audit must also read the shared
// queue, not the worktree's. And because every worktree now shares those files, a write goes
// through queue-store.mjs: a plain writeFileSync saves a stale copy over another run's work.
test('no script builds its own queue path or audit root, or writes a queue file directly', () => {
  const offenders = []
  for (const name of readdirSync(SOCIAL).filter((f) => f.endsWith('.mjs') && !['queue-dir.mjs', 'queue-store.mjs'].includes(f))) {
    const source = readFileSync(join(SOCIAL, name), 'utf8')
    const queueVars = [...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:join\(\s*)?queueDir\(\)/g)].map((m) => m[1])
    const directWrite = new RegExp(`(?:writeFileSync|renameSync|appendFileSync)\\(\\s*(?:join\\(\\s*queueDir\\(\\)${queueVars.map((v) => `|${v}\\b`).join('')})`)
    source.split('\n').forEach((line, i) => {
      if (/join\(\s*HERE\s*,\s*['"`]queue['"`]/.test(line) || /--root=\$\{join\(HERE/.test(line) || directWrite.test(line)) offenders.push(`${name}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [])
})
