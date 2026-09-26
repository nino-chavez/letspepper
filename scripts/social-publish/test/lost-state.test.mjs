import assert from 'node:assert/strict'
import test from 'node:test'
import { lostState } from '../seed-kv.mjs'

// Shaped like the live Re7kho item after it posted: array publish-state fields included.
const posted = () => ({
  id: 'Re7kho-gallery-announce', status: 'posted', facebook_status: 'posted',
  ig_container_id: '1', ig_media_id: '18121347139910500', ig_child_container_ids: ['a', 'b'],
  facebook_photo_ids: ['p1', 'p2'], facebook_post_id: 'page_post',
})

test('lostState: an unchanged copy of a posted carousel (array fields included) loses nothing', () => {
  const live = { items: [posted()] }
  const local = JSON.parse(JSON.stringify(live))
  assert.deepEqual(lostState(live, local), [])
})

test('lostState: still refuses a local copy that drops or changes recorded publish state', () => {
  const live = { items: [posted()] }
  assert.deepEqual(lostState(live, { items: [] }), ['Re7kho-gallery-announce'])
  assert.deepEqual(lostState(live, { items: [{ ...posted(), status: 'held' }] }), ['Re7kho-gallery-announce'])
  assert.deepEqual(lostState(live, { items: [{ ...posted(), facebook_photo_ids: ['p1'] }] }), ['Re7kho-gallery-announce'])
})

test('lostState: items the Worker has not started on are not guarded', () => {
  const held = { id: 'x', status: 'held', facebook_status: 'held' }
  assert.deepEqual(lostState({ items: [held] }, { items: [{ ...held, caption: 'changed' }] }), [])
})
