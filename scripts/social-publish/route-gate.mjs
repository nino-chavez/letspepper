/**
 * Route gate — the check between a queue item and the Graph API.
 *
 * WHY THIS EXISTS (2026-09-21): an agent asked to publish an ad hoc Collab
 * carousel found this publisher, confirmed it could do the job, and published
 * live 53 seconds before Nino said the post should have gone out by hand. The
 * publisher being ABLE to do a job is not approval to use it. Posts to Nino's
 * accounts go out by hand (native Instagram, or Meta Business Suite) unless he
 * has approved the Graph API for that post or campaign. The routing table is
 * owned by the `meta-publish` skill; this file only enforces it. The three
 * route lines in refusal() are the one deliberate copy of that table — a
 * refusal has to be readable by an agent that will not follow a pointer — so an
 * edit to the skill's table sweeps refusal() in the same change.
 *
 * An item may reach the Graph API when ONE of these holds:
 *   standing route  its event is listed in graph-routes.json (tracked, so the
 *                   approval is a reviewable diff). For scheduled, batch and
 *                   drip campaigns.
 *   one-off route   the item carries a `route` receipt, written by passing
 *                   --graph-route "<Nino's words>" to the publishing command.
 *                   The receipt stays on the item in the queue ledger.
 *
 * A one-off is ONE post. Without a standing route a run may publish exactly one
 * item, so one reason can never be stretched over a backlog (`--force --count 80`
 * is refused), and a bare run cannot sweep up several receipted leftovers. A
 * receipt also goes stale after RECEIPT_TTL_HOURS: approval for an ad hoc post
 * means "now", and a post that failed and sat for a week gets asked about again
 * rather than published on an old yes.
 *
 * The check runs before the copy audit, the R2 upload and the first Graph
 * call, and it runs on --dry-run too: a dry run that passes where the live run
 * would refuse is a lie about what the live run will do.
 *
 * NOT GATED HERE, on purpose: worker/src/index.js (the scheduled publisher)
 * reads its own KV queue, and getting an item into KV is already a deliberate
 * remote write. build-fb-album.mjs bulk-fills an existing Facebook album, a
 * batch job the composer cannot do.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// Fixed path, no env override: an override would be a way to point the
// publisher at a different approval list.
const ROUTES_PATH = join(HERE, 'graph-routes.json')

export const REFUSED = 3 // exit code, distinct from the generic 1
const ADHOC = 'adhoc' // post-now's ledger: every item in it is a one-off by definition
const MIN_REASON = 12 // long enough that "ok" / "yes" / "approved" do not pass
export const RECEIPT_TTL_HOURS = 24

export function loadRoutes(path = ROUTES_PATH) {
  if (!existsSync(path)) return { events: {} }
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return { events: parsed && typeof parsed.events === 'object' && parsed.events ? parsed.events : {} }
}

const filled = (v) => typeof v === 'string' && v.trim().length > 0

export function hasStandingRoute(event, routes) {
  if (event === ADHOC) return false
  const entry = routes?.events?.[event]
  return !!entry && typeof entry === 'object' && filled(entry.reason) && filled(entry.approved)
}

const wellFormed = (r) => !!r && typeof r === 'object' && r.surface === 'graph' && filled(r.reason) && filled(r.recorded_at)

/** A receipt that is well formed AND still fresh. */
export function hasReceipt(item, now = new Date()) {
  const r = item?.route
  if (!wellFormed(r)) return false
  const age = now.getTime() - new Date(r.recorded_at).getTime()
  return Number.isFinite(age) && age >= 0 && age <= RECEIPT_TTL_HOURS * 3600_000
}

const isStale = (item, now) => wellFormed(item?.route) && !hasReceipt(item, now)

/** A usable --graph-route value, or null. A bare flag parses to `true`. */
export function cleanReason(flag) {
  if (typeof flag !== 'string') return null
  const reason = flag.trim()
  return reason.length >= MIN_REASON ? reason : null
}

export function makeReceipt(reason, via, now = new Date()) {
  return { surface: 'graph', reason, recorded_at: now.toISOString(), via }
}

/**
 * Pure decision. `reasonFlag` is the raw --graph-route value (string | true | undefined).
 * Returns { ok, kind, why, missing, stale, stamp }. `stamp` holds the one item
 * that should be given a receipt built from the reason; the caller decides when
 * to persist it. `why` on a refusal: 'batch' (a one-off run of more than one
 * item), 'reason' (an unusable --graph-route value), 'route' (nothing approved).
 */
export function checkRoute({ event, items, routes, reasonFlag, now = new Date() }) {
  if (hasStandingRoute(event, routes)) return { ok: true, kind: 'standing', missing: [], stale: [], stamp: [] }
  const missing = items.filter((it) => !hasReceipt(it, now))
  const stale = items.filter((it) => isStale(it, now))
  const no = (why) => ({ ok: false, kind: null, why, missing, stale, stamp: [] })
  if (items.length !== 1) return no('batch')
  if (!missing.length) return { ok: true, kind: 'one-off', missing: [], stale: [], stamp: [] }
  const reason = cleanReason(reasonFlag)
  if (reason) return { ok: true, kind: 'one-off', missing: [], stale: [], stamp: missing, reason }
  return no(reasonFlag !== undefined ? 'reason' : 'route')
}

export function refusal({ event, items = [], missing = [], stale = [], script, why = 'route' }) {
  const list = (arr) => `${arr.slice(0, 5).map((it) => it.id).filter(Boolean).join(', ')}${arr.length > 5 ? ', …' : ''}`
  const what = why === 'batch' ? `${items.length} items in this run` : missing.length ? `item: ${list(missing)}` : 'this post'
  return [
    '',
    `REFUSED — no approved Graph route for event "${event}" (${what}).`,
    'Nothing was queued, uploaded, or sent to Meta.',
    '',
    why === 'batch'
      ? `A one-off route covers ONE post, and this run would publish ${items.length} (${list(items)}). Publish one item with --id <item-id>.\nSeveral posts on a schedule is a campaign, and a campaign needs a standing route from Nino — a reason given for one post does not stretch over a queue.\n`
      : null,
    why === 'reason'
      ? `--graph-route needs Nino's own words as its value (at least ${MIN_REASON} characters). A bare flag or "ok" is not a reason.\n`
      : null,
    stale.length
      ? `${list(stale)}: the route receipt is older than ${RECEIPT_TTL_HOURS}h. Approval for an ad hoc post means "now" — ask again before publishing it.\n`
      : null,
    "Posts to Nino's accounts go out by hand unless he has approved the Graph API for them:",
    '  a Collab, or a Story with a sticker, link or mention  → native Instagram (Computer Use + iPhone Mirroring)',
    '  an ordinary Instagram + Facebook Page crosspost       → Meta Business Suite',
    '  a scheduled, batch, drip or queue-owned campaign      → this publisher',
    '',
    'Load the `meta-publish` skill before anything else. It owns the routing table and the preflight manifest.',
    '',
    'This publisher being able to do the job is not the approval — it can publish Collab carousels, and that is',
    'exactly how the wrong surface got used on 2026-09-21. Approval is Nino naming the Graph API for this post or campaign:',
    `  one post:  re-run ${script} with  --graph-route "<his words, quoted>"   (recorded on the queue item)`,
    '  campaign:  add the event to scripts/social-publish/graph-routes.json   (tracked, so he reviews the diff)',
    'Writing either without his instruction forges an approval. A scratch worktree or a copied queue changes nothing here.',
    '',
  ].filter((l) => l !== null).join('\n')
}

/** For a builder that publishes at the end (--post): the same check, run before the batch exists. */
export function assertRouteBeforeBuild({ event, reasonFlag, script, routes }) {
  return assertGraphRoute({ event, items: [{ id: `${event}, not built yet` }], reasonFlag, script, routes, beforeBuild: true })
}

/**
 * Enforce. Stamps the one-off receipt onto the item in place when a reason was
 * given. The caller persists it, and does so only once the run is past its
 * other pre-flight checks (token, copy audit), so a run that aborts there does
 * not leave an approved-looking item behind. Exits REFUSED before any side
 * effect when no route holds.
 */
export function assertGraphRoute({ event, items, reasonFlag, script, routes = loadRoutes(), now = new Date(), beforeBuild = false }) {
  const verdict = checkRoute({ event, items, routes, reasonFlag, now })
  if (!verdict.ok) {
    console.error(refusal({ event, items, missing: verdict.missing, stale: verdict.stale, script, why: verdict.why }))
    process.exit(REFUSED)
  }
  for (const it of verdict.stamp) it.route = makeReceipt(verdict.reason, `${script} --graph-route`, now)
  const how = verdict.kind === 'standing'
    ? `standing route in graph-routes.json`
    : !verdict.stamp.length ? 'one-off receipt already on the item'
    : beforeBuild ? `one-off reason accepted: "${verdict.reason}" (post-reels.mjs records it when it publishes)`
    : `one-off: "${verdict.reason}" (recorded on the item once the pre-flight checks pass)`
  console.log(`Graph route ok for "${event}" — ${how}`)
  return verdict
}
