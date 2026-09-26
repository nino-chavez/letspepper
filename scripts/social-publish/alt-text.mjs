/**
 * Alt text for one gallery-announce photo, derived from the site's existing AI
 * caption (e.g. "Players in blue and yellow jerseys stand in a line on the
 * court, with some looking down.") rather than written fresh — the caption is
 * already a factual, model-generated description with no guessed identity
 * (see the photography repo's reader-contract.json: "never aesthetic filler,
 * guessed identity, or uncertain detection stated as fact").
 *
 * Two things the caption must never carry into alt text, both because many
 * subjects here are minors:
 *   1. A jersey number ("number 3", "#12", "No. 7") — these read as
 *      identifying even without a name attached.
 *   2. `visible_text` — garment/signage text the ingest model transcribes
 *      (player surnames on jersey backs, school names). It is captured during
 *      ingest but is NOT part of the persisted PHOTO_COLUMNS select and is NOT
 *      exposed by the public /api/album-photos endpoint (checked in the
 *      photography repo's src/lib/ai/ingest-extraction.ts and
 *      src/lib/supabase/columns.ts, 2026-09-25) — build-gallery-announce.mjs
 *      has no read path to it. So this module can strip it when a caller
 *      DOES have it (e.g. a future direct DB read), and otherwise falls back
 *      to a generic capitalized-token backstop below. That backstop is a
 *      defensive net, not a verified name filter — say so in any report that
 *      cites it.
 *
 * The backstop: strip any run of 2+ consecutive Title-Case words that isn't
 * the sentence's first word and isn't on the small caption vocabulary this
 * site's captions actually use (colors, jersey/court words) — that shape
 * ("Sikora Lewis", "Wilson Park") is what a name or a proper noun the source
 * didn't intend looks like; an ordinary volleyball caption doesn't produce it.
 */

const JERSEY_PATTERNS = [
  /\bwith\s+(?:the\s+)?number\s+\d+\b/gi,
  /\bnumber\s+\d+\b/gi,
  /\bno\.?\s*\d+\b/gi,
  /#\d+\b/g,
]

// Common vocabulary this site's AI captions actually use, so the Title-Case
// backstop doesn't strip ordinary description words. Not exhaustive by design —
// it only needs to cover what these captions say, not general English.
const CAPTION_VOCAB = new Set([
  'players', 'player', 'a', 'the', 'in', 'on', 'with', 'and', 'of', 'stand', 'stands',
  'standing', 'stood', 'line', 'court', 'some', 'looking', 'down', 'up', 'jerseys',
  'jersey', 'blue', 'black', 'white', 'yellow', 'orange', 'green', 'red', 'purple',
  'gray', 'grey', 'trim', 'polished', 'knee', 'pads', 'pad', 'warmup', 'warming',
  'sets', 'setting', 'digs', 'digging', 'spikes', 'spiking', 'serves', 'serving',
  'blocks', 'blocking', 'net', 'ball', 'volleyball', 'gym', 'sideline', 'bench',
])

function stripJerseyNumbers(text) {
  let out = text
  for (const re of JERSEY_PATTERNS) out = out.replace(re, '')
  return out
}

// Measured live against Re7kho 2026-09-25: the site's own AI caption quoted a banner
// verbatim — 'Players ... celebrate ... A banner reads "CENTRAL CATHOLIC TIGERS."' —
// which is exactly visible_text (signage) reaching alt text through the caption itself,
// with no structured visible_text field available to diff against (see module header).
// Any quoted span in one of these captions is a literal on-scene transcription, so it
// and its lead-in clause ("A banner reads") are stripped unconditionally.
const QUOTED_TEXT_CLAUSE = /[,.]?\s*(?:with\s+)?(?:a |the )?(?:banner|sign|scoreboard|jersey|shirt)[^,."]{0,20}reads?\s*[:,]?\s*["“][^"”]*["”][.,]?/gi
const BARE_QUOTED_TEXT = /["“][^"”]*["”]/g

export function stripQuotedSignage(text) {
  return text.replace(QUOTED_TEXT_CLAUSE, '').replace(BARE_QUOTED_TEXT, '')
}

/** Strips any token in `terms` (whole-word, case-insensitive) — for a caller that DOES have visible_text. */
export function stripVisibleText(text, terms = []) {
  let out = text
  for (const term of terms) {
    if (!term || typeof term !== 'string') continue
    out = out.replace(new RegExp(`\\b${term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '')
  }
  return out
}

/** Defensive backstop when visible_text isn't available: strip runs of 2+ Title-Case words not in CAPTION_VOCAB. */
export function stripLikelyNames(text) {
  return text.replace(/\b([A-Z][a-z]+)((?:\s+[A-Z][a-z]+)+)\b/g, (whole, first, rest, offset) => {
    if (offset === 0) return whole // sentence-initial capitalization ("Players...") is not a name
    const words = (first + rest).trim().split(/\s+/)
    const allVocab = words.every((w) => CAPTION_VOCAB.has(w.toLowerCase()))
    return allVocab ? whole : ''
  })
}

function tidy(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\(\s*\)/g, '')
    .trim()
}

const IG_ALT_TEXT_MAX = 1000

/**
 * Build one photo's alt text from its site caption. `visibleText` is optional
 * (see module header — no current read path supplies it); passing it makes the
 * strip exact instead of relying on the Title-Case backstop.
 */
export function altTextFromCaption(caption, { visibleText = [] } = {}) {
  if (!caption || typeof caption !== 'string') return null
  let out = stripJerseyNumbers(caption)
  out = stripQuotedSignage(out)
  out = stripVisibleText(out, visibleText)
  out = stripLikelyNames(out)
  out = tidy(out)
  if (!out) return null
  return out.length > IG_ALT_TEXT_MAX ? `${out.slice(0, IG_ALT_TEXT_MAX - 1)}…` : out
}
