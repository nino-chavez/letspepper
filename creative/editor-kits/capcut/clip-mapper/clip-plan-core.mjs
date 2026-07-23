export const CLIP_COLUMNS = [
  'clip_id',
  'file',
  'event',
  'event_date',
  'team_a',
  'team_b',
  'players',
  'participant_handles',
  'court',
  'round',
  'play_type',
  'outcome',
  'score',
  'clip_in',
  'moment_time',
  'clip_out',
  'footage_tone',
  'ball_visibility',
  'footage_credit',
  'editor_credit',
  'rights_status',
  'copy_status',
  'caption_action',
  'asset_cue',
  'notes',
]

export const PLAY_OPTIONS = [
  ['ace', 'Ace'],
  ['stuff-block', 'Stuff block'],
  ['dig', 'Dig'],
  ['pancake', 'Pancake'],
  ['finish', 'Finish / put-away'],
  ['match-point', 'Match point'],
  ['final-point', 'Final point'],
  ['clutch', 'Clutch point'],
  ['upset', 'Upset'],
  ['comeback', 'Comeback'],
  ['play-of-day', 'Play of the day'],
  ['champions', 'Champions'],
  ['finalists', 'Finalists'],
  ['photo-of-day', 'Photo of the day'],
  ['rally', 'Rally / no stamp'],
]

export const RIGHTS_OPTIONS = [
  ['approved', 'Approved for this post'],
  ['owned', 'Owned by Let\'s Pepper'],
  ['licensed', 'Licensed for this post'],
  ['pending', 'Permission pending'],
  ['restricted', 'Restricted — do not post'],
  ['unknown', 'Not checked'],
]

export const COPY_OPTIONS = [
  ['approved', 'Copy checked'],
  ['draft', 'Copy still needs review'],
]

const ROOT = 'creative/exports/media-kit-v1'
const capcut = (path) => `${ROOT}/capcut/${path}`
const audio = (file) => `${ROOT}/audio/${file}`

const MOMENTS = {
  ace: {
    label: 'ACE',
    detail: 'Clean from the line.',
    overlay: 'ace',
    motion: 'ace-stamp',
    audio: 'serve-snap.wav',
  },
  'stuff-block': {
    label: 'STUFF BLOCK',
    detail: 'Closed at the net.',
    overlay: 'stuff-block',
    motion: 'block-stamp',
    audio: 'block-hit.wav',
  },
  dig: {
    label: 'DIG',
    detail: 'Kept the rally alive.',
    overlay: 'dig',
    motion: 'dig-stamp',
    audio: 'digital-cut.wav',
  },
  pancake: {
    label: 'PANCAKE',
    detail: 'Just off the grass.',
    overlay: 'pancake',
    audio: 'impact-slam.wav',
  },
  finish: {
    label: 'THE FINISH',
    detail: 'Three touches. Point down.',
    overlay: 'finish',
    audio: 'impact-slam.wav',
  },
  'match-point': {
    label: 'MATCH POINT',
    detail: 'One point from the match.',
    overlay: 'match-point',
    cover: 'match-point',
    audio: 'energy-rise.wav',
  },
  'final-point': {
    label: 'FINAL POINT',
    detail: 'That closed it.',
    overlay: 'final-point',
    cover: 'final-point',
    audio: 'impact-slam.wav',
  },
  clutch: {
    label: 'CLUTCH',
    detail: 'Delivered under pressure.',
    overlay: 'clutch',
    audio: 'energy-rise.wav',
  },
  upset: {
    label: 'UPSET ALERT',
    detail: 'The bracket just moved.',
    overlay: 'upset',
    audio: 'bracket-lock.wav',
  },
  comeback: {
    label: 'COMEBACK',
    detail: 'Down early. Still here.',
    overlay: 'comeback',
    cover: 'comeback',
    audio: 'energy-rise.wav',
  },
  'play-of-day': {
    label: 'PLAY OF THE DAY',
    detail: 'The rally to run back.',
    overlay: 'play-of-day',
    cover: 'play-day',
    audio: 'energy-rise.wav',
  },
  champions: {
    label: 'CHAMPIONS',
    detail: 'Finished the day on top.',
    overlay: 'champions',
    motion: 'champion-hit',
    cover: 'champions',
    audio: 'sonic-logo.wav',
  },
  finalists: {
    label: 'FINALISTS',
    detail: 'Played through the last match.',
    overlay: 'finalists',
    audio: 'sonic-logo.wav',
  },
  'photo-of-day': {
    label: 'PHOTO OF THE DAY',
    detail: 'One frame from the grass.',
    overlay: 'photo-of-day',
    audio: 'camera-shutter.wav',
  },
  rally: {
    label: 'THE RALLY',
    detail: 'Watch the point develop.',
    overlay: null,
    cover: 'rally',
    audio: null,
  },
}

const PLAY_ALIASES = new Map([
  ['ace', 'ace'],
  ['serve ace', 'ace'],
  ['service ace', 'ace'],
  ['block', 'stuff-block'],
  ['roof', 'stuff-block'],
  ['stuff block', 'stuff-block'],
  ['stuff-block', 'stuff-block'],
  ['dig', 'dig'],
  ['pancake', 'pancake'],
  ['kill', 'finish'],
  ['spike', 'finish'],
  ['put away', 'finish'],
  ['put-away', 'finish'],
  ['finish', 'finish'],
  ['match point', 'match-point'],
  ['match-point', 'match-point'],
  ['final point', 'final-point'],
  ['final-point', 'final-point'],
  ['clutch', 'clutch'],
  ['upset', 'upset'],
  ['comeback', 'comeback'],
  ['play of the day', 'play-of-day'],
  ['play-of-day', 'play-of-day'],
  ['champion', 'champions'],
  ['champions', 'champions'],
  ['finalist', 'finalists'],
  ['finalists', 'finalists'],
  ['photo', 'photo-of-day'],
  ['photo of the day', 'photo-of-day'],
  ['photo-of-day', 'photo-of-day'],
  ['rally', 'rally'],
  ['none', 'rally'],
])

const READY_RIGHTS = new Set(['approved', 'owned', 'licensed'])
const PLACEHOLDER = /(?:^|\b)(?:tbd|tk|unknown|placeholder|replace(?: me)?|team a|team b|player name)(?:\b|$)/i
const INSTAGRAM_HANDLE = /^[a-z0-9._]{1,30}$/i

const clean = (value) => String(value ?? '').trim()
const sentence = (value) => {
  const text = clean(value)
  return text && !/[.!?]$/.test(text) ? `${text}.` : text
}

export function normalizePlayType(value) {
  const key = clean(value).toLowerCase().replace(/[_]+/g, ' ').replace(/\s+/g, ' ')
  return PLAY_ALIASES.get(key) ?? null
}

export function splitList(value) {
  return clean(value)
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeHandles(value) {
  return splitList(value).map((handle) => handle.replace(/^@/, ''))
}

export function parseTimecode(value) {
  const text = clean(value)
  if (!text) return null
  const parts = text.split(':')
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => part === '' || Number.isNaN(Number(part)))) return NaN
  const seconds = Number(parts.at(-1))
  const minutes = Number(parts.at(-2))
  const hours = parts.length === 3 ? Number(parts[0]) : 0
  if (seconds >= 60 || minutes >= 60 || seconds < 0 || minutes < 0 || hours < 0) return NaN
  return (hours * 3600) + (minutes * 60) + seconds
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  const input = String(text ?? '').replace(/^\uFEFF/, '')

  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') quoted = false
      else field += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      field = ''
    } else field += char
  }

  if (quoted) throw new Error('CSV has an unclosed quoted field.')
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    if (row.some((cell) => cell !== '')) rows.push(row)
  }
  return rows
}

export function recordsFromCsv(text) {
  const rows = parseCsv(text)
  if (!rows.length) return []
  const headers = rows[0].map((header) => clean(header))
  const missing = CLIP_COLUMNS.slice(0, 13).filter((column) => !headers.includes(column))
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(', ')}`)
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, clean(row[index])]))).filter((record) => Object.values(record).some(Boolean))
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function recordsToCsv(records, columns = CLIP_COLUMNS) {
  const lines = [columns.map(csvCell).join(',')]
  for (const record of records) lines.push(columns.map((column) => csvCell(record[column])).join(','))
  return `${lines.join('\n')}\n`
}

export function validateClip(input) {
  const record = Object.fromEntries(CLIP_COLUMNS.map((column) => [column, clean(input[column])]))
  const issues = []
  const error = (field, message) => issues.push({ level: 'error', field, message })
  const warning = (field, message) => issues.push({ level: 'warning', field, message })
  const required = ['clip_id', 'file', 'event', 'event_date', 'team_a', 'team_b', 'court', 'round', 'play_type', 'outcome', 'score', 'footage_credit', 'rights_status', 'copy_status']

  for (const field of required) {
    if (!record[field]) error(field, 'Required before this clip can be queued.')
    else if (!['rights_status', 'copy_status'].includes(field) && PLACEHOLDER.test(record[field])) error(field, 'Replace the placeholder with a verified value.')
  }

  if (record.event_date) {
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(record.event_date) ? new Date(`${record.event_date}T00:00:00Z`) : null
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== record.event_date) error('event_date', 'Use a real date in YYYY-MM-DD format so it cannot be misread.')
  }
  if (record.play_type && !normalizePlayType(record.play_type)) error('play_type', 'Choose a supported play type; the tool will not guess the moment.')
  if (record.score && !/\d+\D+\d+/.test(record.score)) error('score', 'Enter both sides of the verified score.')
  if (record.rights_status && !READY_RIGHTS.has(record.rights_status.toLowerCase())) error('rights_status', 'Permission is not cleared. Keep this clip out of the publishing queue.')
  if (record.copy_status && record.copy_status.toLowerCase() !== 'approved') error('copy_status', 'Copy still needs review.')

  const handles = normalizeHandles(record.participant_handles)
  for (const handle of handles) if (!INSTAGRAM_HANDLE.test(handle)) error('participant_handles', `“${handle}” is not a valid Instagram handle.`)
  if (splitList(record.players).length && !handles.length) warning('participant_handles', 'No player handles are attached. That is fine if nobody will be tagged; otherwise verify them now.')
  if (handles.length && !splitList(record.players).length) warning('players', 'Handles are present without player names. Add names so the archive remains understandable off-platform.')

  const timecodes = ['clip_in', 'moment_time', 'clip_out'].map((field) => [field, parseTimecode(record[field])])
  for (const [field, seconds] of timecodes) if (Number.isNaN(seconds)) error(field, 'Use M:SS, M:SS.sss, or H:MM:SS.')
  const presentTimes = timecodes.filter(([, seconds]) => seconds !== null && !Number.isNaN(seconds))
  if (presentTimes.length && presentTimes.length !== 3) warning('moment_time', 'Add clip in, moment, and clip out together to make the handoff unambiguous.')
  if (presentTimes.length === 3) {
    const values = Object.fromEntries(presentTimes)
    if (!(values.clip_in < values.moment_time && values.moment_time < values.clip_out)) error('moment_time', 'The moment must fall after clip in and before clip out.')
  }

  if (!['', 'mostly-light', 'mostly-dark', 'mixed'].includes(record.footage_tone)) error('footage_tone', 'Choose mostly light, mostly dark, or mixed footage.')
  if (!['', 'clear', 'hard-to-follow'].includes(record.ball_visibility)) error('ball_visibility', 'Choose clear or hard to follow.')
  if (!['', 'none', 'gallery', 'tag-team'].includes(record.caption_action)) error('caption_action', 'Choose no action, gallery, or tag your team.')

  return { record, issues, ready: !issues.some((issue) => issue.level === 'error') }
}

function assetPlan(record, playType) {
  const moment = MOMENTS[playType]
  const tone = record.footage_tone || 'mixed'
  const bug = tone === 'mostly-light' ? 'bugs/brand-dark.png' : 'bugs/brand-light.png'
  const lowerThird = splitList(record.players).length ? 'lower-thirds/player.png' : 'lower-thirds/match.png'
  const tracker = record.ball_visibility === 'hard-to-follow' ? 'trackers/ring.png' : null
  const cover = `covers/${moment.cover || 'rally'}.png`
  return {
    moment: moment.overlay ? capcut(`moments/${moment.overlay}.png`) : null,
    motionAlpha: moment.motion ? capcut(`motion/alpha/${moment.motion}.mov`) : null,
    motionScreen: moment.motion ? capcut(`motion/screen/${moment.motion}.mp4`) : null,
    audio: moment.audio ? audio(moment.audio) : null,
    bug: capcut(bug),
    lowerThird: capcut(lowerThird),
    credit: capcut('lower-thirds/credit.png'),
    tracker: tracker ? capcut(tracker) : null,
    cover: capcut(cover),
    safeZones: capcut('guides/reel-safe-zones.png'),
  }
}

function buildCaption(record, playType) {
  const moment = MOMENTS[playType]
  const matchup = record.team_a && record.team_b
    ? `${record.team_a} vs ${record.team_b}`
    : record.team_a || record.team_b
  const context = [record.event, matchup, record.round].filter(Boolean).join(' · ')
  const result = [sentence(record.outcome), record.score].filter(Boolean).join(' ')
  const action = record.caption_action === 'gallery'
    ? 'Full gallery: letspepper.com/gallery.'
    : record.caption_action === 'tag-team' ? 'Tag your team.' : ''
  const credit = record.footage_credit ? `Footage: ${record.footage_credit}.` : ''
  const parts = playType === 'final-point'
    ? [sentence(moment.label), sentence(record.outcome), [record.event, record.round, record.score].filter(Boolean).join(' · '), action, credit]
    : [sentence(moment.detail), sentence(context), sentence(result), action, credit]
  return parts.filter(Boolean).join(' ').replace(/\.\./g, '.').replace(/\s+/g, ' ').trim()
}

export function createEditPlan(input) {
  const validation = validateClip(input)
  const playType = normalizePlayType(validation.record.play_type) || 'rally'
  const record = { ...validation.record, play_type: playType, asset_cue: playType }
  const moment = MOMENTS[playType]
  const assets = assetPlan(record, playType)
  const caption = buildCaption(record, playType)
  const handles = normalizeHandles(record.participant_handles)
  const momentTiming = record.moment_time
    ? `Place the stamp on the first clean frame after ${record.moment_time}.`
    : 'Place the stamp on the first clean frame after the point is decided.'
  const wordCount = caption ? caption.split(/\s+/).length : 0
  const issues = [...validation.issues]
  if (wordCount > 55) issues.push({ level: 'warning', field: 'caption', message: `Caption is ${wordCount} words; trim it to 55 or fewer.` })

  return {
    clipId: record.clip_id,
    sourceFile: record.file,
    ready: !issues.some((issue) => issue.level === 'error'),
    blockers: issues.filter((issue) => issue.level === 'error'),
    warnings: issues.filter((issue) => issue.level === 'warning'),
    facts: {
      event: record.event,
      eventDate: record.event_date,
      matchup: [record.team_a, record.team_b],
      players: splitList(record.players),
      participantHandles: handles,
      court: record.court,
      round: record.round,
      playType,
      outcome: record.outcome,
      score: record.score,
      clipIn: record.clip_in || null,
      momentTime: record.moment_time || null,
      clipOut: record.clip_out || null,
      footageCredit: record.footage_credit,
      editorCredit: record.editor_credit || null,
      rightsStatus: record.rights_status,
      copyStatus: record.copy_status,
    },
    treatment: {
      label: moment.label,
      detail: moment.detail,
      assets,
      timing: [
        'Show the match or player lower third for 1.5–2.5 seconds near the opening.',
        `${momentTiming} Keep it on screen for 0.35–0.9 seconds.`,
        record.ball_visibility === 'hard-to-follow'
          ? 'Use the ring only while the ball is genuinely hard to locate; remove it before contact.'
          : 'No ball tracker recommended.',
        'Keep the corner bug at 18–28% opacity after its intro.',
        'Show the verified footage credit for the first or final two seconds.',
      ],
    },
    caption: { text: caption, wordCount, status: record.copy_status },
    queueDraft: {
      id: record.clip_id,
      account: 'letspepper',
      media_type: 'REELS',
      source_file: record.file,
      video_url: null,
      caption,
      user_tags: handles,
      collaborators: [],
      scheduledAt: null,
      status: 'draft',
      rights_status: record.rights_status,
      copy_status: record.copy_status,
      footage_credit: record.footage_credit,
    },
    sourceRecord: record,
  }
}

export function createEditPlans(inputs) {
  const plans = inputs.map(createEditPlan)
  const byId = new Map()
  for (const plan of plans) {
    if (!plan.clipId) continue
    const group = byId.get(plan.clipId) || []
    group.push(plan)
    byId.set(plan.clipId, group)
  }
  for (const [clipId, group] of byId) {
    if (group.length < 2) continue
    for (const plan of group) {
      plan.blockers.push({ level: 'error', field: 'clip_id', message: `Clip ID “${clipId}” is used ${group.length} times. Give every source clip a unique ID.` })
      plan.ready = false
    }
  }
  return plans
}

export function emptyClip(overrides = {}) {
  return Object.fromEntries(CLIP_COLUMNS.map((column) => [column, overrides[column] ?? '']))
}
