import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { merge3, openQueueFile, withQueueLock } from '../queue-store.mjs'

const STORE = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'queue-store.mjs')).href
const scratch = () => mkdtempSync(join(tmpdir(), 'queue-store-'))
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

test('merge3: an item another run appended survives this run saving its stale copy', () => {
  const base = { event: 'adhoc', items: [{ id: 'a', status: 'pending' }] }
  const ours = { event: 'adhoc', items: [{ id: 'a', status: 'posted', ig_media_id: '1' }] }
  const theirs = { event: 'adhoc', items: [{ id: 'a', status: 'pending' }, { id: 'b', status: 'posted' }] }
  assert.deepEqual(merge3(base, ours, theirs), { event: 'adhoc', items: [{ id: 'a', status: 'posted', ig_media_id: '1' }, { id: 'b', status: 'posted' }] })
})

test('merge3: fields of one item merge; on the same field the saving run wins', () => {
  const base = { items: [{ id: 'a', caption: 'x', status: 'pending' }] }
  const ours = { items: [{ id: 'a', caption: 'x', status: 'posted' }] }
  const theirs = { items: [{ id: 'a', caption: 'y', status: 'error' }] }
  assert.deepEqual(merge3(base, ours, theirs), { items: [{ id: 'a', caption: 'y', status: 'posted' }] })
})

test('merge3: an item this run removed stays removed unless the other run changed it', () => {
  const base = { items: [{ id: 'a', n: 1 }, { id: 'b', n: 1 }] }
  const ours = { items: [{ id: 'b', n: 1 }] }
  assert.deepEqual(merge3(base, ours, base), { items: [{ id: 'b', n: 1 }] })
  assert.deepEqual(merge3(base, ours, { items: [{ id: 'a', n: 2 }, { id: 'b', n: 1 }] }), { items: [{ id: 'a', n: 2 }, { id: 'b', n: 1 }] })
})

test('merge3: keyed ledgers (the Facebook album ledger) merge entry by entry', () => {
  const base = { uploaded: { p1: { id: '1' } }, errors: { p2: 'timeout' } }
  const ours = { uploaded: { p1: { id: '1' }, p2: { id: '2' } }, errors: {} }
  const theirs = { uploaded: { p1: { id: '1' }, p3: { id: '3' } }, errors: { p2: 'timeout' } }
  assert.deepEqual(merge3(base, ours, theirs), { uploaded: { p1: { id: '1' }, p3: { id: '3' }, p2: { id: '2' } }, errors: {} })
})

test('openQueueFile: a missing file starts from the initial value; a missing file with none refuses', () => {
  const dir = scratch()
  try {
    const p = join(dir, 'new.json')
    assert.throws(() => openQueueFile(p), /does not exist/)
    const s = openQueueFile(p, { event: 'new', items: [] })
    s.data.items.push({ id: 'x' })
    s.save()
    assert.deepEqual(read(p), { event: 'new', items: [{ id: 'x' }] })
    assert.equal(existsSync(`${p}.lock`), false, 'the lock is released after saving')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('save(whole): replacing the document drops what this run read, but not what arrived since', () => {
  const dir = scratch()
  try {
    const p = join(dir, 'q.json')
    writeFileSync(p, JSON.stringify({ event: 'e', meta: { m: 1 }, items: [{ id: 'old' }] }))
    const s = openQueueFile(p)
    const other = openQueueFile(p)
    other.data.items.push({ id: 'late' })
    other.save()
    s.save({ event: 'e', items: [{ id: 'new' }] })
    assert.deepEqual(read(p), { event: 'e', items: [{ id: 'late' }, { id: 'new' }] })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('withQueueLock: a lock left by a process that has exited is taken over', () => {
  const dir = scratch()
  try {
    const p = join(dir, 'q.json')
    writeFileSync(`${p}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, at: new Date().toISOString() }))
    assert.equal(withQueueLock(p, () => 'ran'), 'ran')
    assert.equal(existsSync(`${p}.lock`), false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// The race from the review of this change, in two real processes: a slow publisher holds its copy
// of adhoc.json while Meta processes a video, and another session appends and publishes meanwhile.
test('two processes: the slow publisher saving last does not erase the other session\'s post', async () => {
  const dir = scratch()
  try {
    const p = join(dir, 'adhoc.json')
    writeFileSync(p, JSON.stringify({ event: 'adhoc', items: [{ id: 'reel', status: 'prepared' }] }, null, 2))
    const slow = spawn(process.execPath, ['--input-type=module', '-e', `
      import { openQueueFile } from ${JSON.stringify(STORE)}
      const s = openQueueFile(${JSON.stringify(p)})
      process.stdout.write('opened\\n')
      await new Promise((r) => setTimeout(r, 600))
      s.data.items[0].status = 'posted'; s.data.items[0].ig_media_id = 'reel-media'
      s.save()
    `], { stdio: ['ignore', 'pipe', 'inherit'] })
    await new Promise((resolve) => slow.stdout.once('data', resolve))
    const other = openQueueFile(p)
    other.data.items.push({ id: 'story', status: 'posted', ig_media_id: 'story-media' })
    other.save()
    const code = await new Promise((resolve) => slow.on('exit', resolve))
    assert.equal(code, 0)
    assert.deepEqual(read(p).items, [
      { id: 'reel', status: 'posted', ig_media_id: 'reel-media' },
      { id: 'story', status: 'posted', ig_media_id: 'story-media' },
    ])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
