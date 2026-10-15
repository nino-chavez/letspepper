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
 * The lock is held for the read-merge-write only, never across a network call. A lock left by a
 * process that has exited, or older than LOCK_STALE_MS, is taken over.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'

const LOCK_WAIT_MS = 30_000
const LOCK_STALE_MS = 60_000
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

function lockPid(lock) {
  try { return JSON.parse(readFileSync(lock, 'utf8')).pid } catch { return null }
}

function isStale(lock) {
  try {
    if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) return true
  } catch { return false } // gone already; the next attempt takes it
  const pid = lockPid(lock)
  if (!Number.isInteger(pid)) return false
  try { process.kill(pid, 0); return false } catch (e) { return e.code === 'ESRCH' }
}

export function withQueueLock(path, fn) {
  const lock = `${path}.lock`
  mkdirSync(dirname(path), { recursive: true })
  const start = Date.now()
  for (;;) {
    try {
      const fd = openSync(lock, 'wx')
      writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
      closeSync(fd)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      if (isStale(lock)) { try { unlinkSync(lock) } catch { /* another waiter took it over first */ } continue }
      if (Date.now() - start > LOCK_WAIT_MS) {
        throw new Error(`queue-store: ${lock} has been held for over ${LOCK_WAIT_MS / 1000} s by pid ${lockPid(lock) ?? 'unknown'}; nothing was written. Check that process, then retry.`)
      }
      sleep(25)
    }
  }
  try { return fn() } finally { try { unlinkSync(lock) } catch { /* already released */ } }
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
