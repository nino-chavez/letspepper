/**
 * Phone notifications for the gallery-announce campaign, via ntfy.sh
 * (https://ntfy.sh/<topic>, docs fetched 2026-09-26 from https://docs.ntfy.sh/publish/).
 * Nino picked "phone notification" over Slack/email on 2026-09-26.
 *
 * Shared by local scripts (build-gallery-announce.mjs, veto-announce.mjs, seed-kv.mjs) AND
 * the scheduled Worker (worker/src/index.js) — so, like hold-shape.mjs and route-shape.mjs,
 * this file has NO node: imports and can go into the Worker bundle without nodejs_compat.
 * The Worker cannot shell out to `op`, so it gets the topic AND the review key as its own
 * secret bindings (NTFY_TOPIC, REVIEW_KEY — `wrangler secret put`); local callers read them
 * from process.env or `op read` THEMSELVES — this module only ever takes them as parameters
 * and never looks either up or logs one.
 *
 * The topic is ntfy.sh's only access control (anyone who knows it can publish or subscribe),
 * which is why it lives in 1Password rather than in this file or in git history. Same now
 * true of REVIEW_KEY: it travels inside every HELD/FAILED alert body (as the Review/Cancel
 * action URLs), so the alert itself is as sensitive as the topic — see SETUP.md.
 *
 * ALERT TEXT (rewritten 2026-09-26 — supersedes an earlier "Posts <holdUntil> Chicago time,
 * two veto commands in the body" draft after Nino read the live alerts on his phone and said
 * "i'm confused on what i'm supposed to do... hard to distinguish info from action"). The
 * rule now: say what will happen with NO action required, put the one action behind a
 * button, never print a terminal command into a phone alert.
 *   HELD    "Posts <next slot>: <short name> (<N> photos)" title, "Nothing to do. Cancel
 *           before <holdUntil> if you don't want it." body, Review (view) + Cancel post
 *           (http, one-tap, clears the notification) actions, tap-body → /review. No key →
 *           no actions/click, body says "It posts on its own," never a fallback command.
 *   POSTED  "Posted: <short name>" + a View-on-<channel> action to the permalink, plus (IG
 *           only, when a collaborator is set) a one-line Collab-acceptance reminder — Meta
 *           gives no API to accept an invite (see SETUP.md), so this is the only nudge.
 *   FAILED  "Didn't post: <short name>" + the channel and error, high priority, Review action.
 *   VETOED  "Cancelled: <short name>" — "won't post" (+ reason). veto-announce.mjs marks
 *           LOCAL ONLY (it never touches KV); the Worker's /review/cancel and seed-kv.mjs
 *           --veto both reach KV, so neither sets it.
 *
 * Header shapes, straight from the docs:
 *   Title    X-Title (alias Title) — plain text.
 *   Priority X-Priority (alias Priority) — one of max/urgent, high, default, low, min.
 *   Tags     X-Tags (alias Tags), comma-separated. A tag matching an emoji short code is
 *            rendered as an emoji by the ntfy app — Nino's no-emoji rule means every tag
 *            used below is a plain word chosen to NOT match a short code. Dropped entirely
 *            from HELD (2026-09-26): they render as a visible "Tags: ..." line, which is
 *            exactly the extra-things-to-read Nino's correction was about.
 *   Click    X-Click (alias Click) — a URL opened when the notification BODY is tapped.
 *   Actions  X-Actions (alias Actions) — up to 3 buttons. Short format, fetched 2026-09-26
 *            from docs.ntfy.sh/publish/#action-buttons (never guessed): one action per
 *            `; `-separated segment, its own fields comma-separated, a field containing a
 *            comma or semicolon double-quoted. This file uses two of the three documented
 *            action types:
 *              view  "view, <label>, <url>[, clear=true]"
 *              http  "http, <label>, <url>[, method=<verb>][, headers.<H>=<v>][, body=<b>]
 *                     [, clear=true]" — method defaults to POST, which is all this uses, so
 *                     it's omitted. `clear` removes the notification once the request the
 *                     button fired resolves — used on Cancel post so one tap both cancels
 *                     and dismisses the alert.
 *
 * "ntfy supports UTF-8 in HTTP headers, but not every library or programming language
 * does" (the docs' own words) — Node's fetch (undici) throws on a header value outside
 * Latin-1/ByteString, which an em dash or a curly quote IS outside of (an accented letter
 * like "ñ" is inside Latin-1 and would actually be fine either way). Rather than depend on
 * that boundary — or the docs' RFC 2047 escape — every header value here is transliterated
 * to plain ASCII first (asciiHeaderValue). These are short factual strings; losing an accent
 * mark costs nothing. `click` and `actions` URLs are passed through untransliterated (see
 * their own comments) — mangling a URL breaks the link outright, which is worse than the
 * header-encoding risk this guards against, and every URL this file builds is already
 * ASCII (album ids, review keys, https://).
 *
 * Never throws: a notification failure must not block or fail a publish. Every call site
 * awaits notify() and it always resolves, logging (never the topic, the review key, or the
 * full URL) on failure.
 */

const NTFY_BASE = 'https://ntfy.sh'
const DEFAULT_TIMEOUT_MS = 5000
const WORKER_ORIGIN = 'https://letspepper-reels-worker.biq.workers.dev'
const DEFAULT_ALLOWED_HOURS_UTC = [17, 22] // mirrors worker/wrangler.jsonc's ALLOWED_HOURS_UTC var — a
// caller with the live env value (the Worker itself) should pass it instead of relying on this default.

/** Plain-ASCII transliteration for one header value. Pure, no network — accents are
 * dropped (NFKD decomposition + strip combining marks, so "ñ" -> "n"), en/em dashes and
 * curly quotes are normalized to their ASCII equivalents, and anything still outside
 * printable ASCII is dropped rather than risk a runtime header-encoding error. */
export function asciiHeaderValue(value = '') {
  return String(value)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[‒-―−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
}

/** One ntfy Actions-header field, quoted only when it carries a comma or semicolon (the
 * two characters the short format's own separators use) — per the docs' own examples,
 * every other character (including spaces) is safe unquoted. */
function actionField(value) {
  const s = String(value)
  return /[,;]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
}

/** The X-Actions header value for one or more actions — see this file's header for the
 * short-format shape, fetched live from docs.ntfy.sh rather than guessed. Only `view` and
 * `http` are implemented; nothing here uses ntfy's third type (`broadcast`, an Android
 * intent). */
export function buildActionsHeader(actions = []) {
  return actions.map((a) => {
    if (a.action === 'view') {
      const parts = ['view', actionField(a.label), actionField(a.url)]
      if (a.clear) parts.push('clear=true')
      return parts.join(', ')
    }
    if (a.action === 'http') {
      const parts = ['http', actionField(a.label), actionField(a.url)]
      if (a.method) parts.push(`method=${a.method}`)
      if (a.clear) parts.push('clear=true')
      return parts.join(', ')
    }
    throw new Error(`buildActionsHeader: unknown action type "${a.action}"`)
  }).join('; ')
}

/**
 * The exact request ntfy.sh/publish/ documents for one notification — pure, no network,
 * so it's directly testable without mocking fetch. `click` and each action's `url`, if
 * present, must already be well-formed URLs (passed through, not transliterated — mangling
 * one would break the link).
 */
export function buildNtfyRequest({ topic, title, message, priority = 'default', tags = [], click, actions = [] } = {}) {
  if (!topic) throw new Error('notify: no topic given')
  const headers = { 'content-type': 'text/plain; charset=utf-8' }
  if (title) headers['X-Title'] = asciiHeaderValue(title)
  if (priority) headers['X-Priority'] = priority
  if (Array.isArray(tags) && tags.length) headers['X-Tags'] = tags.map(asciiHeaderValue).join(',')
  if (click) headers['X-Click'] = click
  if (Array.isArray(actions) && actions.length) headers['X-Actions'] = buildActionsHeader(actions)
  return { url: `${NTFY_BASE}/${topic}`, headers, body: asciiHeaderValue(message || '') }
}

/**
 * POST one notification to ntfy.sh. Never throws — every failure (missing topic, network
 * error, timeout, non-2xx) is caught and logged without the topic or URL, and resolves
 * to { ok: false, error } rather than rejecting, so a caller can `await notify(...)`
 * unconditionally without a try/catch of its own. Resolves { ok: true } on a 2xx.
 */
export async function notify({ topic, title, message, priority, tags, click, actions, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!topic) { console.error('notify: skipped — no topic configured (NTFY_TOPIC unset)'); return { ok: false, error: 'no topic' } }
  let request
  try { request = buildNtfyRequest({ topic, title, message, priority, tags, click, actions }) }
  catch (e) { console.error(`notify: could not build request — ${e.message}`); return { ok: false, error: e.message } }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const res = await fetchImpl(request.url, {
      method: 'POST', headers: request.headers, body: request.body,
      ...(controller ? { signal: controller.signal } : {}),
    })
    if (!res.ok) { console.error(`notify: ntfy.sh refused the notification (${res.status})`); return { ok: false, error: `http ${res.status}` } }
    return { ok: true }
  } catch (e) {
    console.error(`notify: failed to reach ntfy.sh — ${e.message}`) // never the topic/URL
    return { ok: false, error: e.message }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Time formatting + scheduling — shared by the alert builders below and by
// worker/src/index.js's /review page, so the two surfaces never show two
// different ideas of "when."
// ---------------------------------------------------------------------------

/** "Sat 10:08 PM Central" — plain, no-jargon Chicago-time label. Never "CDT"/"CST" (Nino:
 * the alert should read as a time, not a timezone lesson) and never a bare ISO string.
 * Returns null for a missing/invalid input rather than "Invalid Date". */
export function chicagoLabel(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const s = d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return `${s.replace(',', '')} Central`
}

/**
 * The first ALLOWED_HOURS_UTC slot at or after `afterIso` — what the HELD alert's title
 * calls "Posts at" (Nino, 2026-09-26: "the post goes out at the first ALLOWED_HOURS_UTC
 * slot at or after holdUntil"). `hours` should be the caller's actual configured hours
 * (the Worker passes its own env var; a local caller that cannot read the live Worker
 * config falls back to DEFAULT_ALLOWED_HOURS_UTC, which mirrors wrangler.jsonc). Pure;
 * rolls to the next day's first slot when `afterIso` is past every slot for its own day.
 */
export function nextAllowedSlot(afterIso, hours = DEFAULT_ALLOWED_HOURS_UTC) {
  const sorted = [...hours].sort((a, b) => a - b)
  const after = new Date(afterIso)
  const dayStart = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate())
  const sameDay = sorted.map((h) => dayStart + h * 3600_000).find((t) => t >= after.getTime())
  const t = sameDay ?? (dayStart + 86_400_000 + sorted[0] * 3600_000)
  return new Date(t).toISOString()
}

/** The /review page link for one item — carried as the HELD alert's tap-body Click target,
 * its Review action, and the FAILED alert's Review action. Undefined when no key resolves,
 * so every caller fails soft (see resolveReviewKey() in build-gallery-announce.mjs and
 * REVIEW_KEY in worker/src/index.js) rather than sending a link that 403s. */
export function reviewUrlFor(reviewKey, itemId) {
  if (!reviewKey || !itemId) return undefined
  return `${WORKER_ORIGIN}/review?key=${encodeURIComponent(reviewKey)}#${encodeURIComponent(itemId)}`
}

/** The one-tap Cancel action's target — key and id ride the query string, not a form body:
 * ntfy's `http` action sends no form content-type, so worker/src/index.js's /review/cancel
 * has to (and does) accept this shape as an alternative to the review page's own HTML form
 * POST. See that handler's own comment. */
export function reviewCancelUrlFor(reviewKey, itemId) {
  if (!reviewKey || !itemId) return undefined
  return `${WORKER_ORIGIN}/review/cancel?key=${encodeURIComponent(reviewKey)}&id=${encodeURIComponent(itemId)}`
}

// ---------------------------------------------------------------------------
// Event-specific builders — pure (no network, no topic/key lookup), so each is
// directly testable and --dry-run can print exactly what WOULD be sent.
// ---------------------------------------------------------------------------

/** a. HELD — build-gallery-announce.mjs, appended (non-dry-run) only. `shortName` is the
 * event/matchup segment of the album name ("JCA at ACC"), not its full standard name —
 * gallery-announce-caption.mjs's shortAlbumName() derives it; this module never parses an
 * album name itself. Fail-soft shape: pass reviewUrl/reviewCancelUrl only when REVIEW_KEY
 * resolved — with neither, this sends the outcome alone and no action can be taken from the
 * alert (the caller already logged why; see resolveReviewKey()). Never a terminal command
 * in the body — that was the pre-2026-09-26 shape Nino read as "too much to parse." */
export function heldNotification({ shortName, photoCount, holdUntilIso, nextSlotIso, reviewUrl, reviewCancelUrl }) {
  const plural = photoCount === 1 ? '' : 's'
  const actions = []
  if (reviewUrl) actions.push({ action: 'view', label: 'Review', url: reviewUrl })
  if (reviewCancelUrl) actions.push({ action: 'http', label: 'Cancel post', url: reviewCancelUrl, clear: true })
  return {
    title: `Posts ${chicagoLabel(nextSlotIso)}: ${shortName} (${photoCount} photo${plural})`,
    message: reviewUrl
      ? `Nothing to do. Cancel before ${chicagoLabel(holdUntilIso)} if you don't want it.`
      : 'Nothing to do. It posts on its own.',
    priority: 'default',
    click: reviewUrl || undefined,
    actions,
  }
}

/** b. POSTED — Worker, once per channel that actually published. `collaborator`: Meta gives
 * no API to accept a Collab invite (SETUP.md), so the only nudge is this line — shown on the
 * Instagram destination only, since Facebook carries no Collab at all. */
export function postedNotification({ albumName, channel, permalink, collaborator }) {
  const channelLabel = channel === 'facebook' ? 'Facebook' : 'Instagram'
  const message = channel === 'instagram' && collaborator
    ? `Accepted the Collab yet? Open Instagram as ${collaborator} and accept the invite.`
    : 'Live.'
  return {
    title: `Posted: ${albumName}`,
    message: permalink ? message : `${message}\n(No permalink available.)`,
    priority: 'default',
    tags: ['gallery-announce', 'posted', channel],
    click: permalink || undefined,
    actions: permalink ? [{ action: 'view', label: `View on ${channelLabel}`, url: permalink }] : [],
  }
}

/** c. FAILED — Worker, terminal errors only (never a transient "resumes next run" note). */
export function failedNotification({ albumName, channel, error, reviewUrl }) {
  const channelLabel = channel === 'facebook' ? 'Facebook' : 'Instagram'
  return {
    title: `Didn't post: ${albumName}`,
    message: `${channelLabel} didn't post: ${error}`,
    priority: 'high',
    tags: ['gallery-announce', 'failed', channel],
    click: reviewUrl || undefined,
    actions: reviewUrl ? [{ action: 'view', label: 'Review', url: reviewUrl }] : [],
  }
}

/** d. VETOED — veto-announce.mjs (local only, `localOnly: true`) or a cancel that reached
 * KV — the Worker's /review/cancel or seed-kv.mjs --veto (`localOnly: false`). `localOnly`
 * must be honest: a confirmation that doesn't say "local only" reads as "this is stopped,"
 * and it is not stopped until the same veto reaches the Worker's copy in KV. */
export function vetoedNotification({ albumName, reason, localOnly }) {
  return {
    title: `Cancelled: ${albumName}`,
    message: [
      `Won't post.${reason ? ` ${reason}.` : ''}`,
      localOnly
        ? 'LOCAL ONLY — not yet seeded to the Worker. If seed-kv.mjs --append --put already ran for this album, it still publishes until seed-kv.mjs --veto --put also runs.'
        : null,
    ].filter(Boolean).join('\n'),
    priority: 'default',
    tags: ['gallery-announce', 'vetoed'],
  }
}
