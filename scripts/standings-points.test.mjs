/**
 * Points-race scoring (src/lib/standings-data.ts).
 *
 * The 2026 Jalapeño Open ran double elimination, which finishes teams at exact
 * places like 4th and 7th. The old table only listed the tied places a
 * single-elimination bracket produces (1, 2, 3, 5, 9), so 4th fell through to
 * the 5-point participation floor and scored below 9th place.
 *
 * Run: pnpm test:standings
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getPoints, tournamentResults } from '../src/lib/standings-data.ts'

test('each finishing tier scores its points', () => {
  const expected = { 1: 100, 2: 75, 3: 50, 4: 50, 5: 25, 7: 25, 8: 25, 9: 10, 16: 10, 17: 5, 33: 5 }
  for (const [place, points] of Object.entries(expected)) {
    assert.equal(getPoints(Number(place)), points, `place ${place}`)
  }
})

test('a missing or invalid place scores the participation floor, never a win', () => {
  // Live Rally HQ results reach getPoints unvalidated. A team with no finish yet
  // (place 0, null, or not a number) must not outrank the champion.
  for (const place of [0, -1, 2.5, null, undefined, Number.NaN, '1']) {
    assert.equal(getPoints(place), 5, `place ${String(place)}`)
  }
})

test('a worse finish never scores more points', () => {
  for (let place = 2; place <= 40; place++) {
    assert.ok(getPoints(place) <= getPoints(place - 1), `place ${place} outscores place ${place - 1}`)
  }
})

test('every place in the results snapshot scores at least the participation floor', () => {
  for (const event of tournamentResults) {
    for (const team of event.results) {
      assert.ok(getPoints(team.place) >= 5, `${event.id} place ${team.place}`)
    }
  }
})
