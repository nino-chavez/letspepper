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

// --- cascade to a linked item (added 2026-09-26, the gallery-announce companion Story) ------

test('veto: vetoing a carousel also vetoes its linked Story', () => {
  const live = { items: [
    { id: 'album-1-gallery-announce', status: 'held', facebook_status: 'held' },
    { id: 'album-1-gallery-announce-story', status: 'held', linked_item_id: 'album-1-gallery-announce' },
    { id: 'album-2-gallery-announce', status: 'held', facebook_status: 'held' }, // unrelated, untouched
  ] }
  const { queue, cascaded } = veto(live, ['album-1-gallery-announce'], 'wrong series')
  assert.deepEqual(cascaded, ['album-1-gallery-announce-story'])
  const carousel = queue.items.find((it) => it.id === 'album-1-gallery-announce')
  const story = queue.items.find((it) => it.id === 'album-1-gallery-announce-story')
  assert.equal(carousel.status, 'vetoed')
  assert.equal(carousel.veto_reason, 'wrong series', 'the NAMED item keeps the operator\'s own reason')
  assert.equal(story.status, 'vetoed')
  assert.match(story.veto_reason, /linked post vetoed \(wrong series\)/)
  assert.equal(queue.items[2].status, 'held', 'an unrelated album is untouched')
})

test('veto: vetoing just the Story does NOT cascade back to its carousel', () => {
  const live = { items: [
    { id: 'album-1-gallery-announce', status: 'held', facebook_status: 'held' },
    { id: 'album-1-gallery-announce-story', status: 'held', linked_item_id: 'album-1-gallery-announce' },
  ] }
  const { queue, cascaded } = veto(live, ['album-1-gallery-announce-story'], 'bad crop')
  assert.deepEqual(cascaded, [])
  assert.equal(queue.items.find((it) => it.id === 'album-1-gallery-announce').status, 'held', 'the carousel survives a Story-only veto')
  assert.equal(queue.items.find((it) => it.id === 'album-1-gallery-announce-story').status, 'vetoed')
})

test('veto: a cascade is refused (nothing written) if the linked Story already posted', () => {
  const live = { items: [
    { id: 'a', status: 'held', facebook_status: 'held' },
    { id: 'a-story', status: 'posted', linked_item_id: 'a' },
  ] }
  const r = veto(live, ['a'])
  assert.match(r.refused, /already posted/)
  assert.equal(r.queue, undefined)
})

test('veto: an item with no linked_item_id cascades nothing (ordinary items are unaffected)', () => {
  const live = { items: [{ id: 'a', status: 'held' }, { id: 'b', status: 'held' }] }
  const { cascaded } = veto(live, ['a'])
  assert.deepEqual(cascaded, [])
})
