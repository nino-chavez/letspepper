/**
 * Route gate — the check between a queue item and the Graph API.
 *
 * WHY THIS EXISTS (2026-09-21): an agent asked to publish an ad hoc Collab
 * carousel found this publisher, confirmed it could do the job, and published.
 * Nino's correction — the post should have gone out by hand — arrived 26 seconds
 * after it went live (17:12:39Z publish, 17:13:05Z correction, Codex 01a0c4e7). The
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
 * A one-off is ONE post, and it is the post Nino NAMED. Without a standing route
 * a run may publish exactly one item, and that item has to be picked with --id:
 * `--count 1` on a queue with several due items would otherwise publish whichever
 * is oldest and record his words against a post he never saw. So one reason can
 * never be stretched over a backlog (`--force --count 80` is refused), and a bare
 * run cannot sweep up several receipted leftovers. A
 * receipt also goes stale after RECEIPT_TTL_HOURS: approval for an ad hoc post
 * means "now", and a post that failed and sat for a week gets asked about again
 * rather than published on an old yes.
 *
 * A receipt approves THAT post. It carries a digest of what Nino was shown —
 * the publishing account, media type, caption, collaborators, tags and media
 * URLs — and stops covering the item the moment any of them changes. Otherwise
 * a post that failed could be "fixed" (new photos, a new caption, --account
 * pointed somewhere else) and re-run inside the 24 hours on a yes that was given
 * to something different.
 *
 * The check runs before the copy audit, the R2 upload and the first Graph
 * call, and it runs on --dry-run too: a dry run that passes where the live run
 * would refuse is a lie about what the live run will do.
 *
 * The scheduled Worker (worker/src/index.js) is gated separately, on the same
 * entry shape (route-shape.mjs): it publishes only items whose KV queue carries
 * `meta.route`, a copy of this event's graph-routes.json entry that seed-kv.mjs
 * writes. NOT GATED, on purpose: build-fb-album.mjs bulk-fills an existing
 * Facebook album, a batch job the composer cannot do.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filled, standingEntry, entryCovers } from './route-shape.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
// Fixed path, no env override: an override would be a way to point the
// publisher at a different approval list.
const ROUTES_PATH = join(HERE, 'graph-routes.json')

export const REFUSED = 3 // exit code, distinct from the generic 1
const MIN_REASON = 12 // long enough that "ok" / "yes" / "approved" do not pass
export const RECEIPT_TTL_HOURS = 24

export function loadRoutes(path = ROUTES_PATH) {
  if (!existsSync(path)) return { events: {} }
  let parsed
  try { parsed = JSON.parse(readFileSync(path, 'utf8')) } catch (e) {
    // Fail closed, with the gate's own exit code: an unreadable approval list approves nothing.
    console.error(`REFUSED — ${path} is not valid JSON (${e.message}). No standing route can be read from it.`)
    process.exit(REFUSED)
  }
  return { events: parsed && typeof parsed.events === 'object' && parsed.events ? parsed.events : {} }
}

export { standingEntry, entryCovers }

/**
 * A standing route covers a run only for the accounts it names, and only until
 * it expires. `accounts` are the accounts this run would publish to, after any
 * --account override — so an approved campaign cannot be pointed somewhere else.
 */
export function hasStandingRoute(event, routes, accounts = [], now = new Date()) {
  return entryCovers(standingEntry(event, routes), accounts, now)
}

const wellFormed = (r) => !!r && typeof r === 'object' && r.surface === 'graph' &&
  filled(r.reason) && filled(r.recorded_at) && filled(r.digest)

/**
 * What an approval is an approval OF. `account` is the account the run will
 * actually publish to, which --account can point away from item.account.
 */
export function digestOf(item, account, event = '') {
  // Mirror post-reels.mjs / worker buildContainer(): hash the fields that are
  // actually sent, per media type. alt_text rides along with its image (Meta
  // supports it on a single image or an image carousel child, never video) —
  // but ONLY when present: a legacy item with no alt_text and no Facebook
  // destination must hash EXACTLY as it did before alt_text/Facebook existed,
  // or every live one-off receipt reads as "changed" the moment this ships and
  // post-reels.mjs rebuilds every saved container on its next run for nothing.
  const type = item?.media_type || 'REELS'
  const imageTuple = (url, alt) => (alt ? ['IMAGE', url ?? null, alt] : ['IMAGE', url ?? null])
  const media = type === 'CAROUSEL'
    ? (item.children || []).map((c) => (c.media_type === 'VIDEO' ? ['VIDEO', c.video_url || null] : imageTuple(c.image_url, c.alt_text)))
    : type === 'IMAGE' ? [imageTuple(item?.image_url, item?.alt_text)]
    : type === 'STORIES' ? [item?.video_url ? ['VIDEO', item.video_url] : ['IMAGE', item?.image_url || null]]
    : [['VIDEO', item?.video_url || null]]
  // Stories are bare media: caption, tags and collaborators are not sent, so they are not part of what was approved.
  const words = type === 'STORIES' ? [] : [item?.caption || '', item?.collaborators || [], item?.user_tags || []]
  // channels/facebook_* only matter when this item also crosses to a Facebook Page —
  // included so a one-off approval binds to that destination's content too. Omitted
  // entirely (not even as a null slot) for anything that isn't a Facebook crosspost.
  const facebook = Array.isArray(item?.channels) && item.channels.includes('facebook')
    ? [item?.facebook_caption || null, item?.facebook_alt_text || null]
    : null
  const shown = [event, item?.id ?? null, account || item?.account || null, type, words, media, ...(facebook ? [facebook] : [])]
  return createHash('sha256').update(JSON.stringify(shown)).digest('hex').slice(0, 16)
}

const fresh = (r, now) => {
  const age = now.getTime() - new Date(r.recorded_at).getTime()
  return Number.isFinite(age) && age >= 0 && age <= RECEIPT_TTL_HOURS * 3600_000
}

/** A receipt that is well formed, still fresh, and still describes this post. */
export function hasReceipt(item, now = new Date(), account, event = '') {
  const r = item?.route
  return wellFormed(r) && fresh(r, now) && r.digest === digestOf(item, account, event)
}

const isExpired = (item, now) => wellFormed(item?.route) && !fresh(item.route, now)
const isChanged = (item, now, account, event) => wellFormed(item?.route) && fresh(item.route, now) && item.route.digest !== digestOf(item, account, event)

/** A usable --graph-route value, or null. A bare flag parses to `true`. */
export function cleanReason(flag) {
  if (typeof flag !== 'string') return null
  const reason = flag.trim()
  if (reason.length < MIN_REASON) return null
  // The approval has to be FOR this surface. "Nino said publish this now" is a yes to
  // publishing, which is exactly what got read as a yes to the API on 2026-09-21.
  // An affirmative construction ("use / via / through / with ... the API"), and no negation
  // on either side of it. A regex cannot settle intent; it can refuse the obvious misreadings.
  if (!/\b(use|using|via|through|with|for|run|send|post|publish)\b[^.;]{0,30}\b(graph|api)\b/i.test(reason)) return null
  if (/\b(don'?t|do not|not|never|no|without|instead of|avoid|skip|wrong)\b[^.;]{0,40}\b(graph|api)\b/i.test(reason)) return null
  if (/\b(graph|api)\b[^.;]{0,40}\b(not|never|wrong|shouldn'?t|should not|isn'?t|is not|skip|avoid)\b/i.test(reason)) return null
  return reason
}

export function makeReceipt(reason, via, now = new Date(), digest = '') {
  return { surface: 'graph', reason, recorded_at: now.toISOString(), via, digest }
}

/**
 * Pure decision. `reasonFlag` is the raw --graph-route value (string | true | undefined).
 * Returns { ok, kind, why, missing, stale, stamp }. `stamp` holds the one item
 * that should be given a receipt built from the reason; the caller decides when
 * to persist it. `why` on a refusal: 'batch' (a one-off run of more than one
 * item), 'unnamed' (one item, but chosen by queue order out of several rather
 * than by --id), 'reason' (an unusable --graph-route value), 'route' (nothing
 * approved). `named` is true when the caller picked the item with --id;
 * `candidates` is how many items were due before --count trimmed the batch;
 * `account` is the --account override, when one was given. `stale` lists items
 * whose receipt expired, `changed` those whose post no longer matches it.
 */
export function checkRoute({ event, items, routes, reasonFlag, now = new Date(), named = true, candidates = items.length, account }) {
  const accounts = [...new Set(items.map((it) => account || it.account).filter(Boolean))]
  if (hasStandingRoute(event, routes, accounts, now)) return { ok: true, kind: 'standing', missing: [], stale: [], changed: [], stamp: [] }
  const missing = items.filter((it) => !hasReceipt(it, now, account, event))
  const stale = items.filter((it) => isExpired(it, now))
  const changed = items.filter((it) => isChanged(it, now, account, event))
  const no = (why) => ({ ok: false, kind: null, why, missing, stale, changed, stamp: [] })
  if (items.length !== 1) return no('batch')
  if (!named && candidates > 1) return no('unnamed')
  if (!missing.length) return { ok: true, kind: 'one-off', missing: [], stale: [], changed: [], stamp: [] }
  const reason = cleanReason(reasonFlag)
  if (reason) return { ok: true, kind: 'one-off', missing: [], stale: [], changed: [], stamp: missing, reason }
  if (reasonFlag !== undefined) return no('reason')
  const entry = standingEntry(event, routes)
  return no(entry ? 'scope' : 'route')
}

export function refusal({ event, items = [], missing = [], stale = [], changed = [], script, why = 'route', candidates = items.length }) {
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
    why === 'unnamed'
      ? `A one-off route covers the post Nino NAMED. ${candidates} items are due in this queue and none was picked with --id, so this run would publish whichever is oldest (${list(items)}) and record his words against it. Pass --id <item-id>.\n`
      : null,
    why === 'reason'
      ? `--graph-route needs Nino's own words as its value, and they have to name the Graph API (or "the API") as the way this post goes out. "Publish this now" is a yes to publishing, not to this publisher. A bare flag, "ok", or a sentence telling you NOT to use the API is not a reason.\n`
      : null,
    why === 'scope'
      ? `"${event}" has a standing route, but not for this run: it names the accounts it covers and may carry an expiry, and --account cannot point an approved campaign somewhere else. Read its entry in graph-routes.json.\n`
      : null,
    stale.length
      ? `${list(stale)}: the route receipt is older than ${RECEIPT_TTL_HOURS}h. Approval for an ad hoc post means "now" — ask again before publishing it.\n`
      : null,
    changed.length
      ? `${list(changed)}: the post has changed since its route was approved — account, caption, media, tags or collaborators. The yes was for what Nino was shown then. Show him this version and ask again.\n`
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
export function assertRouteBeforeBuild({ event, account, reasonFlag, script, routes }) {
  return assertGraphRoute({ event, items: [{ id: `${event}, not built yet`, account }], reasonFlag, script, routes, beforeBuild: true })
}

/**
 * Enforce. Stamps the one-off receipt onto the item in place when a reason was
 * given. The caller persists it, and does so only once the run is past its
 * other pre-flight checks (token, copy audit), so a run that aborts there does
 * not leave an approved-looking item behind. Exits REFUSED before any side
 * effect when no route holds.
 */
export function assertGraphRoute({ event, items, reasonFlag, script, routes = loadRoutes(), now = new Date(), beforeBuild = false, named = true, candidates = items.length, account }) {
  const verdict = checkRoute({ event, items, routes, reasonFlag, now, named, candidates, account })
  if (!verdict.ok) {
    console.error(refusal({ event, items, missing: verdict.missing, stale: verdict.stale, changed: verdict.changed, script, why: verdict.why, candidates }))
    process.exit(REFUSED)
  }
  for (const it of verdict.stamp) it.route = makeReceipt(verdict.reason, `${script} --graph-route`, now, digestOf(it, account, event))
  const how = verdict.kind === 'standing'
    ? `standing route in graph-routes.json`
    : !verdict.stamp.length ? 'one-off receipt already on the item'
    : beforeBuild ? `one-off reason accepted: "${verdict.reason}" (post-reels.mjs records it when it publishes)`
    : `one-off: "${verdict.reason}" (recorded on the item once the pre-flight checks pass)`
  console.log(`Graph route ok for "${event}" — ${how}`)
  return verdict
}
