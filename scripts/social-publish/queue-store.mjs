/**
 * Read and write a queue file without overwriting what another run wrote meanwhile.
 *
 * A quick change with no network call in between: lock, re-read, change, write, all at once.
 *
 *   updateQueueFile(path, { event, items: [] }, (q) => { q.items.push(item) })  // or return a new document
 *   writeQueueFile(path, document)                                              // replace the whole file
 *
 * A run that holds its copy across network calls (post-reels, upload-r2, build-fb-album):
 *
 *   const store = openQueueFile(path, { event, items: [] })  // initial value if the file is missing
 *   store.data.items.push(item)                             // edit in memory as before
 *   store.save()                                            // or store.save(wholeNewDocument)
 *
 * Every worktree's runs share the main checkout's queue (queue-dir.mjs), and a publisher holds its
 * copy for minutes while Meta processes a video. Writing that copy back would erase an item another
 * session appended in the meantime, so save() does this under an exclusive lock:
 * - re-read the file;
 * - three-way merge: what this run had when it last read or saved (base), what it has now (ours),
 *   and what the file holds now (theirs). Whatever this run changed wins; whatever it did not touch
 *   comes from the file. Plain objects merge key by key, and `items` lists merge by item `id`. When
 *   one side removed something the other changed, the change is kept, because losing a ledger entry
 *   is the failure this exists to prevent.
 * - write a temporary file and rename it over the original, so no reader sees half a file.
 *
 * The lock is held for the read-merge-write only, never across a network call. A dead lock (its
 * process has exited, or it is older than any real holder could make it) is taken over by one waiter
 * at a time; a live one is waited on, then reported, never stolen.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

const LOCK_WAIT_MS = 30_000
const LOCK_STALE_MS = 60_000
const LOCK_ABANDONED_MS = 10 * 60_000
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isIdList = (v) => Array.isArray(v) && v.every((x) => isPlainObject(x) && typeof x.id === 'string')

export function deepEqual(a, b) {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
  }
  return false
}

// undefined means "absent" on any side.
export function merge3(base, ours, theirs) {
  if (deepEqual(ours, base)) return theirs
  if (deepEqual(theirs, base) || deepEqual(theirs, ours)) return ours
  if (ours === undefined) return theirs // we removed it, they changed it: keep their change
  if (theirs === undefined) return ours // they removed it, we changed it: keep ours
  if (isPlainObject(ours) && isPlainObject(theirs)) {
    const b = isPlainObject(base) ? base : {}
    const out = {}
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
      const v = merge3(b[k], ours[k], theirs[k])
      if (v !== undefined) out[k] = v
    }
    return out
  }
  if (isIdList(ours) && isIdList(theirs)) {
    const byId = (list) => new Map((isIdList(list) ? list : []).map((x) => [x.id, x]))
    const b = byId(base), o = byId(ours), t = byId(theirs)
    const out = []
    for (const id of new Set([...t.keys(), ...o.keys()])) {
      const v = merge3(b.get(id), o.get(id), t.get(id))
      if (v !== undefined) out.push(v)
    }
    return out
  }
  return ours // both changed the same value: the run saving now wins, as a plain write would
}

const readHolder = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null } }
const newHolder = () => ({ pid: process.pid, token: `${process.pid}-${process.hrtime.bigint()}-${Math.random().toString(36).slice(2)}`, at: new Date().toISOString() })

// Create `file` only if absent, recording who holds it. True when this process now holds it.
function claim(file, holder) {
  try {
    const fd = openSync(file, 'wx')
    writeSync(fd, JSON.stringify(holder))
    closeSync(fd)
    return true
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
    return false
  }
}

// Delete `file` only while it still records `token`: never one that another process took after
// this one looked. The re-read and the delete are adjacent statements; the guard below is what
// keeps two processes from reaching them for the same lock.
function removeIfStill(file, token) {
  if (readHolder(file)?.token !== token) return
  try { unlinkSync(file) } catch { /* already gone */ }
}

// Dead: its process has exited; or its file is older than LOCK_ABANDONED_MS, which no real holder
// reaches (the lock covers a read and a write, never a network call) and which also covers a pid
// that macOS has since given to an unrelated process; or it has no readable holder and is older
// than LOCK_STALE_MS (cut off while being written). A waiter on the same Mac cannot run while that
// Mac sleeps, so a holder suspended mid-write is never judged dead by the cutoff while it matters.
function holderGone(info, file) {
  let age
  try { age = Date.now() - statSync(file).mtimeMs } catch { return false } // gone already; the next attempt takes it
  if (age > LOCK_ABANDONED_MS) return true
  if (!Number.isInteger(info?.pid)) return age > LOCK_STALE_MS
  try { process.kill(info.pid, 0); return false } catch (e) { return e.code === 'ESRCH' }
}

// Judging a lock dead and deleting it are two steps, so two waiters can judge the same dead lock;
// if the slower one then deleted it, it would delete the lock the faster one had just taken, and
// both would write (second review of this change). Only the waiter holding the takeover guard may
// delete, and only while the lock still records the token it judged dead. The guard follows the
// same rules: a guard whose holder died is cleared by token, never by a bare age check.
function takeOverDeadLock(lock, judged) {
  sleep(Number(process.env.QUEUE_STORE_TAKEOVER_DELAY_MS || 0)) // test seam: widens the window the guard closes
  const guard = `${lock}.takeover`
  const me = newHolder()
  if (!claim(guard, me)) {
    const other = readHolder(guard)
    if (holderGone(other, guard)) removeIfStill(guard, other?.token)
    return
  }
  try {
    if (readHolder(lock)?.token === judged?.token && holderGone(judged, lock)) removeIfStill(lock, judged?.token)
  } finally {
    removeIfStill(guard, me.token)
  }
}

export function withQueueLock(path, fn) {
  const lock = `${path}.lock`
  mkdirSync(dirname(path), { recursive: true })
  const mine = newHolder()
  const start = Date.now()
  while (!claim(lock, mine)) {
    const held = readHolder(lock)
    if (holderGone(held, lock)) { takeOverDeadLock(lock, held); sleep(5); continue }
    if (Date.now() - start > LOCK_WAIT_MS) {
      throw new Error(`queue-store: ${lock} has been held for over ${LOCK_WAIT_MS / 1000} s by pid ${held?.pid ?? 'unknown'}, which is still running; nothing was written. Check that process, then retry.`)
    }
    sleep(25)
  }
  try {
    return fn()
  } finally {
    removeIfStill(lock, mine.token) // release only our own lock
  }
}

const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined)

function writeAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}

// mutate gets the file's current contents (or a copy of `initial`) inside the lock. It edits them in
// place or returns a replacement document; whatever results is written. Keep it free of network
// calls: every other writer of this file waits while it runs.
export function updateQueueFile(path, initial, mutate) {
  return withQueueLock(path, () => {
    const current = readJson(path) ?? (initial === undefined ? undefined : structuredClone(initial))
    if (current === undefined) throw new Error(`queue-store: ${path} does not exist.`)
    const returned = mutate(current)
    const next = returned === undefined ? current : returned
    writeAtomic(path, next)
    return next
  })
}

export function writeQueueFile(path, value) {
  return withQueueLock(path, () => { writeAtomic(path, value); return value })
}

export function openQueueFile(path, initial) {
  const found = readJson(path)
  if (found === undefined && initial === undefined) throw new Error(`queue-store: ${path} does not exist.`)
  let base = found === undefined ? undefined : structuredClone(found)
  const store = {
    data: structuredClone(found ?? initial),
    save(ours = store.data) {
      store.data = ours
      const merged = withQueueLock(path, () => {
        const result = merge3(base, ours, readJson(path))
        writeAtomic(path, result)
        return result
      })
      base = structuredClone(ours)
      return merged
    },
  }
  return store
}
