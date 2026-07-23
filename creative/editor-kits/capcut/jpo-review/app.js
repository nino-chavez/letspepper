const STORAGE_KEY = 'letspepper-jpo-review-v1'

const RATINGS = [
  { value: '', label: 'Clear' },
  { value: 'A', label: 'A · hero' },
  { value: 'B', label: 'B · support' },
  { value: 'C', label: 'C · archive' },
  { value: 'pass', label: 'Pass' },
]

const CONTENT_TYPES = [
  ['', 'Unclassified'],
  ['full-rally', 'Full rally'],
  ['serve', 'Serve'],
  ['net-play', 'Net play'],
  ['defense', 'Defense / save'],
  ['reaction', 'Reaction'],
  ['player-cutaway', 'Player cutaway'],
  ['atmosphere', 'Atmosphere'],
  ['ceremony', 'Ceremony'],
  ['technical-reject', 'Technical reject'],
]

const ROLES = [
  ['', 'No role yet'],
  ['fast-open', 'Fast open'],
  ['hero-hit', 'Hero hit'],
  ['hero-net', 'Hero net play'],
  ['hero-save', 'Hero save'],
  ['hero-rally', 'Hero rally'],
  ['anchor-rally', 'Anchor rally'],
  ['character-beat', 'Character beat'],
  ['reaction-payoff', 'Reaction payoff'],
  ['transition-hit', 'Transition hit'],
  ['serve-build', 'Serve build'],
  ['texture', 'Visual texture'],
  ['support', 'Support'],
  ['closer', 'Closer'],
]

const CLIP_COLUMNS = [
  'clip_id', 'file', 'event', 'event_date', 'team_a', 'team_b', 'players',
  'participant_handles', 'court', 'round', 'play_type', 'outcome', 'score',
  'clip_in', 'moment_time', 'clip_out', 'footage_tone', 'ball_visibility',
  'footage_credit', 'editor_credit', 'rights_status', 'copy_status',
  'caption_action', 'asset_cue', 'notes',
]

const elements = {
  stats: document.querySelector('#stats'),
  search: document.querySelector('#search'),
  ratingFilter: document.querySelector('#ratingFilter'),
  typeFilter: document.querySelector('#typeFilter'),
  blockFilter: document.querySelector('#blockFilter'),
  sortOrder: document.querySelector('#sortOrder'),
  resetFilters: document.querySelector('#resetFilters'),
  resultCount: document.querySelector('#resultCount'),
  clipGrid: document.querySelector('#clipGrid'),
  chooseSource: document.querySelector('#chooseSource'),
  chooseSourceFromDetail: document.querySelector('#chooseSourceFromDetail'),
  sourceInput: document.querySelector('#sourceInput'),
  sourceStatus: document.querySelector('#sourceStatus'),
  detailDialog: document.querySelector('#detailDialog'),
  detailPosition: document.querySelector('#detailPosition'),
  detailTitle: document.querySelector('#detailTitle'),
  detailMeta: document.querySelector('#detailMeta'),
  detailRatings: document.querySelector('#detailRatings'),
  detailType: document.querySelector('#detailType'),
  detailRole: document.querySelector('#detailRole'),
  detailFilmstrip: document.querySelector('#detailFilmstrip'),
  technicalList: document.querySelector('#technicalList'),
  sourceVideo: document.querySelector('#sourceVideo'),
  videoEmpty: document.querySelector('#videoEmpty'),
  videoShell: document.querySelector('.video-shell'),
  previousClip: document.querySelector('#previousClip'),
  nextClip: document.querySelector('#nextClip'),
  clipIn: document.querySelector('#clipIn'),
  momentTime: document.querySelector('#momentTime'),
  clipOut: document.querySelector('#clipOut'),
  keepReason: document.querySelector('#keepReason'),
  reviewNotes: document.querySelector('#reviewNotes'),
  copyFilenames: document.querySelector('#copyFilenames'),
  exportReview: document.querySelector('#exportReview'),
  exportClipMap: document.querySelector('#exportClipMap'),
  exportJson: document.querySelector('#exportJson'),
  toast: document.querySelector('#toast'),
}

let inventory = null
let decisions = {}
let sourceFiles = new Map()
let currentId = ''
let currentObjectUrl = ''
let toastTimer = null

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const typeLabel = (value) => CONTENT_TYPES.find(([id]) => id === value)?.[1] ?? value
const roleLabel = (value) => ROLES.find(([id]) => id === value)?.[1] ?? value

function decisionFor(id) {
  return {
    rating: '',
    contentType: '',
    keepReason: '',
    suggestedRole: '',
    clipIn: '',
    momentTime: '',
    clipOut: '',
    notes: '',
    ...(decisions[id] ?? {}),
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), decisions }))
}

function showToast(message) {
  clearTimeout(toastTimer)
  elements.toast.textContent = message
  elements.toast.classList.add('is-visible')
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2600)
}

function selectOptions(options) {
  return options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('')
}

function visibleClips() {
  const query = elements.search.value.trim().toLowerCase()
  const ratingFilter = elements.ratingFilter.value
  const typeFilter = elements.typeFilter.value
  const blockFilter = elements.blockFilter.value
  const order = elements.sortOrder.value
  const result = inventory.clips.filter((clip) => {
    const decision = decisionFor(clip.id)
    const rating = decision.rating || 'unreviewed'
    if (ratingFilter === 'shortlist' && !['A', 'B'].includes(rating)) return false
    if (!['all', 'shortlist'].includes(ratingFilter) && rating !== ratingFilter) return false
    if (typeFilter !== 'all' && decision.contentType !== typeFilter) return false
    if (blockFilter !== 'all' && String(clip.shootBlock) !== blockFilter) return false
    if (!query) return true
    const haystack = [
      clip.file,
      clip.captureLocal,
      clip.lens,
      decision.rating,
      decision.contentType,
      decision.keepReason,
      decision.suggestedRole,
      decision.notes,
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  })

  const ratingOrder = { A: 0, B: 1, C: 2, '': 3, pass: 4 }
  result.sort((a, b) => {
    if (order === 'rating') {
      const ratingDifference = ratingOrder[decisionFor(a.id).rating] - ratingOrder[decisionFor(b.id).rating]
      if (ratingDifference) return ratingDifference
    }
    if (order === 'duration-desc') return b.durationSeconds - a.durationSeconds
    if (order === 'duration-asc') return a.durationSeconds - b.durationSeconds
    if (order === 'file') return a.file.localeCompare(b.file, undefined, { numeric: true })
    return (a.captureLocal || a.captureUtc).localeCompare(b.captureLocal || b.captureUtc)
  })
  return result
}

function renderStats() {
  const counts = { A: 0, B: 0, C: 0, pass: 0, unreviewed: 0 }
  for (const clip of inventory.clips) counts[decisionFor(clip.id).rating || 'unreviewed'] += 1
  const stats = [
    [inventory.summary.clips, 'Source clips'],
    [inventory.summary.totalDurationLabel, 'Recorded duration'],
    [counts.A, 'A · hero'],
    [counts.B, 'B · support'],
    [counts.pass, 'Pass'],
    [`${sourceFiles.size}/${inventory.summary.clips}`, 'Originals linked'],
  ]
  elements.stats.innerHTML = stats.map(([value, label]) => `
    <div class="stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>
  `).join('')
}

function renderCard(clip) {
  const decision = decisionFor(clip.id)
  const rating = decision.rating || 'unreviewed'
  const time = clip.captureLocal.match(/T(\d{2}):(\d{2}):(\d{2})/)?.slice(1).join(':') ?? ''
  const reason = decision.keepReason || 'No visual decision recorded yet.'
  const resolution = `${clip.displayWidth}×${clip.displayHeight}`
  const linked = sourceFiles.has(clip.file.toUpperCase())
  return `
    <article class="clip-card" data-id="${escapeHtml(clip.id)}" data-rating="${escapeHtml(rating)}">
      <button class="clip-open" type="button" data-open="${escapeHtml(clip.id)}" aria-label="Review ${escapeHtml(clip.file)}">
        <div class="card-filmstrip">
          ${clip.reviewFrames.map((frame) => `<img src="${escapeHtml(frame)}" alt="" loading="lazy">`).join('')}
        </div>
        <div class="card-body">
          <div class="card-heading"><strong>${escapeHtml(clip.file)}</strong><span>${escapeHtml(clip.durationLabel)}</span></div>
          <div class="card-meta">
            <span>${escapeHtml(time)}</span>
            <span>${escapeHtml(resolution)} · ${escapeHtml(clip.fps)} fps</span>
            <span>Block ${escapeHtml(clip.shootBlock)}</span>
            ${linked ? '<span>Source linked</span>' : ''}
          </div>
          <p class="card-reason${decision.keepReason ? '' : ' is-empty'}">${escapeHtml(reason)}</p>
        </div>
      </button>
      <footer class="card-footer">
        <span class="type-chip">${escapeHtml(typeLabel(decision.contentType))}${decision.suggestedRole ? ` · ${escapeHtml(roleLabel(decision.suggestedRole))}` : ''}</span>
        <div class="mini-ratings" aria-label="Rate ${escapeHtml(clip.file)}">
          ${['A', 'B', 'C', 'pass'].map((value) => `<button type="button" data-rate-id="${escapeHtml(clip.id)}" data-rating="${value}" class="${decision.rating === value ? 'is-active' : ''}" title="${value === 'pass' ? 'Pass' : `${value} rating`}">${value === 'pass' ? '×' : value}</button>`).join('')}
        </div>
      </footer>
    </article>
  `
}

function renderGrid() {
  const clips = visibleClips()
  const shortlist = inventory.clips.filter((clip) => ['A', 'B'].includes(decisionFor(clip.id).rating)).length
  elements.resultCount.textContent = `${clips.length} shown · ${shortlist} in A/B shortlist`
  elements.clipGrid.innerHTML = clips.length
    ? clips.map(renderCard).join('')
    : '<div class="empty-state">No clips match these filters.</div>'
}

function renderAll() {
  renderStats()
  renderGrid()
}

function updateDecision(id, patch, { render = true } = {}) {
  decisions[id] = { ...decisionFor(id), ...patch }
  save()
  if (render) renderAll()
}

function populateFilters() {
  elements.typeFilter.innerHTML = '<option value="all">All content</option>' + CONTENT_TYPES
    .filter(([value]) => value)
    .map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`)
    .join('')
  elements.blockFilter.innerHTML = '<option value="all">All blocks</option>' + Array.from({ length: inventory.summary.shootBlocks }, (_, index) => {
    const value = index + 1
    return `<option value="${value}">Block ${value}</option>`
  }).join('')
  elements.detailType.innerHTML = selectOptions(CONTENT_TYPES)
  elements.detailRole.innerHTML = selectOptions(ROLES)
}

function technicalRows(clip) {
  const rows = [
    ['Capture', clip.captureLocal],
    ['Duration', `${clip.durationLabel} · ${clip.durationSeconds}s`],
    ['Display', `${clip.displayWidth}×${clip.displayHeight} · ${clip.rotation}° rotation`],
    ['Source', `${clip.width}×${clip.height} · ${clip.fps} fps`],
    ['Codec', `${clip.videoCodec} ${clip.videoProfile} · ${clip.pixelFormat} · ${clip.colorSpace}`],
    ['Audio', `${clip.audioCodec} · ${clip.audioSampleRate / 1000} kHz · ${clip.audioChannels} ch`],
    ['Camera', clip.camera],
    ['Lens', clip.lens],
    ['Size', `${clip.mebibytes} MiB · ${clip.bitRateMbps} Mb/s`],
    ['Capture block', String(clip.shootBlock)],
  ]
  return rows.map(([term, value]) => `<div><dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')
}

function setPlaybackSpeed(speed) {
  elements.sourceVideo.playbackRate = speed
  document.querySelectorAll('[data-speed]').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.speed) === speed)
  })
}

function linkVideo(clip) {
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
  currentObjectUrl = ''
  const file = sourceFiles.get(clip.file.toUpperCase())
  elements.sourceVideo.pause()
  if (!file) {
    elements.sourceVideo.removeAttribute('src')
    elements.sourceVideo.load()
    elements.videoShell.classList.remove('has-source')
    return
  }
  currentObjectUrl = URL.createObjectURL(file)
  elements.sourceVideo.src = currentObjectUrl
  elements.sourceVideo.poster = clip.reviewFrames[1]
  elements.videoShell.classList.add('has-source')
  setPlaybackSpeed(1)
}

function renderDetailRating(id) {
  const decision = decisionFor(id)
  elements.detailRatings.innerHTML = RATINGS.map(({ value, label }) => `
    <button class="rating-button${decision.rating === value ? ' is-active' : ''}" type="button" data-detail-rating="${escapeHtml(value)}" data-rating="${escapeHtml(value || 'clear')}">${escapeHtml(label)}</button>
  `).join('')
}

function openDetail(id) {
  const clip = inventory.clips.find((item) => item.id === id)
  if (!clip) return
  currentId = id
  const clips = visibleClips()
  const index = clips.findIndex((item) => item.id === id)
  const decision = decisionFor(id)
  elements.detailPosition.textContent = `${index + 1} of ${clips.length} visible · Capture block ${clip.shootBlock}`
  elements.detailTitle.textContent = clip.file
  elements.detailMeta.textContent = `${clip.durationLabel} · ${clip.displayWidth}×${clip.displayHeight} · ${clip.fps} fps`
  elements.detailFilmstrip.innerHTML = clip.reviewFrames.map((frame, frameIndex) => `
    <button type="button" data-frame-fraction="${[0.2, 0.5, 0.8][frameIndex]}" title="Seek to sampled frame"><img src="${escapeHtml(frame)}" alt="Frame ${frameIndex + 1} from ${escapeHtml(clip.file)}"></button>
  `).join('')
  elements.technicalList.innerHTML = technicalRows(clip)
  renderDetailRating(id)
  elements.detailType.value = decision.contentType
  elements.detailRole.value = decision.suggestedRole
  elements.clipIn.value = decision.clipIn
  elements.momentTime.value = decision.momentTime
  elements.clipOut.value = decision.clipOut
  elements.keepReason.value = decision.keepReason
  elements.reviewNotes.value = decision.notes
  linkVideo(clip)
  if (!elements.detailDialog.open) elements.detailDialog.showModal()
}

function moveDetail(direction) {
  const clips = visibleClips()
  if (!clips.length) return
  const index = clips.findIndex((clip) => clip.id === currentId)
  const nextIndex = (index + direction + clips.length) % clips.length
  openDetail(clips[nextIndex].id)
}

function fileTimeStamp() {
  return new Date().toISOString().replaceAll(':', '-').slice(0, 19)
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function rowsToCsv(rows, columns) {
  return `${[columns.join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\n')}\n`
}

function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

function reviewRows() {
  return inventory.clips.map((clip) => {
    const decision = decisionFor(clip.id)
    return {
      id: clip.id,
      file: clip.file,
      capture_local: clip.captureLocal,
      duration_seconds: clip.durationSeconds,
      display_resolution: `${clip.displayWidth}x${clip.displayHeight}`,
      fps: clip.fps,
      lens: clip.lens,
      shoot_block: clip.shootBlock,
      rating: decision.rating,
      content_type: decision.contentType,
      suggested_role: decision.suggestedRole,
      clip_in: decision.clipIn,
      moment_time: decision.momentTime,
      clip_out: decision.clipOut,
      keep_reason: decision.keepReason,
      notes: decision.notes,
    }
  })
}

function selectedClips() {
  return inventory.clips.filter((clip) => ['A', 'B'].includes(decisionFor(clip.id).rating))
}

function clipMapRows() {
  return selectedClips().map((clip) => {
    const decision = decisionFor(clip.id)
    const editorial = [
      `Initial visual grade ${decision.rating}`,
      decision.contentType ? `content: ${typeLabel(decision.contentType)}` : '',
      decision.suggestedRole ? `role: ${roleLabel(decision.suggestedRole)}` : '',
    ].filter(Boolean).join(' · ')
    const notes = [
      editorial,
      decision.keepReason,
      decision.notes,
      'Verify teams, players, court, round, score, play, outcome, rights, and copy before queueing.',
    ].filter(Boolean).join(' ')
    return {
      clip_id: `jpo-${clip.id.toLowerCase()}`,
      file: clip.file,
      event: inventory.event.name,
      event_date: inventory.event.date,
      team_a: '',
      team_b: '',
      players: '',
      participant_handles: '',
      court: '',
      round: '',
      play_type: '',
      outcome: '',
      score: '',
      clip_in: decision.clipIn,
      moment_time: decision.momentTime,
      clip_out: decision.clipOut,
      footage_tone: '',
      ball_visibility: '',
      footage_credit: inventory.event.footageCredit,
      editor_credit: '',
      rights_status: 'unknown',
      copy_status: 'draft',
      caption_action: 'none',
      asset_cue: decision.suggestedRole,
      notes,
    }
  })
}

async function loadSourceFolder(files) {
  sourceFiles = new Map([...files]
    .filter((file) => file.name.toLowerCase().endsWith('.mp4'))
    .map((file) => [file.name.toUpperCase(), file]))
  const matched = inventory.clips.filter((clip) => sourceFiles.has(clip.file.toUpperCase())).length
  elements.sourceStatus.textContent = matched
    ? `${matched}/${inventory.summary.clips} JPO originals linked for this browser session.`
    : 'No inventory filenames matched the selected folder.'
  elements.sourceStatus.classList.toggle('is-linked', matched > 0)
  renderAll()
  if (elements.detailDialog.open && currentId) openDetail(currentId)
  showToast(matched ? `${matched} source videos linked.` : 'No matching MP4 files found.')
}

elements.clipGrid.addEventListener('click', (event) => {
  const ratingButton = event.target.closest('[data-rate-id]')
  if (ratingButton) {
    const id = ratingButton.dataset.rateId
    const value = ratingButton.dataset.rating
    updateDecision(id, { rating: decisionFor(id).rating === value ? '' : value })
    return
  }
  const openButton = event.target.closest('[data-open]')
  if (openButton) openDetail(openButton.dataset.open)
})

for (const control of [elements.search, elements.ratingFilter, elements.typeFilter, elements.blockFilter, elements.sortOrder]) {
  control.addEventListener(control === elements.search ? 'input' : 'change', renderGrid)
}

elements.resetFilters.addEventListener('click', () => {
  elements.search.value = ''
  elements.ratingFilter.value = 'all'
  elements.typeFilter.value = 'all'
  elements.blockFilter.value = 'all'
  elements.sortOrder.value = 'capture'
  renderGrid()
})

elements.chooseSource.addEventListener('click', () => elements.sourceInput.click())
elements.chooseSourceFromDetail.addEventListener('click', () => elements.sourceInput.click())
elements.sourceInput.addEventListener('change', () => loadSourceFolder(elements.sourceInput.files))

elements.detailRatings.addEventListener('click', (event) => {
  const button = event.target.closest('[data-detail-rating]')
  if (!button || !currentId) return
  updateDecision(currentId, { rating: button.dataset.detailRating })
  renderDetailRating(currentId)
})

elements.detailType.addEventListener('change', () => updateDecision(currentId, { contentType: elements.detailType.value }))
elements.detailRole.addEventListener('change', () => updateDecision(currentId, { suggestedRole: elements.detailRole.value }))

for (const [element, field] of [
  [elements.clipIn, 'clipIn'],
  [elements.momentTime, 'momentTime'],
  [elements.clipOut, 'clipOut'],
  [elements.keepReason, 'keepReason'],
  [elements.reviewNotes, 'notes'],
]) {
  element.addEventListener('input', () => updateDecision(currentId, { [field]: element.value }, { render: false }))
}

elements.detailFilmstrip.addEventListener('click', (event) => {
  const button = event.target.closest('[data-frame-fraction]')
  if (!button || !elements.videoShell.classList.contains('has-source')) return
  const clip = inventory.clips.find((item) => item.id === currentId)
  elements.sourceVideo.currentTime = clip.durationSeconds * Number(button.dataset.frameFraction)
})

document.querySelector('.playback-row').addEventListener('click', (event) => {
  const button = event.target.closest('[data-speed]')
  if (button) setPlaybackSpeed(Number(button.dataset.speed))
})

elements.previousClip.addEventListener('click', () => moveDetail(-1))
elements.nextClip.addEventListener('click', () => moveDetail(1))
elements.detailDialog.addEventListener('close', () => {
  elements.sourceVideo.pause()
  renderAll()
})

elements.copyFilenames.addEventListener('click', async () => {
  const names = selectedClips().map((clip) => clip.file).join('\n')
  if (!names) return showToast('The A/B shortlist is empty.')
  try {
    await navigator.clipboard.writeText(names)
    showToast(`${selectedClips().length} filenames copied.`)
  } catch {
    download(`jpo-shortlist-${fileTimeStamp()}.txt`, `${names}\n`, 'text/plain')
    showToast('Clipboard access was unavailable; downloaded a filename list instead.')
  }
})

elements.exportReview.addEventListener('click', () => {
  const columns = [
    'id', 'file', 'capture_local', 'duration_seconds', 'display_resolution', 'fps', 'lens',
    'shoot_block', 'rating', 'content_type', 'suggested_role', 'clip_in', 'moment_time',
    'clip_out', 'keep_reason', 'notes',
  ]
  download(`jpo-review-${fileTimeStamp()}.csv`, rowsToCsv(reviewRows(), columns), 'text/csv')
  showToast('Review CSV exported.')
})

elements.exportClipMap.addEventListener('click', () => {
  const rows = clipMapRows()
  if (!rows.length) return showToast('The A/B shortlist is empty.')
  download(`jpo-clip-desk-${fileTimeStamp()}.csv`, rowsToCsv(rows, CLIP_COLUMNS), 'text/csv')
  showToast(`${rows.length} A/B clips exported for the Clip Desk.`)
})

elements.exportJson.addEventListener('click', () => {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceInventory: 'inventory.json',
    decisions,
  }
  download(`jpo-review-${fileTimeStamp()}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'application/json')
  showToast('Review JSON backed up.')
})

async function initialize() {
  try {
    const [inventoryResponse, seedResponse] = await Promise.all([
      fetch('inventory.json'),
      fetch('review-seed.json'),
    ])
    if (!inventoryResponse.ok || !seedResponse.ok) throw new Error('Review data could not be loaded.')
    inventory = await inventoryResponse.json()
    const seed = await seedResponse.json()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const ids = new Set([...Object.keys(seed.decisions ?? {}), ...Object.keys(stored.decisions ?? {})])
    decisions = Object.fromEntries([...ids].map((id) => [
      id,
      { ...(seed.decisions?.[id] ?? {}), ...(stored.decisions?.[id] ?? {}) },
    ]))
    populateFilters()
    renderAll()
  } catch (error) {
    elements.clipGrid.innerHTML = `<div class="empty-state"><strong>JPO review data did not load.</strong><br>${escapeHtml(error.message)}<br><br>Serve the project over HTTP; do not open this file directly.</div>`
    console.error(error)
  }
}

initialize()
