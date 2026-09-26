/**
 * Phone notifications for the gallery-announce campaign, via ntfy.sh
 * (https://ntfy.sh/<topic>, docs fetched 2026-09-26 from https://docs.ntfy.sh/publish/).
 * Nino picked "phone notification" over Slack/email on 2026-09-26.
 *
 * Shared by local scripts (build-gallery-announce.mjs, veto-announce.mjs, seed-kv.mjs) AND
 * the scheduled Worker (worker/src/index.js) — so, like hold-shape.mjs and route-shape.mjs,
 * this file has NO node: imports and can go into the Worker bundle without nodejs_compat.
 * The Worker cannot shell out to `op`, so it gets the topic as its own secret binding
 * (NTFY_TOPIC, `wrangler secret put`); local callers read it from process.env.NTFY_TOPIC or
 * `op read 'op://Developer Secrets/ntfy gallery-announce/credential'` THEMSELVES — this
 * module only ever takes `topic` as a parameter and never looks it up or logs it.
 *
 * The topic is ntfy.sh's only access control (anyone who knows it can publish or subscribe),
 * which is why it lives in 1Password rather than in this file or in git history.
 *
 * Header shapes, straight from the docs:
 *   Title    X-Title (alias Title) — plain text.
 *   Priority X-Priority (alias Priority) — one of max/urgent, high, default, low, min.
 *   Tags     X-Tags (alias Tags), comma-separated. A tag matching an emoji short code is
 *            rendered as an emoji by the ntfy app — Nino's no-emoji rule means every tag
 *            used below is a plain word chosen to NOT match a short code.
 *   Click    X-Click (alias Click) — a URL opened when the notification is tapped.
 *
 * "ntfy supports UTF-8 in HTTP headers, but not every library or programming language
 * does" (the docs' own words) — Node's fetch (undici) throws on a header value outside
 * Latin-1/ByteString, which an em dash or a curly quote IS outside of (an accented letter
 * like "ñ" is inside Latin-1 and would actually be fine either way). Rather than depend on
 * that boundary — or the docs' RFC 2047 escape — every header value here is transliterated
 * to plain ASCII first (asciiHeaderValue). These are short factual strings; losing an accent
 * mark costs nothing.
 *
 * Never throws: a notification failure must not block or fail a publish. Every call site
 * awaits notify() and it always resolves, logging (never the topic or the full URL) on
 * failure.
 */

const NTFY_BASE = 'https://ntfy.sh'
const DEFAULT_TIMEOUT_MS = 5000

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

/**
 * The exact request ntfy.sh/publish/ documents for one notification — pure, no network,
 * so it's directly testable without mocking fetch. `click`, if present, must already be a
 * well-formed URL (it is passed through, not transliterated — mangling it would break the
 * link).
 */
export function buildNtfyRequest({ topic, title, message, priority = 'default', tags = [], click } = {}) {
  if (!topic) throw new Error('notify: no topic given')
  const headers = { 'content-type': 'text/plain; charset=utf-8' }
  if (title) headers['X-Title'] = asciiHeaderValue(title)
  if (priority) headers['X-Priority'] = priority
  if (Array.isArray(tags) && tags.length) headers['X-Tags'] = tags.map(asciiHeaderValue).join(',')
  if (click) headers['X-Click'] = click
  return { url: `${NTFY_BASE}/${topic}`, headers, body: asciiHeaderValue(message || '') }
}

/**
 * POST one notification to ntfy.sh. Never throws — every failure (missing topic, network
 * error, timeout, non-2xx) is caught and logged without the topic or URL, and resolves
 * to { ok: false, error } rather than rejecting, so a caller can `await notify(...)`
 * unconditionally without a try/catch of its own. Resolves { ok: true } on a 2xx.
 */
export async function notify({ topic, title, message, priority, tags, click, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!topic) { console.error('notify: skipped — no topic configured (NTFY_TOPIC unset)'); return { ok: false, error: 'no topic' } }
  let request
  try { request = buildNtfyRequest({ topic, title, message, priority, tags, click }) }
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
// Event-specific builders — pure (no network, no topic lookup), so each is
// directly testable and --dry-run can print exactly what WOULD be sent.
// ---------------------------------------------------------------------------

/** a. HELD — build-gallery-announce.mjs, appended (non-dry-run) only. Carries the exact
 * veto command so Nino can act from the notification alone, and BOTH the local-only
 * veto-announce.mjs form and the seed-kv.mjs --veto form, because by the time he reads
 * this the item may already be seeded to the Worker — see veto-announce.mjs's own header
 * for why one is not a substitute for the other. */
export function heldNotification({ albumKey, albumName, selectedOf, account, collaborator, holdUntilChicago, galleryUrl }) {
  const vetoLocal = `node scripts/social-publish/veto-announce.mjs --album-key ${albumKey} --reason "<why>"`
  const vetoLive = `node scripts/social-publish/seed-kv.mjs --event gallery-announce --veto ${albumKey}-gallery-announce --reason "<why>" --put`
  return {
    title: `Gallery post held: ${albumName}`,
    message: [
      `${selectedOf} selected. Account: ${account}${collaborator ? `, collab ${collaborator}` : ''}.`,
      `Posts ${holdUntilChicago} Chicago time unless vetoed.`,
      '',
      `Veto (before it's seeded to the Worker): ${vetoLocal}`,
      `Veto (if already seeded): ${vetoLive}`,
    ].join('\n'),
    priority: 'default',
    tags: ['gallery-announce', 'held'],
    click: galleryUrl,
  }
}

/** b. POSTED — Worker, once per channel that actually published. */
export function postedNotification({ albumName, channel, permalink }) {
  return {
    title: `Posted to ${channel}: ${albumName}`,
    message: permalink || 'Published (no permalink available).',
    priority: 'default',
    tags: ['gallery-announce', 'posted', channel],
    click: permalink,
  }
}

/** c. FAILED — Worker, terminal errors only (never a transient "resumes next run" note). */
export function failedNotification({ albumName, channel, error }) {
  return {
    title: `Gallery post FAILED: ${albumName}`,
    message: `${channel}: ${error}`,
    priority: 'high',
    tags: ['gallery-announce', 'failed', channel],
  }
}

/** d. VETOED — veto-announce.mjs (local only) or seed-kv.mjs --veto (reaches KV). `localOnly`
 * must be honest: a confirmation that doesn't say "local only" reads as "this is stopped,"
 * and it is not stopped until the same veto reaches the Worker's copy in KV. */
export function vetoedNotification({ albumName, reason, localOnly }) {
  return {
    title: `Gallery post vetoed: ${albumName}`,
    message: [
      reason || 'vetoed by operator',
      localOnly
        ? 'LOCAL ONLY — not yet seeded to the Worker. If seed-kv.mjs --append --put already ran for this album, it still publishes until seed-kv.mjs --veto --put also runs.'
        : 'Reached the Worker\'s live queue — will not publish.',
    ].join('\n'),
    priority: 'default',
    tags: ['gallery-announce', 'vetoed'],
  }
}
