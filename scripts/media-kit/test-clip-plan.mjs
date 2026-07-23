#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createEditPlan, createEditPlans, emptyClip, recordsFromCsv, recordsToCsv } from '../../creative/editor-kits/capcut/clip-mapper/clip-plan-core.mjs'

const valid = emptyClip({
  clip_id: 'demo-001',
  file: 'demo-ace.mp4',
  event: 'Demo Event',
  event_date: '2026-01-01',
  team_a: 'Northline',
  team_b: 'Sideout',
  players: 'Jordan Lee',
  participant_handles: '@demo.player',
  court: 'Court 2',
  round: 'Quarterfinal',
  play_type: 'serve ace',
  outcome: 'Northline wins the point',
  score: '18–16',
  clip_in: '0:02.000',
  moment_time: '0:04.250',
  clip_out: '0:06.500',
  footage_tone: 'mostly-light',
  ball_visibility: 'clear',
  footage_credit: '@demo.creator',
  editor_credit: '@demo.editor',
  rights_status: 'approved',
  copy_status: 'approved',
  caption_action: 'gallery',
})

const roundTrip = recordsFromCsv(recordsToCsv([valid]))
assert.equal(roundTrip.length, 1)
assert.equal(roundTrip[0].participant_handles, '@demo.player')

const plan = createEditPlan(roundTrip[0])
assert.equal(plan.ready, true)
assert.equal(plan.facts.playType, 'ace')
assert.equal(plan.treatment.assets.moment.endsWith('/moments/ace.png'), true)
assert.equal(plan.treatment.assets.bug.endsWith('/bugs/brand-dark.png'), true)
assert.equal(plan.queueDraft.user_tags[0], 'demo.player')
assert.match(plan.caption.text, /Clean from the line\./)
assert.doesNotMatch(plan.caption.text, /\{[^}]+\}/)

const permissionPending = createEditPlan({ ...valid, rights_status: 'pending' })
assert.equal(permissionPending.ready, false)
assert.equal(permissionPending.blockers.some((issue) => issue.field === 'rights_status'), true)

const placeholder = createEditPlan({ ...valid, team_a: 'TBD' })
assert.equal(placeholder.ready, false)
assert.equal(placeholder.blockers.some((issue) => issue.field === 'team_a'), true)

const badTiming = createEditPlan({ ...valid, clip_in: '0:05', moment_time: '0:04', clip_out: '0:07' })
assert.equal(badTiming.ready, false)
assert.equal(badTiming.blockers.some((issue) => issue.field === 'moment_time'), true)

const duplicateIds = createEditPlans([valid, { ...valid, file: 'demo-ace-2.mp4' }])
assert.equal(duplicateIds.every((item) => item.ready === false), true)
assert.equal(duplicateIds.every((item) => item.blockers.some((issue) => issue.field === 'clip_id')), true)

console.log('✓ Clip plan tests passed: CSV, routing, copy, permission, placeholders, timing, and duplicate IDs')
