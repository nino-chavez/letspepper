import assert from 'node:assert/strict'
import test from 'node:test'
import { collabBlock, decideCollab, normalizeInstagramHandle } from '../collab-shape.mjs'

const item = (overrides = {}) => ({
  id: 'album-gallery-announce', account: 'flickday', media_type: 'CAROUSEL',
  status: 'held', facebook_status: 'held', collab: { status: 'ask' }, collaborators: [], ...overrides,
})

test('collabBlock: an unanswered choice blocks a carousel indefinitely; a decision clears it', () => {
  assert.match(collabBlock(item()), /Collab choice/)
  assert.equal(collabBlock(item({ collab: { status: 'none' } })), null)
  assert.equal(collabBlock(item({ collab: { status: 'decided', handles: ['nino.chavez.photo'] } })), null)
})

test('decideCollab: no Collab and a handle list both unblock the carousel', () => {
  const none = decideCollab({ items: [item()] }, 'album-gallery-announce', { choice: 'none' }).item
  assert.deepEqual(none.collab, { status: 'none' })
  assert.deepEqual(none.collaborators, [])
  const handles = decideCollab({ items: [item()] }, 'album-gallery-announce', { choice: 'handles', handles: '@nino.chavez.photo, other.account' }).item
  assert.deepEqual(handles.collab, { status: 'decided', handles: ['nino.chavez.photo', 'other.account'] })
  assert.deepEqual(handles.collaborators, ['nino.chavez.photo', 'other.account'])
})

test('decideCollab: validates Instagram usernames and refuses a Story', () => {
  assert.equal(normalizeInstagramHandle('@nino.chavez.photo'), 'nino.chavez.photo')
  assert.equal(normalizeInstagramHandle('not a handle'), null)
  assert.match(decideCollab({ items: [item()] }, 'album-gallery-announce', { choice: 'handles', handles: 'not a handle' }).refused, /valid Instagram usernames/)
  assert.match(decideCollab({ items: [item({ media_type: 'STORIES' })] }, 'album-gallery-announce', { choice: 'none' }).refused, /Stories cannot carry a Collab/)
})
