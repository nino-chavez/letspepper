/**
 * Which event the predictions page takes picks for (src/lib/predictions-data.ts).
 *
 * It used to be a hand-edited list pinned to the 2026 Bell Pepper Open, which
 * kept asking for picks four months after it was played. It now follows the
 * schedule: the next event a team can enter, locked at its first serve.
 *
 * Run: pnpm test:predictions
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentPredictionEvent } from '../src/lib/predictions-data.ts'
import { tournaments, isCancelled } from '../src/lib/tournaments.ts'

const bell = tournaments['bell-pepper-open']
const jalapeno = tournaments['jalapeno-open']
const dayAfter = (iso) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

test('before an event, picks target it and lock at its first serve', () => {
  const event = currentPredictionEvent('2026-05-01')
  assert.equal(event?.id, bell.rhqSlug)
  assert.equal(event.deadline, bell.startsAt)
  assert.match(event.event, /^Bell Pepper Open 2026$/)
  assert.ok(event.props.some((p) => p.question.includes('Bell Pepper Open')))
})

test('the day after an event, picks roll forward to the next one', () => {
  const event = currentPredictionEvent(dayAfter(bell.startsAt))
  assert.equal(event?.id, jalapeno.rhqSlug)
  assert.ok(event.props.some((p) => p.question.includes(jalapeno.name)))
  assert.ok(!event.props.some((p) => p.question.includes(bell.name)))
})

test('a cancelled event never takes picks', () => {
  for (const t of Object.values(tournaments).filter(isCancelled)) {
    assert.notEqual(currentPredictionEvent(t.startsAt.slice(0, 10))?.id, t.rhqSlug, t.slug)
  }
})

test('after the last scheduled event, nothing is open', () => {
  const last = Object.values(tournaments).map((t) => t.startsAt).sort().at(-1)
  assert.equal(currentPredictionEvent(dayAfter(last)), null)
})
