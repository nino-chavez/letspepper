import assert from 'node:assert/strict'
import test from 'node:test'
import { collabBlock, decideCollab, normalizeInstagramHandle } from '../collab-shape.mjs'

const ACCOUNT_HANDLES = { flickday: 'flickday.media', ninophoto: 'nino.chavez.photo', letspepper: 'letspepper.open' }
const decide = (queue, id, choice) => decideCollab(queue, id, choice, { accountHandles: ACCOUNT_HANDLES })

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
  const none = decide({ items: [item()] }, 'album-gallery-announce', { choice: 'none' }).item
  assert.deepEqual(none.collab, { status: 'none' })
  assert.deepEqual(none.collaborators, [])
  const handles = decide({ items: [item()] }, 'album-gallery-announce', { choice: 'handles', handles: '@nino.chavez.photo, other.account' }).item
  assert.deepEqual(handles.collab, { status: 'decided', handles: ['nino.chavez.photo', 'other.account'] })
  assert.deepEqual(handles.collaborators, ['nino.chavez.photo', 'other.account'])
})

test('decideCollab: validates Instagram usernames and refuses a Story', () => {
  assert.equal(normalizeInstagramHandle('@nino.chavez.photo'), 'nino.chavez.photo')
  assert.equal(normalizeInstagramHandle('not a handle'), null)
  assert.match(decide({ items: [item()] }, 'album-gallery-announce', { choice: 'handles', handles: 'not a handle' }).refused, /valid Instagram usernames/)
  assert.match(decide({ items: [item({ media_type: 'STORIES' })] }, 'album-gallery-announce', { choice: 'none' }).refused, /Stories cannot carry a Collab/)
})

test('decideCollab: the publishing account cannot be its own Collab', () => {
  // Codex review of #67: Meta rejects a self-invite, which kills the Instagram leg and the Story.
  assert.match(decide({ items: [item()] }, 'album-gallery-announce', { choice: 'handles', handles: '@Flickday.Media' }).refused, /publishes this post/)
  // A legacy item still posting from nino.chavez.photo cannot pick "Collab with me".
  assert.match(decide({ items: [item({ account: 'ninophoto' })] }, 'album-gallery-announce', { choice: 'nino' }).refused, /publishes this post/)
  assert.throws(() => decideCollab({ items: [item()] }, 'album-gallery-announce', { choice: 'none' }), /accountHandles/)
})
