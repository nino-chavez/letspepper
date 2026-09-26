import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { vetoAlbum } from '../veto-announce.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOCIAL = join(HERE, '..')

const queueFixture = () => ({
  event: 'gallery-announce',
  items: [
    { id: 'Re7kho-gallery-announce', album_key: 'Re7kho', status: 'held', facebook_status: 'held', holdUntil: '2026-09-30T00:00:00Z' },
    { id: 'other-gallery-announce', album_key: 'other', status: 'pending', facebook_status: 'pending' },
    { id: 'posted-gallery-announce', album_key: 'posted', status: 'posted', facebook_status: 'posted' },
  ],
})

test('vetoAlbum: sets status and facebook_status on the matching held item, leaves everything else alone', () => {
  const { queue, vetoed, alreadyPosted } = vetoAlbum(queueFixture(), 'Re7kho', 'wrong gallery scope')
  assert.deepEqual(vetoed, ['Re7kho-gallery-announce'])
  assert.deepEqual(alreadyPosted, [])
  const item = queue.items.find((it) => it.id === 'Re7kho-gallery-announce')
  assert.equal(item.status, 'vetoed')
  assert.equal(item.facebook_status, 'vetoed')
  assert.equal(item.veto_reason, 'wrong gallery scope')
  assert.equal(queue.items.find((it) => it.id === 'other-gallery-announce').status, 'pending', 'an unrelated item is untouched')
})

test('vetoAlbum: refuses an unknown album key', () => {
  const r = vetoAlbum(queueFixture(), 'nope')
  assert.match(r.refused, /no item for album key or id "nope"/)
})

test('vetoAlbum: an already-posted item is reported, not vetoed', () => {
  const { vetoed, alreadyPosted } = vetoAlbum(queueFixture(), 'posted')
  assert.deepEqual(vetoed, [])
  assert.deepEqual(alreadyPosted, ['posted-gallery-announce'])
})

test('vetoAlbum: default reason when none is given', () => {
  const { queue } = vetoAlbum(queueFixture(), 'other')
  assert.equal(queue.items.find((it) => it.id === 'other-gallery-announce').veto_reason, 'vetoed by operator')
})

// --- CLI, end to end on a throwaway queue file --------------------------------

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'veto-announce-'))
  const social = join(root, 'scripts', 'social-publish')
  mkdirSync(join(social, 'queue'), { recursive: true })
  cpSync(join(SOCIAL, 'veto-announce.mjs'), join(social, 'veto-announce.mjs'))
  cpSync(join(SOCIAL, 'notify.mjs'), join(social, 'notify.mjs'))
  cpSync(join(SOCIAL, 'gallery-announce-caption.mjs'), join(social, 'gallery-announce-caption.mjs'))
  writeFileSync(join(social, 'queue', 'gallery-announce.json'), JSON.stringify(queueFixture(), null, 2))
  return { social, queuePath: join(social, 'queue', 'gallery-announce.json'), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

function run(args, cwd) {
  return new Promise((resolve) => {
    // NTFY_DISABLED: this CLI now sends a real ntfy.sh notification on a live veto — never
    // let a test reach the real `op read` / real network for it.
    const child = spawn(process.execPath, [join(cwd, 'veto-announce.mjs'), ...args],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NTFY_DISABLED: '1' } })
    let out = ''; let err = ''
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

test('CLI --dry-run reports what it would veto and writes nothing', async () => {
  const sb = sandbox()
  try {
    const before = readFileSync(sb.queuePath, 'utf8')
    const r = await run(['--album-key', 'Re7kho', '--dry-run'], sb.social)
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    assert.match(r.out, /would veto: Re7kho-gallery-announce/)
    assert.equal(readFileSync(sb.queuePath, 'utf8'), before)
  } finally { sb.cleanup() }
})

test('CLI live run persists the veto to the queue file', async () => {
  const sb = sandbox()
  try {
    const r = await run(['--album-key', 'Re7kho', '--reason', 'test fixture'], sb.social)
    assert.equal(r.code, 0, `${r.out}\n${r.err}`)
    const item = JSON.parse(readFileSync(sb.queuePath, 'utf8')).items.find((it) => it.id === 'Re7kho-gallery-announce')
    assert.equal(item.status, 'vetoed')
    assert.equal(item.veto_reason, 'test fixture')
  } finally { sb.cleanup() }
})

test('CLI refuses without --album-key', async () => {
  const sb = sandbox()
  try {
    const r = await run([], sb.social)
    assert.equal(r.code, 1)
    assert.match(r.err, /Required: --album-key/)
  } finally { sb.cleanup() }
})
