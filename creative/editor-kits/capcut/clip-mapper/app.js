import {
  CLIP_COLUMNS,
  COPY_OPTIONS,
  PLAY_OPTIONS,
  RIGHTS_OPTIONS,
  createEditPlans,
  emptyClip,
  recordsFromCsv,
  recordsToCsv,
} from './clip-plan-core.mjs'

const $ = (selector) => document.querySelector(selector)
const $$ = (selector) => [...document.querySelectorAll(selector)]
const pathForBrowser = (path) => path ? `/${path}` : ''
const defaults = () => emptyClip({
  footage_tone: 'mixed',
  ball_visibility: 'clear',
  rights_status: 'unknown',
  copy_status: 'draft',
  caption_action: 'none',
})

let records = [defaults()]
let selectedIndex = 0
const videoUrls = new Map()
let toastTimer = null

function fillSelect(selector, options) {
  const select = $(selector)
  for (const [value, label] of options) select.add(new Option(label, value))
}

fillSelect('#play-type-select', PLAY_OPTIONS)
fillSelect('#rights-select', RIGHTS_OPTIONS)
fillSelect('#copy-select', COPY_OPTIONS)

function current() { return records[selectedIndex] }
function currentPlan() { return createEditPlans(records)[selectedIndex] }

function slug(value, fallback = 'clip') {
  const clean = String(value || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return clean || fallback
}

function showToast(message) {
  const toast = $('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

async function copyText(text, confirmation) {
  if (!text) return showToast('Nothing to copy yet.')
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const helper = document.createElement('textarea')
    helper.value = text
    helper.style.position = 'fixed'
    helper.style.opacity = '0'
    document.body.append(helper)
    helper.select()
    document.execCommand('copy')
    helper.remove()
  }
  showToast(confirmation)
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function renderForm() {
  const record = current()
  for (const field of $$('[data-field]')) field.value = record[field.dataset.field] ?? ''
}

function renderVideo() {
  const video = $('#video-preview')
  const empty = $('#stage-empty')
  const url = videoUrls.get(current())
  if (url) {
    video.src = url
    video.hidden = false
    empty.hidden = true
  } else {
    video.removeAttribute('src')
    video.load()
    video.hidden = true
    empty.hidden = false
  }
}

function displayName(record, index) {
  return record.clip_id || record.file || `Clip ${index + 1}`
}

function renderClipList() {
  const list = $('#clip-list')
  const plans = createEditPlans(records)
  list.replaceChildren(...records.map((record, index) => {
    const plan = plans[index]
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `clip-tab${index === selectedIndex ? ' selected' : ''}`
    button.setAttribute('role', 'listitem')
    button.innerHTML = `
      <span class="clip-tab-top">
        <strong>${escapeHtml(displayName(record, index))}</strong>
        <span class="mini-status${plan.ready ? ' ready' : ''}" aria-label="${plan.ready ? 'Ready' : 'Needs checks'}"></span>
      </span>
      <small>${escapeHtml([record.event, record.play_type].filter(Boolean).join(' · ') || 'No match details yet')}</small>`
    button.addEventListener('click', () => {
      selectedIndex = index
      renderAll()
    })
    return button
  }))
  $('#remove-clip').disabled = records.length === 1 && !Object.values(current()).some(Boolean)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
}

function countFilled(plan) {
  const required = ['file', 'clip_id', 'event', 'event_date', 'team_a', 'team_b', 'court', 'round', 'play_type', 'outcome', 'score', 'footage_credit', 'rights_status', 'copy_status']
  const blockedFields = new Set(plan.blockers.map((issue) => issue.field))
  return [required.filter((field) => plan.sourceRecord[field] && !blockedFields.has(field)).length, required.length]
}

function issuesForDisplay(plan) {
  const missing = new Set(plan.blockers
    .filter((issue) => issue.message === 'Required before this clip can be queued.')
    .map((issue) => issue.field))
  const groups = [
    [['clip_id', 'file', 'event', 'event_date'], 'Clip identity', 'Add the source file, clip ID, event, and date.'],
    [['team_a', 'team_b', 'court', 'round'], 'Match context', 'Add both teams, the court, and the round.'],
    [['play_type', 'outcome', 'score'], 'Point result', 'Choose the play, state the outcome, and verify the score.'],
    [['footage_credit'], 'Footage credit', 'Name the person or organization that owns or shot the footage.'],
  ]
  const groupedFields = new Set()
  const grouped = []
  for (const [fields, field, message] of groups) {
    if (!fields.some((name) => missing.has(name))) continue
    fields.forEach((name) => groupedFields.add(name))
    grouped.push({ level: 'error', field, message })
  }
  const remaining = plan.blockers.filter((issue) => !groupedFields.has(issue.field))
  const combined = [...grouped, ...remaining, ...plan.warnings]
  return combined.filter((issue, index) => combined.findIndex((candidate) => candidate.field === issue.field && candidate.message === issue.message) === index)
}

function renderReadiness(plan) {
  const [filled, total] = countFilled(plan)
  const blockingFields = new Set(plan.blockers.map((issue) => issue.field)).size
  $('#readiness-count').textContent = `${filled}/${total}`
  $('#status-dot').classList.toggle('ready', plan.ready)
  $('#readiness-kicker').textContent = plan.ready ? 'VERIFIED' : 'NOT READY'
  $('#readiness-title').textContent = plan.ready ? 'Ready to cut' : `${blockingFields} ${blockingFields === 1 ? 'check' : 'checks'} left`
  $('#readiness-summary').textContent = plan.ready
    ? 'Match facts, permission, and caption review are recorded.'
    : 'The plan can be saved now, but only verified clips enter the queue draft.'

  const issues = issuesForDisplay(plan)
  const list = $('#issue-list')
  if (!issues.length) {
    list.innerHTML = '<div class="ready-message">Use the checklist below in CapCut, then watch the full export once without sound before posting.</div>'
    return
  }
  list.replaceChildren(...issues.map((issue) => {
    const item = document.createElement('div')
    item.className = `issue${issue.level === 'warning' ? ' warning' : ''}`
    item.innerHTML = `<strong>${escapeHtml(issue.field.replaceAll('_', ' '))}</strong>${escapeHtml(issue.message)}`
    return item
  }))
}

function assetCard(index, title, detail, path, visual = false) {
  const card = document.createElement('article')
  card.className = 'asset-card'
  const visualMarkup = visual && path
    ? `<div class="asset-card-visual"><img src="${pathForBrowser(path)}" alt="${escapeHtml(title)} preview" /></div>`
    : ''
  card.innerHTML = `${visualMarkup}<span class="asset-index">${String(index).padStart(2, '0')}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p>`
  if (path) {
    const pathButton = document.createElement('button')
    pathButton.className = 'asset-path'
    pathButton.type = 'button'
    pathButton.textContent = path
    pathButton.title = 'Copy asset path'
    pathButton.addEventListener('click', () => copyText(path, 'Asset path copied.'))
    card.append(pathButton)
  } else {
    const empty = document.createElement('span')
    empty.className = 'asset-path asset-empty'
    empty.textContent = 'No asset needed'
    card.append(empty)
  }
  return card
}

function renderAssets(plan) {
  const { assets, label } = plan.treatment
  const momentTitle = current().play_type ? label : 'Choose a moment'
  const cards = [
    assetCard(1, momentTitle, assets.moment ? 'Place after the point; keep the live touch clear.' : current().play_type ? 'Let the rally lead. No moment stamp is needed.' : 'Select a play type to route the right stamp.', assets.moment, true),
    assetCard(2, 'Motion option', assets.motionAlpha ? 'Use the alpha MOV. Use the MP4 fallback only with Screen blend mode.' : 'A static stamp is the cleaner option for this moment.', assets.motionAlpha),
    assetCard(3, 'Audio cue', assets.audio ? 'Align the transient with the stamp; keep court sound present.' : 'Keep the original court sound.', assets.audio),
    assetCard(4, 'Corner mark', 'Use at 18–28% opacity after the intro.', assets.bug, true),
    assetCard(5, 'Lower third', 'Show the verified player or match ID for 1.5–2.5 seconds.', assets.lowerThird, true),
    assetCard(6, 'Ball tracker', assets.tracker ? 'Use only while the ball is hard to locate. Remove before contact.' : 'The ball is clear; a tracker would add noise.', assets.tracker, Boolean(assets.tracker)),
    assetCard(7, 'Reel cover', 'Keep the focal action inside the center-safe crop.', assets.cover, true),
    assetCard(8, 'Footage credit', 'Show the verified owner for the first or final two seconds.', assets.credit, true),
  ]
  $('#asset-grid').replaceChildren(...cards)
}

function renderPreview(plan) {
  const stamp = $('#stamp-preview')
  if (plan.treatment.assets.moment) {
    stamp.src = pathForBrowser(plan.treatment.assets.moment)
    stamp.alt = `${plan.treatment.label} stamp preview`
    stamp.hidden = false
    $('#preview-note').textContent = `${plan.treatment.label}: place it after the point, not over the touch.`
  } else {
    stamp.hidden = true
    $('#preview-note').textContent = 'No stamp recommended. Let the full rally carry the edit.'
  }
  $('#preview-credit').textContent = current().footage_credit ? `FOOTAGE · ${current().footage_credit}` : 'CREDIT NEEDED'
  const mostlyLight = current().footage_tone === 'mostly-light'
  $('#bug-preview').style.color = mostlyLight ? '#111' : '#fff'
  $('#bug-preview').style.borderColor = mostlyLight ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.45)'
  $('#bug-preview').style.background = mostlyLight ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.25)'
}

function renderOutputs() {
  const plan = currentPlan()
  renderReadiness(plan)
  renderAssets(plan)
  renderPreview(plan)
  $('#caption-copy').textContent = current().play_type ? plan.caption.text : 'Choose a play type to start the caption.'
  $('#caption-count').textContent = `${plan.caption.wordCount} ${plan.caption.wordCount === 1 ? 'WORD' : 'WORDS'}`
  renderClipList()
}

function renderAll() {
  renderForm()
  renderVideo()
  renderOutputs()
}

function planReport() {
  const clips = createEditPlans(records)
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      clips: clips.length,
      ready: clips.filter((clip) => clip.ready).length,
      blocked: clips.filter((clip) => !clip.ready).length,
    },
    clips,
    queueDraft: {
      note: 'Draft only. Add a hosted video URL and schedule before publishing.',
      items: clips.filter((clip) => clip.ready).map((clip) => clip.queueDraft),
    },
  }
}

function checklist(plan) {
  const { assets } = plan.treatment
  const timing = plan.facts.clipIn
    ? `${plan.facts.clipIn} → ${plan.facts.clipOut}; contact ${plan.facts.momentTime}`
    : 'Set clip in, point contact, and clip out in CapCut'
  return [
    `LET'S PEPPER CAPCUT HANDOFF — ${plan.clipId || 'UNNAMED CLIP'}`,
    `STATUS: ${plan.ready ? 'READY' : `BLOCKED — ${plan.blockers.length} checks left`}`,
    `SOURCE: ${plan.sourceFile || 'MISSING'}`,
    `CUT: ${timing}`,
    `MATCH: ${plan.facts.matchup.filter(Boolean).join(' vs ') || 'MISSING'} · ${plan.facts.round || 'ROUND MISSING'} · ${plan.facts.score || 'SCORE MISSING'}`,
    '',
    `1. LOWER THIRD: ${assets.lowerThird}`,
    `2. MOMENT: ${assets.moment || 'none'}`,
    `3. MOTION: ${assets.motionAlpha || 'none'}`,
    `4. AUDIO: ${assets.audio || 'original court sound'}`,
    `5. TRACKER: ${assets.tracker || 'none'}`,
    `6. CORNER MARK: ${assets.bug} at 18–28% opacity`,
    `7. CREDIT: ${plan.facts.footageCredit || 'MISSING'} — first or final two seconds`,
    `8. COVER: ${assets.cover}`,
    '',
    ...plan.treatment.timing.map((line) => `• ${line}`),
    '',
    'CAPTION',
    plan.caption.text || 'MISSING',
    '',
    ...(plan.blockers.length ? ['BLOCKERS', ...plan.blockers.map((issue) => `• ${issue.field}: ${issue.message}`)] : []),
  ].join('\n')
}

$('#clip-form').addEventListener('input', (event) => {
  const field = event.target.closest('[data-field]')
  if (!field) return
  current()[field.dataset.field] = field.value
  renderOutputs()
})

$('#clip-form').addEventListener('submit', (event) => event.preventDefault())

$('#new-clip').addEventListener('click', () => {
  records.push(defaults())
  selectedIndex = records.length - 1
  renderAll()
  window.scrollTo({ top: $('.workspace').offsetTop - 70, behavior: 'smooth' })
})

$('#remove-clip').addEventListener('click', () => {
  const record = current()
  const url = videoUrls.get(record)
  if (url) URL.revokeObjectURL(url)
  videoUrls.delete(record)
  if (records.length === 1) records = [defaults()]
  else records.splice(selectedIndex, 1)
  selectedIndex = Math.min(selectedIndex, records.length - 1)
  renderAll()
})

$('#video-input').addEventListener('change', (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  const oldUrl = videoUrls.get(current())
  if (oldUrl) URL.revokeObjectURL(oldUrl)
  videoUrls.set(current(), URL.createObjectURL(file))
  current().file = file.name
  if (!current().clip_id) current().clip_id = slug(file.name)
  event.target.value = ''
  renderAll()
})

$('#csv-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const imported = recordsFromCsv(await file.text())
    if (!imported.length) throw new Error('This clip map has no clip rows.')
    records = imported.map((record) => emptyClip({ ...defaults(), ...record }))
    selectedIndex = 0
    renderAll()
    showToast(`${records.length} ${records.length === 1 ? 'clip' : 'clips'} imported.`)
  } catch (error) {
    showToast(error.message)
  } finally {
    event.target.value = ''
  }
})

$('#safe-zone-toggle').addEventListener('change', (event) => {
  const guide = $('#safe-zone-preview')
  guide.src = pathForBrowser('creative/exports/media-kit-v1/capcut/guides/reel-safe-zones.png')
  guide.hidden = !event.target.checked
})

$('#use-video-time').addEventListener('click', () => {
  const video = $('#video-preview')
  if (video.hidden || !Number.isFinite(video.currentTime)) return showToast('Choose a video first.')
  current().moment_time = formatTime(video.currentTime)
  renderAll()
  showToast('Preview time added as point contact.')
})

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainder = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${minutes}:${remainder}`
}

$('#copy-caption').addEventListener('click', () => copyText(currentPlan().caption.text, 'Caption copied.'))
$('#copy-checklist').addEventListener('click', () => copyText(checklist(currentPlan()), 'CapCut checklist copied.'))

$('#download-csv').addEventListener('click', () => {
  const name = `${slug(current().event, 'letspepper')}-clip-map.csv`
  download(name, recordsToCsv(records, CLIP_COLUMNS), 'text/csv;charset=utf-8')
  showToast('Clip map downloaded.')
})

$('#download-plan').addEventListener('click', () => {
  const report = planReport()
  const name = `${slug(current().event, 'letspepper')}-edit-plans.json`
  download(name, `${JSON.stringify(report, null, 2)}\n`, 'application/json')
  showToast(`${report.summary.ready}/${report.summary.clips} ready clips included in the queue draft.`)
})

renderAll()
