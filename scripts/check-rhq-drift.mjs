/**
 * RHQ drift harness — verifies the hardcoded Let's Pepper seed in
 * `src/lib/standings-data.ts` still agrees with the tournament truth Rally HQ
 * derives from the live brackets.
 *
 * WHY THIS EXISTS
 * The seed `tournamentResults` table predates Rally HQ scoring the brackets: it
 * was the authoritative board "until Rally HQ scores the live bracket" (see the
 * note in standings-data.ts). RHQ now serves correct placements, and the
 * /standings page already unions the live `/api/standings-results` over the seed.
 * But the seed is still the SSR/first paint AND the sole source for the player /
 * head-to-head / vote surfaces that were never wired to RHQ. So when RHQ and the
 * seed disagree, those surfaces silently render stale truth. This harness makes
 * that disagreement loud.
 *
 * WHAT IT IS NOT
 * Not a migration and not a reconciler. It REPORTS drift; it never edits the
 * seed. Which name is canonical when they differ (e.g. "Bell Pepper Open" vs
 * "Grass Clash") is a data-owner call, not something a check should silently pick.
 * It is also NOT wired into `next build` — RHQ is a live network dependency, so
 * this is an on-demand / scheduled check, not a hermetic build gate.
 *
 * USAGE
 *   npm run check:rhq-drift                         # checks against letspepper.com
 *   LP_URL=http://localhost:3000 npm run check:rhq-drift
 *
 * Compares the in-repo seed against the deployed `/api/standings-results`, which
 * is `getSeasonResults('lets-pepper-open-2026')` run with the production RHQ key
 * — i.e. exactly the RHQ-derived view the live site consumes. Exits non-zero when
 * any drift is found, so it can drive a scheduled alert. (It's an `.mjs` Node
 * script, like the others in this dir; Node strips the types off the imported
 * `.ts` seed so there's no single-source duplication.)
 */

import { tournamentResults } from '../src/lib/standings-data.ts'

const LP_URL = (process.env.LP_URL || 'https://letspepper.com').replace(/\/+$/, '')
const RESULTS_PATH = '/api/standings-results'

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** "June 7, 2026" or "Jun 7, 2026" -> "2026-06-07" (the stable cross-source join key). */
function toISODate(display) {
  const m = display.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/)
  if (!m) return null
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()]
  if (!month) return null
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
}

/** Canonical, order-independent signature for a team's roster. */
function teamKey(players) {
  return players.map((p) => p.trim()).sort().join(' | ')
}

/** place -> array of team rosters (each a sorted player array). */
function placementsByPlace(results) {
  const byPlace = new Map()
  for (const r of results) {
    const list = byPlace.get(r.place) ?? []
    list.push([...r.players].map((p) => p.trim()).sort())
    byPlace.set(r.place, list)
  }
  return byPlace
}

function diffEvent(date, seed, rhq) {
  const findings = []

  if (seed.event.trim() !== rhq.event.trim()) {
    findings.push({
      date,
      kind: 'name-mismatch',
      detail: `seed names it "${seed.event}", RHQ names it "${rhq.event}"`,
    })
  }

  const seedPlaces = placementsByPlace(seed.results)
  const rhqPlaces = placementsByPlace(rhq.results)
  const allPlaces = new Set([...seedPlaces.keys(), ...rhqPlaces.keys()])

  for (const place of [...allPlaces].sort((a, b) => a - b)) {
    const seedTeams = new Map((seedPlaces.get(place) ?? []).map((t) => [teamKey(t), t]))
    const rhqTeams = new Map((rhqPlaces.get(place) ?? []).map((t) => [teamKey(t), t]))

    for (const [k, t] of seedTeams) {
      if (!rhqTeams.has(k)) {
        findings.push({
          date,
          kind: 'placement-drift',
          detail: `place ${place}: seed has [${t.join(', ')}] — not at this place in RHQ`,
        })
      }
    }
    for (const [k, t] of rhqTeams) {
      if (!seedTeams.has(k)) {
        findings.push({
          date,
          kind: 'placement-drift',
          detail: `place ${place}: RHQ has [${t.join(', ')}] — not at this place in seed`,
        })
      }
    }
  }

  return findings
}

async function main() {
  const url = `${LP_URL}${RESULTS_PATH}`
  let rhqResults
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`FAIL: ${url} returned ${res.status}. Cannot check drift.`)
      process.exit(2)
    }
    const body = await res.json()
    rhqResults = body.results ?? []
  } catch (err) {
    console.error(`FAIL: could not reach ${url}:`, err instanceof Error ? err.message : err)
    process.exit(2)
  }

  if (rhqResults.length === 0) {
    console.error(`FAIL: ${url} returned zero results — RHQ unreachable or empty. Cannot check drift.`)
    process.exit(2)
  }

  // Align by ISO date — the one field that survives the naming churn this catches.
  const seedByDate = new Map()
  const seedUnparseable = []
  for (const t of tournamentResults) {
    const iso = toISODate(t.date)
    if (!iso) { seedUnparseable.push(`${t.event} (${t.date})`); continue }
    seedByDate.set(iso, t)
  }

  const rhqByDate = new Map()
  const rhqUnparseable = []
  for (const t of rhqResults) {
    const iso = toISODate(t.date)
    if (!iso) { rhqUnparseable.push(`${t.event} (${t.date})`); continue }
    rhqByDate.set(iso, t)
  }

  const findings = []
  const allDates = new Set([...seedByDate.keys(), ...rhqByDate.keys()])

  for (const date of [...allDates].sort()) {
    const seed = seedByDate.get(date)
    const rhq = rhqByDate.get(date)
    if (seed && !rhq) {
      findings.push({ date, kind: 'event-only-in-seed', detail: `"${seed.event}" is in the seed but RHQ serves nothing for ${date}` })
    } else if (!seed && rhq) {
      findings.push({ date, kind: 'event-only-in-rhq', detail: `RHQ serves "${rhq.event}" for ${date} but the seed has no such event` })
    } else if (seed && rhq) {
      findings.push(...diffEvent(date, seed, rhq))
    }
  }

  // ---- Report ----
  console.log(`RHQ drift check — seed (src/lib/standings-data.ts) vs ${url}`)
  console.log(`  seed events: ${tournamentResults.length}   RHQ events: ${rhqResults.length}\n`)

  if (seedUnparseable.length) console.log(`  ⚠ seed dates not parseable (skipped): ${seedUnparseable.join('; ')}`)
  if (rhqUnparseable.length) console.log(`  ⚠ RHQ dates not parseable (skipped): ${rhqUnparseable.join('; ')}`)

  if (findings.length === 0) {
    console.log('✓ NO DRIFT — the seed agrees with Rally HQ on every event, name, and placement.')
    process.exit(0)
  }

  const byKind = (k) => findings.filter((f) => f.kind === k)
  const sections = [
    ['event-only-in-seed', 'Events in the seed but NOT served by RHQ'],
    ['event-only-in-rhq', 'Events served by RHQ but NOT in the seed'],
    ['name-mismatch', 'Event NAME drift (data-owner call — not auto-reconciled)'],
    ['placement-drift', 'Placement / roster drift'],
  ]

  console.log(`✗ DRIFT FOUND — ${findings.length} finding(s):\n`)
  for (const [kind, label] of sections) {
    const rows = byKind(kind)
    if (!rows.length) continue
    console.log(`  ${label}:`)
    for (const f of rows) console.log(`    • [${f.date}] ${f.detail}`)
    console.log('')
  }

  console.log('This check reports drift; it does not edit the seed. Resolve by either')
  console.log('correcting the seed, fixing the RHQ data, or (long-term) cutting the')
  console.log('seed-backed surfaces over to RHQ reads.')
  process.exit(1)
}

main()
