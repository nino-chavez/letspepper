/**
 * The dashboard's HTML, rendered on the server with inline SVG charts. Brand values come
 * from the 630 brand guide (630-marketing-automation standards/brand-guide.md): red
 * #b01c2e is for actions only, blue #2b7bb9 carries information, body text is darker than
 * the site's #777, headings are large and light, and buttons are uppercase with square
 * corners. The club's own typeface is licensed to its website only, so this page uses the
 * site's fallback stack. The follows/unfollows pair (blue, #c2621a) passed the dataviz
 * palette validator on 2026-10-16.
 *
 * Every string from the database is escaped here: captions are third-party text.
 */

import { PERIODS, PROVISIONAL_DAYS, STORY_DAYS, GROWING_DAYS } from './data.js'

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
const e = escapeHtml

const number = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—')
const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n))
const signed = (n) => (n > 0 ? `+${number(n)}` : n < 0 ? `−${number(-n)}` : '0')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function dayLabel(day) {
  const [, m, d] = day.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}
const range = (start, end) => (start === end ? dayLabel(start) : `${dayLabel(start)}–${start.slice(5, 7) === end.slice(5, 7) ? Number(end.slice(8)) : dayLabel(end)}`)
export function centralTime(iso) {
  if (!iso) return null
  const d = new Date(String(iso).replace(/\+0000$/, 'Z'))
  if (Number.isNaN(d.getTime())) return null
  return `${d.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} Central`
}
const excerpt = (caption, length = 110) => {
  const text = String(caption ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return 'No caption'
  if (text.length <= length) return text
  const cut = text.slice(0, length)
  const space = cut.lastIndexOf(' ')
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!–—-]+$/, '')}…`
}
// Illinois is where most followers live, so its cities are named without the state.
const cityName = (dimension) => dimension.replace(/, Illinois$/, '')
const POST_TYPES = { REELS: 'Reel', FEED: 'Post', STORY: 'Story' }
const postType = (post) => (post.type === 'FEED' && post.mediaType === 'CAROUSEL_ALBUM' ? 'Carousel' : POST_TYPES[post.type] ?? post.type)

function niceMax(value) {
  if (!(value > 0)) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step
  return 10 * step
}

const CSS = `
:root {
  --surface: #ffffff; --panel: #f6f6f4; --line: #e3e3df; --ink: #1d1d1f; --ink-2: #44474d; --muted: #63676e;
  --blue: #2b7bb9; --blue-wash: rgba(43, 123, 185, 0.1); --orange: #c2621a; --red: #b01c2e; --red-dark: #8c1624;
  --font: "Helvetica Neue", Arial, sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--surface); color: var(--ink); font: 16px/1.5 var(--font); }
a { color: var(--blue); }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
header.top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.club { margin: 0 0 4px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 0; font-size: clamp(30px, 6vw, 44px); line-height: 1.1; font-weight: 400; }
.stamp { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
nav.periods { display: flex; flex-wrap: wrap; gap: 4px; }
nav.periods a { padding: 8px 12px; border: 1px solid var(--line); color: var(--ink-2); text-decoration: none; font-size: 14px; }
nav.periods a[aria-current="page"] { border-color: var(--ink); color: var(--ink); font-weight: 600; }
section { padding: 28px 0; border-bottom: 1px solid var(--line); }
h2 { margin: 0 0 4px; font-size: 24px; line-height: 1.25; font-weight: 400; }
.lede { margin: 0 0 16px; color: var(--ink-2); max-width: 64ch; }
.answers { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; }
.answers li { font-size: clamp(18px, 2.6vw, 21px); line-height: 1.4; max-width: 60ch; }
.answers strong { font-weight: 600; }
.note { color: var(--ink-2); font-size: 15px; max-width: 70ch; }
.chart { width: 100%; height: auto; display: block; overflow: visible; }
.chart text { font: 12px var(--font); fill: var(--muted); }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .value-label { fill: var(--ink); font-weight: 600; }
.chart .partial { opacity: 0.45; }
.legend { display: flex; gap: 16px; margin: 8px 0 0; padding: 0; list-style: none; font-size: 14px; color: var(--ink-2); }
.legend li { display: flex; align-items: center; gap: 6px; }
.swatch { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
details { margin-top: 12px; }
summary { cursor: pointer; color: var(--blue); font-size: 14px; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; margin-top: 8px; font-size: 14px; font-variant-numeric: tabular-nums; }
th, td { padding: 6px 12px 6px 0; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { font-weight: 600; color: var(--ink-2); }
.cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); margin-top: 8px; }
.card { border: 1px solid var(--line); padding: 14px 16px; background: var(--surface); display: flex; flex-direction: column; gap: 8px; }
.card .meta { font-size: 13px; color: var(--ink-2); display: flex; gap: 8px; flex-wrap: wrap; }
.card .extra { margin: 0; font-size: 14px; color: var(--ink-2); }
h3.group { margin: 20px 0 4px; font-size: 18px; font-weight: 400; }
.columns h3.club { margin: 0 0 8px; }
.columns h3.club ~ h3.club { margin-top: 24px; }
.card .rank { color: var(--ink); font-weight: 600; }
.card .caption { margin: 0; color: var(--ink); }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; }
.stats div { display: flex; flex-direction: column; }
.stats dt { font-size: 13px; color: var(--ink-2); order: 2; }
.stats dd { margin: 0; font-size: 18px; order: 1; }
.badge { font-size: 12px; color: var(--ink-2); background: var(--panel); padding: 1px 6px; }
.bars { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; max-width: 560px; }
.bars li { display: grid; grid-template-columns: minmax(110px, 40%) 1fr auto; align-items: center; gap: 10px; font-size: 14px; }
.bar { height: 12px; background: var(--blue); border-radius: 0 4px 4px 0; min-width: 2px; }
.bars .n { font-variant-numeric: tabular-nums; color: var(--ink-2); }
.columns { display: grid; gap: 32px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.button { display: inline-block; border: 0; border-radius: 0; background: var(--red); color: #fff; padding: 12px 20px; font: 600 15px var(--font); letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
.button:hover { background: var(--red-dark); }
.quiet { background: none; border: 1px solid var(--line); color: var(--ink-2); padding: 8px 14px; font: 14px var(--font); cursor: pointer; }
footer { padding-top: 24px; color: var(--muted); font-size: 14px; display: grid; gap: 8px; }
footer p { margin: 0; max-width: 72ch; }
#tip { position: fixed; pointer-events: none; background: var(--ink); color: #fff; padding: 6px 10px; font-size: 13px; line-height: 1.35; display: none; z-index: 10; max-width: 220px; }
#tip strong { display: block; font-size: 16px; }
.signin { max-width: 380px; margin: 12vh auto 0; padding: 0 16px; }
.signin label { display: block; margin: 24px 0 8px; font-weight: 600; }
.signin input { width: 100%; padding: 12px; border: 1px solid var(--ink-2); font: 16px var(--font); border-radius: 0; }
.signin .error { color: var(--red); margin: 12px 0 0; }
.signin .button { margin-top: 16px; width: 100%; }
:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; }
@media (max-width: 520px) {
  .stats dd { font-size: 16px; }
  /* SVG text scales with the chart; at phone width these sizes render near 12-13px. */
  .chart text { font-size: 21px; }
  .chart .value-label { font-size: 22px; }
}
`

function documentShell({ title, body, nonce, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${e(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
${script ? `<script nonce="${e(nonce)}">${script}</script>` : ''}
</body>
</html>`
}

export function signInPage({ error = null, configured = true } = {}) {
  const body = configured
    ? `<main class="signin">
  <p class="club">630 Volleyball</p>
  <h1>Instagram activity</h1>
  <form method="post" action="/sign-in">
    <label for="passphrase">Passphrase</label>
    <input id="passphrase" name="passphrase" type="password" autocomplete="current-password" required autofocus>
    ${error ? `<p class="error" role="alert">${e(error)}</p>` : ''}
    <button class="button" type="submit">Sign in</button>
  </form>
</main>`
    : `<main class="signin"><p class="club">630 Volleyball</p><h1>Instagram activity</h1><p>This page is not set up yet.</p></main>`
  return documentShell({ title: '630 Instagram activity', body })
}

// --- charts ---------------------------------------------------------------------------

const CHART = { width: 640, height: 220, left: 44, right: 16, top: 16, bottom: 28 }

function reachChart(series) {
  const points = series.filter((d) => Number.isFinite(d.reach))
  if (points.length < 2) return '<p class="note">Not enough days yet to draw a trend.</p>'
  const { width, height, left, right, top, bottom } = CHART
  const max = niceMax(Math.max(...points.map((d) => d.reach)))
  const x = (i) => left + (i * (width - left - right)) / (series.length - 1)
  const y = (v) => top + (height - top - bottom) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const coords = series.map((d, i) => (Number.isFinite(d.reach) ? [x(i), y(d.reach), d] : null)).filter(Boolean)
  const firmCoords = coords.filter(([, , d]) => !d.provisional)
  const provisionalCoords = coords.filter(([, , d]) => d.provisional)
  const line = (cs) => cs.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
  const lastFirm = firmCoords[firmCoords.length - 1]
  const area = firmCoords.length > 1 ? `${line(firmCoords)}L${lastFirm[0].toFixed(1)},${y(0)}L${firmCoords[0][0].toFixed(1)},${y(0)}Z` : ''
  const provisionalPath = provisionalCoords.length && lastFirm ? line([lastFirm, ...provisionalCoords]) : ''
  const last = coords[coords.length - 1]
  const peak = coords.reduce((best, c) => (c[2].reach > best[2].reach ? c : best))
  const labelIndexes = [0, Math.floor((series.length - 1) / 2), series.length - 1]
  const band = (width - left - right) / Math.max(series.length - 1, 1)
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Accounts reached per day, ${e(dayLabel(series[0].day))} to ${e(dayLabel(series[series.length - 1].day))}">
  ${ticks.map((t) => `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(t)}" y2="${y(t)}"/><text x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${compact(t)}</text>`).join('')}
  ${labelIndexes.map((i) => `<text x="${x(i)}" y="${height - 8}" text-anchor="${i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}">${e(dayLabel(series[i].day))}</text>`).join('')}
  ${area ? `<path d="${area}" fill="var(--blue-wash)"/>` : ''}
  <path d="${line(firmCoords)}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  ${provisionalPath ? `<path d="${provisionalPath}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>` : ''}
  <circle cx="${peak[0]}" cy="${peak[1]}" r="4" fill="var(--blue)" stroke="var(--surface)" stroke-width="2"/>
  <text class="value-label" x="${peak[0]}" y="${peak[1] - 10}" text-anchor="middle">${number(peak[2].reach)}</text>
  <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--surface)" stroke="var(--blue)" stroke-width="2"/>
  ${series.map((d, i) => `<rect class="hit" x="${(x(i) - band / 2).toFixed(1)}" y="${top}" width="${band.toFixed(1)}" height="${height - top - bottom}" fill="transparent" data-tip="${e(dayLabel(d.day))}" data-value="${Number.isFinite(d.reach) ? number(d.reach) : 'Not reported'}" data-sub="${d.provisional ? 'accounts reached; Instagram may still change this' : 'accounts reached'}"/>`).join('')}
</svg>`
}

function followsChart(weeks) {
  if (!weeks.length) return ''
  const { width, left, right, top } = CHART
  // Two label rows under the plot (week start, change), spaced for the larger phone text.
  const labels = 66
  const height = 250
  const max = niceMax(Math.max(1, ...weeks.map((w) => Math.max(w.follows, w.unfollows))))
  const mid = top + (height - top - labels) / 2
  const scale = (height - top - labels) / 2 / max
  const slot = (width - left - right) / weeks.length
  const barWidth = Math.min(20, slot / 2 - 4)
  const bars = weeks.map((w, i) => {
    const cx = left + slot * i + slot / 2
    const up = w.follows * scale
    const down = w.unfollows * scale
    const r = Math.min(4, up, barWidth / 2)
    const rd = Math.min(4, down, barWidth / 2)
    const upPath = up > 0 ? `<path d="M${cx - barWidth - 1},${mid}V${mid - up + r}q0,-${r} ${r},-${r}H${cx - 1 - r}q${r},0 ${r},${r}V${mid}Z" fill="var(--blue)"/>` : ''
    const downPath = down > 0 ? `<path d="M${cx + 1},${mid}V${mid + down - rd}q0,${rd} ${rd},${rd}H${cx + 1 + barWidth - rd}q${rd},0 ${rd},-${rd}V${mid}Z" fill="var(--orange)"/>` : ''
    const net = w.follows - w.unfollows
    return `<g${w.complete ? '' : ' class="partial"'}>${upPath}${downPath}</g>
    <text x="${cx}" y="${height - 34}" text-anchor="middle">${e(dayLabel(w.start))}</text>
    <text class="value-label" x="${cx}" y="${height - 6}" text-anchor="middle">${signed(net)}${w.complete ? '' : '*'}</text>
    <rect x="${left + slot * i}" y="${top}" width="${slot}" height="${height - top - labels}" fill="transparent" data-tip="${e(range(w.start, w.end))}" data-value="${signed(net)} net" data-sub="${number(w.follows)} followed, ${number(w.unfollows)} unfollowed"/>`
  }).join('')
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Follows above the line and unfollows below it, by week">
  <line class="grid" x1="${left}" x2="${width - right}" y1="${mid}" y2="${mid}"/>
  <text x="${left - 8}" y="${mid - max * scale + 4}" text-anchor="end">${compact(max)}</text>
  <text x="${left - 8}" y="${mid + 4}" text-anchor="end">0</text>
  <text x="${left - 8}" y="${mid + max * scale + 4}" text-anchor="end">${compact(max)}</text>
  ${bars}
</svg>`
}

function table(columns, rows) {
  return `<div class="table-wrap"><table><thead><tr>${columns.map((c) => `<th scope="col">${e(c.label)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td>${e(c.value(row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

// --- sections ---------------------------------------------------------------------------

function times(ratio) {
  if (ratio >= 1.05) return `<strong>${ratio.toFixed(1)}×</strong>`
  if (ratio <= 0.95) return `<strong>${Math.round(ratio * 100)}%</strong> of`
  return 'about the same as'
}

function answers(data) {
  const s = data.summary
  const out = []
  if (s.lately) {
    const base = `<strong>Lately (${e(range(s.lately.start, s.lately.end))}):</strong> a typical day reached <strong>${number(s.lately.typical)}</strong> accounts`
    const compare = s.lately.before == null ? '. No earlier week is recorded to compare with.'
      : Number.isFinite(s.lately.ratio) ? `, ${times(s.lately.ratio)} the week before.`
        : '. The week before reached none.'
    out.push(`${base}${compare}`)
  }
  if (Number.isFinite(s.typical)) {
    const compare = Number.isFinite(s.ratio) ? `, ${times(s.ratio)} the ${e(String(data.window.days.length))} days before` : ''
    const busiest = s.busiest ? ` Busiest day: ${e(dayLabel(s.busiest.day))}, ${number(s.busiest.reach)}.` : ''
    out.push(`<strong>${e(periodPhrase(data))}:</strong> a typical day reached <strong>${number(s.typical)}</strong>${compare}.${busiest}`)
  }
  const total = data.followers?.followers_count
  out.push(`${Number.isFinite(total) ? `<strong>${number(total)}</strong> followers. ` : ''}<strong>${number(s.follows)}</strong> followed and <strong>${number(s.unfollows)}</strong> unfollowed in this period: ${s.net >= 0 ? `<strong>${number(s.net)}</strong> more` : `<strong>${number(-s.net)}</strong> fewer`}.`)
  if (s.topPost) {
    out.push(`Most-viewed 630 post in this period: “${e(excerpt(s.topPost.caption, 60))}” (${e(dayLabel(localDay(s.topPost.publishedAt)))}), <strong>${number(s.topPost.metrics.views)}</strong> views.`)
  }
  return out
}

function periodPhrase(data) {
  if (data.period === 'all') return `Since ${dayLabel(data.window.start)}`
  return `Last ${data.window.days.length} days`
}

function localDay(publishedAt) {
  const d = new Date(String(publishedAt).replace(/\+0000$/, 'Z'))
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function postCard(post, rank) {
  const m = post.metrics
  const stats = [['Views', number(m.views)], ['Reach', number(m.reach)], ['Likes', number(m.likes ?? m.like_count)], ['Comments', number(m.comments ?? m.comments_count)], ['Shares', number(m.shares)], ['Saves', number(m.saved)]]
  const extra = post.type === 'REELS'
    ? (Number.isFinite(m.reels_skip_rate) ? `${Math.round(m.reels_skip_rate)}% of views swiped away in the first 3 seconds (lower is better).` : '')
    : (Number.isFinite(m.follows) ? `${number(m.follows)} ${m.follows === 1 ? 'account' : 'accounts'} followed 630 from this post.` : '')
  return `<article class="card">
  <div class="meta">${rank ? `<span class="rank">#${rank}</span>` : ''}<span>${e(postType(post))}</span><span>${e(dayLabel(localDay(post.publishedAt)))}</span>${post.growing ? '<span class="badge">Still growing</span>' : ''}</div>
  <p class="caption">${post.permalink ? `<a href="${e(post.permalink)}" rel="noopener noreferrer" target="_blank">${e(excerpt(post.caption))}</a>` : e(excerpt(post.caption))}</p>
  <dl class="stats">${stats.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>
  ${extra ? `<p class="extra">${e(extra)}</p>` : ''}
</article>`
}

function storyCard(story) {
  const m = story.metrics
  const forward = (m['navigation:tap_forward'] ?? 0) + (m['navigation:swipe_forward'] ?? 0)
  const stats = [['Reach', number(m.reach)], ['Views', number(m.views)], ['Link taps', number(m.link_clicks)], ['Tapped ahead', number(forward)], ['Exited', number(m['navigation:tap_exit'])], ['Replies', number(m.replies)]]
  return `<article class="card">
  <div class="meta"><span>Story</span><span>${e(centralTime(story.publishedAt) ?? '')}</span>${story.live ? '<span class="badge">Still up</span>' : ''}</div>
  <dl class="stats">${stats.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>
  ${story.permalink ? `<a href="${e(story.permalink)}" rel="noopener noreferrer" target="_blank">Open on Instagram</a>` : ''}
</article>`
}

function barList(rows, labelOf) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return `<ul class="bars">${rows.map((r) => `<li><span>${e(labelOf(r))}</span><span class="bar" style="width:${((r.value / max) * 100).toFixed(1)}%"></span><span class="n">${number(r.value)}</span></li>`).join('')}</ul>`
}

const TOOLTIP_SCRIPT = `
const tip = document.getElementById('tip')
document.querySelectorAll('[data-tip]').forEach((el) => {
  const show = (x, y) => {
    tip.replaceChildren()
    const strong = document.createElement('strong'); strong.textContent = el.dataset.value
    const label = document.createElement('span'); label.textContent = el.dataset.tip + ' · ' + el.dataset.sub
    tip.append(strong, label)
    tip.style.display = 'block'
    tip.style.left = Math.min(x + 12, window.innerWidth - tip.offsetWidth - 8) + 'px'
    tip.style.top = (y - tip.offsetHeight - 12) + 'px'
  }
  el.addEventListener('pointermove', (ev) => show(ev.clientX, ev.clientY))
  el.addEventListener('pointerleave', () => { tip.style.display = 'none' })
})
`

export function dashboardPage(data, { nonce }) {
  const label = (key, text) => (key === 'all' && data.historyStart ? `Since ${dayLabel(data.historyStart)}` : text)
  const periodNav = Object.entries(PERIODS).map(([key, text]) => `<a href="/?period=${e(key)}"${key === data.period ? ' aria-current="page"' : ''}>${e(label(key, text))}</a>`).join('')
  const header = `<header class="top">
  <div>
    <p class="club">630 Volleyball</p>
    <h1>Instagram activity</h1>
    <p class="stamp">${data.window ? `${e(range(data.window.start, data.window.end))} · ` : ''}updated ${e(centralTime(data.runs.daily?.started_at) ?? 'not yet')}</p>
  </div>
  <nav class="periods" aria-label="Period">${periodNav}</nav>
</header>`
  if (data.empty) {
    return documentShell({ title: '630 Instagram activity', nonce, body: `<main>${header}<section><p>No Instagram data has been recorded yet.</p></section></main>` })
  }
  const s = data.summary
  const provisional = data.series.filter((d) => d.provisional).map((d) => dayLabel(d.day))
  const body = `<main>
${header}
<section aria-labelledby="short">
  <h2 id="short">In short</h2>
  <ul class="answers">${answers(data).map((a) => `<li>${a}</li>`).join('')}</ul>
  <p class="note">Collab posts another account started aren't counted on this page (see Posts). These numbers describe Instagram activity, not registrations or committed athletes; the club's weekly scorecard counts visits from Instagram that reached a registration page.</p>
</section>

<section aria-labelledby="reach">
  <h2 id="reach">Accounts reached per day</h2>
  <p class="lede">Each day counts the different accounts that saw 630's posts, Reels or Stories. Don't add days together: one person seen on two days counts on both.</p>
  ${reachChart(data.series)}
  <p class="note">${provisional.length ? `The dashed end (${e(provisional.join(' and '))}) may still change: Instagram finishes counting a day up to ${PROVISIONAL_DAYS} days later.` : ''}</p>
  <details><summary>Show as a table</summary>
  ${table([{ label: 'Day', value: (d) => dayLabel(d.day) }, { label: 'Reached', value: (d) => number(d.reach) }, { label: 'Views', value: (d) => number(d.views) }], data.series)}
  </details>
</section>

<section aria-labelledby="follows">
  <h2 id="follows">Follows and unfollows by week</h2>
  <p class="lede">Blue above the line is accounts that followed 630. Orange below it is accounts that unfollowed or left Instagram. Weeks run Monday to Sunday and are labeled with their first day in the period; the number under each is the change.</p>
  <ul class="legend"><li><span class="swatch" style="background:var(--blue)"></span>Followed</li><li><span class="swatch" style="background:var(--orange)"></span>Unfollowed</li></ul>
  ${followsChart(data.weeks)}
  ${data.weeks.some((w) => !w.complete) ? '<p class="note">* Faded weeks have fewer than seven days: cut off by the start or end of the period, or missing a day Instagram hasn\'t reported yet. Don\'t compare them with full weeks.</p>' : ''}
  <details><summary>Show as a table</summary>
  ${table([{ label: 'Week', value: (w) => range(w.start, w.end) }, { label: 'Days', value: (w) => String(w.days) }, { label: 'Followed', value: (w) => number(w.follows) }, { label: 'Unfollowed', value: (w) => number(w.unfollows) }, { label: 'Change', value: (w) => signed(w.follows - w.unfollows) }], data.weeks)}
  </details>
</section>

<section aria-labelledby="posts">
  <h2 id="posts">Posts 630 published</h2>
  <p class="lede">${data.posts.length ? `${number(data.posts.length)} ${data.posts.length === 1 ? 'post' : 'posts'} in this period. Views counts every time a post was seen; reach counts the different accounts that saw it. Totals are lifetime totals, which keep growing for about ${GROWING_DAYS} days after posting.` : 'No posts were published in this period.'}</p>
  ${data.settledPosts.length ? `<h3 class="group">At least ${GROWING_DAYS} days old, most viewed first</h3>
  <div class="cards">${data.settledPosts.map((p, i) => postCard(p, i + 1)).join('')}</div>` : ''}
  ${data.growingPosts.length ? `<h3 class="group">Still growing, newest first</h3>
  <div class="cards">${data.growingPosts.map((p) => postCard(p, null)).join('')}</div>` : ''}
  <p class="note">Collab posts another account started don't appear here, because Instagram reports only the posts 630 published itself. On Oct 15, the most-viewed post on 630's profile since Sep 1 was one of them: a college-commitment Collab from Sep 29.</p>
</section>

<section aria-labelledby="stories">
  <h2 id="stories">Stories in the last ${STORY_DAYS} days</h2>
  <p class="lede">${data.stories.length ? `Stories disappear after 24 hours, so each shows its last reading before it did, or its latest reading if it's still up. This list doesn't follow the period above.${data.storiesSince ? ` Recording started ${e(dayLabel(localDay(data.storiesSince)))}.` : ''}` : 'No Stories were recorded in the last week.'}</p>
  ${data.stories.length ? '<p class="note">Tapped ahead: moved on to the next Story. Exited: left Stories. Link taps: taps on a link sticker.</p>' : ''}
  <div class="cards">${data.stories.map(storyCard).join('')}</div>
</section>

<section aria-labelledby="audience">
  <h2 id="audience">Who follows 630</h2>
  <p class="lede">${data.audience.day ? `As of ${e(dayLabel(data.audience.day))}. Followers Instagram can place by city and by age; it doesn't know every follower's.` : 'Not recorded yet.'}</p>
  ${data.audience.day ? `<div class="columns">
    <div><h3 class="club">Top ${number(data.audience.cities.length)} cities</h3>${barList(data.audience.cities, (r) => cityName(r.dimension))}
      <p class="note">Of the ${number(data.audience.cityCount)} cities Instagram lists. Cities without a state are in Illinois.</p></div>
    <div><h3 class="club">Age</h3>${barList(data.audience.ages.map((a) => ({ ...a, dimension: a.age })), (r) => r.dimension)}
      <h3 class="club">Gender</h3><p class="note">${genderLine(data.audience.genders)}</p></div>
  </div>` : ''}
</section>

<footer>
  <p>Source: Instagram's own reporting for @630volleyball, read each morning at 9:30 Central, with Stories read every hour. Instagram's days run from 2 a.m. to 2 a.m. Central. When followers are online will be added once two weeks of readings are in.</p>
  <p>Last daily read: ${e(centralTime(data.runs.daily?.started_at) ?? 'not yet')}${data.runs.daily && data.runs.daily.state !== 'ok' ? ` (${e(data.runs.daily.state.replace('_', ' '))})` : ''}. Last Stories read: ${e(centralTime(data.runs.stories?.started_at) ?? 'not yet')}${data.runs.stories && data.runs.stories.state !== 'ok' ? ` (${e(data.runs.stories.state.replace('_', ' '))})` : ''}.</p>
  <form method="post" action="/sign-out"><button class="quiet" type="submit">Sign out</button></form>
</footer>
</main>
<div id="tip" role="presentation"></div>`
  return documentShell({ title: '630 Instagram activity', nonce, body, script: TOOLTIP_SCRIPT })
}

function genderLine(g) {
  const total = g.F + g.M + g.U
  if (!total) return ''
  const pct = (n) => `${Math.round((n / total) * 100)}%`
  const parts = [['men', g.M], ['women', g.F], ['not given', g.U]].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return `${parts.map(([label, n]) => `${pct(n)} ${label}`).join(', ')}.`
}
