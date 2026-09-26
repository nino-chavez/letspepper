import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recaption, reassign } from '../held-item-shape.mjs'

const ACCOUNTS = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'accounts.json'), 'utf8')).accounts
const held = () => ({ id: 'DWdCET-gallery-announce', status: 'held', facebook_status: 'held', account: 'ninophoto', collaborators: ['flickday.media'], caption: 'old', facebook_caption: 'old' })

test('recaption: replaces both captions on a held live item and leaves everything else alone', () => {
  const item = { id: 'DWdCET-gallery-announce', status: 'held', facebook_status: 'held', caption: 'old', facebook_caption: 'old', children: [1, 2] }
  const other = { id: 'Re7kho-gallery-announce', status: 'posted', facebook_status: 'posted', caption: 'keep' }
  const live = { event: 'gallery-announce', meta: { route: { approved: '2026-09-25' } }, items: [other, item] }
  const r = recaption(live, item.id, 'new')
  assert.equal(r.before, 'old')
  assert.deepEqual(r.queue.items[1], { ...item, caption: 'new', facebook_caption: 'new' })
  assert.deepEqual(r.queue.items[0], other)
  assert.deepEqual(r.queue.meta, live.meta)
  assert.equal(live.items[1].caption, 'old', 'the input queue is not mutated')
})

test('recaption: refuses a missing item, an empty caption, and any item past held on either channel', () => {
  const q = (status, facebook_status) => ({ items: [{ id: 'x', status, facebook_status, caption: 'c' }] })
  assert.match(recaption(q('held', 'held'), 'y', 'n').refused, /no item/)
  assert.match(recaption(q('held', 'held'), 'x', '  ').refused, /empty/)
  for (const [a, b] of [['posted', 'held'], ['held', 'posted'], ['building', 'held'], ['vetoed', 'vetoed'], ['error', 'held']]) {
    assert.match(recaption(q(a, b), 'x', 'n').refused, /not held\/held/)
  }
})

test('reassign: moves a held item to flickday with nino.chavez.photo as collaborator, nothing else changes', () => {
  const live = { meta: { route: { approved: '2026-09-25' } }, items: [held()] }
  const r = reassign(live, 'DWdCET-gallery-announce', { account: 'flickday', collaborators: ['@nino.chavez.photo'] }, ACCOUNTS)
  assert.deepEqual(r.before, { account: 'ninophoto', collaborators: ['flickday.media'] })
  assert.deepEqual(r.queue.items[0], { ...held(), account: 'flickday', collaborators: ['nino.chavez.photo'] })
  assert.deepEqual(r.queue.meta, live.meta)
  assert.equal(live.items[0].account, 'ninophoto', 'the input queue is not mutated')
})

test('reassign: refuses an unknown account, self-invite, more than 3 collaborators, and any item past held', () => {
  const q = { items: [held()] }
  assert.match(reassign(q, held().id, { account: 'nope', collaborators: [] }, ACCOUNTS).refused, /unknown account/)
  assert.match(reassign(q, held().id, { account: 'flickday', collaborators: ['flickday.media'] }, ACCOUNTS).refused, /own post/)
  assert.match(reassign(q, held().id, { account: 'flickday', collaborators: ['a', 'b', 'c', 'd'] }, ACCOUNTS).refused, /at most 3/)
  const posted = { items: [{ ...held(), status: 'posted' }] }
  assert.match(reassign(posted, held().id, { account: 'flickday', collaborators: [] }, ACCOUNTS).refused, /not held\/held/)
})

test('reassign: leaving collaborators out keeps the current ones; an empty list clears them', () => {
  const q = { items: [held()] }
  assert.deepEqual(reassign(q, held().id, { account: 'letspepper' }, ACCOUNTS).after.collaborators, ['flickday.media'])
  assert.deepEqual(reassign(q, held().id, { account: 'letspepper', collaborators: [] }, ACCOUNTS).after.collaborators, [])
})

test('reassign: an item keeps its recorded series when it moves account', () => {
  const q = { items: [{ ...held(), account: 'letspepper', series: 'lpo' }] }
  assert.equal(reassign(q, held().id, { account: 'flickday', collaborators: [] }, ACCOUNTS).queue.items[0].series, 'lpo')
})
