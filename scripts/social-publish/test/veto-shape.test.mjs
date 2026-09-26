import assert from 'node:assert/strict'
import test from 'node:test'
import { veto } from '../veto-shape.mjs'
import { veto as vetoFromSeedKv } from '../seed-kv.mjs'

test('veto: sets status/facebook_status to vetoed, leaves other items alone, does not mutate the input', () => {
  const live = { items: [
    { id: 'a', status: 'held', facebook_status: 'held' },
    { id: 'b', status: 'pending', facebook_status: 'pending' },
  ] }
  const { queue } = veto(live, ['a'], 'wrong series')
  assert.equal(queue.items[0].status, 'vetoed')
  assert.equal(queue.items[0].facebook_status, 'vetoed')
  assert.equal(queue.items[0].veto_reason, 'wrong series')
  assert.equal(queue.items[1].status, 'pending', 'untouched')
  assert.equal(live.items[0].status, 'held', 'input queue not mutated')
})

test('veto: refuses an unknown id', () => {
  assert.match(veto({ items: [{ id: 'a', status: 'held' }] }, ['nope']).refused, /unknown id/)
})

test('veto: refuses an item whose Instagram destination has already posted', () => {
  assert.match(veto({ items: [{ id: 'a', status: 'posted' }] }, ['a']).refused, /already posted/)
})

test('veto: refuses an item whose Facebook destination has already posted, even if Instagram has not', () => {
  const live = { items: [{ id: 'a', status: 'error', facebook_status: 'posted' }] }
  const r = veto(live, ['a'])
  assert.match(r.refused, /already posted/)
})

test('veto: defaults the reason when none is given', () => {
  const { queue } = veto({ items: [{ id: 'x', status: 'held' }] }, ['x'])
  assert.equal(queue.items[0].veto_reason, 'vetoed by operator')
})

test('veto: seed-kv.mjs re-exports the exact same function (one veto format, not two)', () => {
  assert.equal(vetoFromSeedKv, veto)
})
