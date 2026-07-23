#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLIP_COLUMNS,
  recordsToCsv,
} from '../../creative/editor-kits/capcut/clip-mapper/clip-plan-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_OUTPUT = join(ROOT, 'creative', 'editor-kits', 'capcut', 'jpo-review')
const EVENT = {
  name: 'Jalapeño Open',
  date: '2026-07-18',
  displayDate: 'July 18, 2026',
  location: 'Nature Meadows Park · Aurora, IL',
  format: 'Grass Triples · 3v3',
  footageCredit: 'Flickday Media',
}

function argsFrom(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const next = argv[i + 1]
    args[token.slice(2)] = !next || next.startsWith('--') ? true : next
    if (next && !next.startsWith('--')) i += 1
  }
  return args
}

function usage(message) {
  if (message) console.error(message)
  console.error('Usage: node scripts/media-kit/build-jpo-review.mjs --source <JPO video directory> [--output <project directory>] [--inventory-only] [--force-thumbnails]')
  process.exit(1)
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function xmlAttribute(xml, tag, attribute) {
  if (!xml) return ''
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]*)"`, 'i'))
  return match?.[1] ?? ''
}

function fraction(value) {
  if (!value) return 0
  const [numerator, denominator = '1'] = String(value).split('/')
  const result = Number(numerator) / Number(denominator)
  return Number.isFinite(result) ? result : 0
}

function round(value, places = 3) {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0)
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function rowsToCsv(rows, columns) {
  return `${[
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n')}\n`
}

function localTimeLabel(value) {
  const match = String(value).match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (!match) return ''
  const [, hourText, minute, second] = match
  const hour = Number(hourText)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 || 12
  return `${displayHour}:${minute}:${second} ${suffix}`
}

function profileKey(clip) {
  return [
    `${clip.displayWidth}x${clip.displayHeight} display`,
    `${clip.width}x${clip.height} stored`,
    `${clip.fps}fps`,
    clip.videoCodec,
    clip.pixelFormat,
    clip.colorSpace,
    clip.audioCodec,
  ].join(' · ')
}

function makeContactSheets(clips, outputDir) {
  const sheetDir = join(outputDir, 'contact-sheets')
  mkdirSync(sheetDir, { recursive: true })
  const perSheet = 20
  const tempDir = mkdtempSync(join(tmpdir(), 'letspepper-jpo-sheets-'))

  try {
    for (let start = 0; start < clips.length; start += perSheet) {
      const group = clips.slice(start, start + perSheet)
      const page = Math.floor(start / perSheet) + 1
      const cards = []
      const filmstripCards = []

      for (const clip of group) {
        const input = join(outputDir, clip.reviewFrames[1])
        const card = join(tempDir, `${clip.id}-single.jpg`)
        const filmstripCard = join(tempDir, `${clip.id}-filmstrip.jpg`)
        const label = `${clip.file}  ·  ${formatClock(clip.durationSeconds)}  ·  ${localTimeLabel(clip.captureLocal)}`
        run('magick', [
          input,
          '-gravity', 'south',
          '-background', '#090909',
          '-splice', '0x46',
          '-fill', '#f5f5f0',
          '-font', 'Arial-Bold',
          '-pointsize', '21',
          '-annotate', '+0+11', label,
          '-quality', '88',
          card,
        ])
        run('magick', [
          ...clip.reviewFrames.map((frame) => join(outputDir, frame)),
          '-thumbnail', '180x320>',
          '+append',
          '-gravity', 'south',
          '-background', '#090909',
          '-splice', '0x46',
          '-fill', '#f5f5f0',
          '-font', 'Arial-Bold',
          '-pointsize', '20',
          '-annotate', '+0+11', label,
          '-quality', '88',
          filmstripCard,
        ])
        cards.push(card)
        filmstripCards.push(filmstripCard)
      }

      const output = join(sheetDir, `jpo-contact-${String(page).padStart(2, '0')}.jpg`)
      run('magick', [
        'montage',
        ...cards,
        '-thumbnail', '460x305>',
        '-tile', '5x4',
        '-geometry', '+14+14',
        '-background', '#111111',
        '-quality', '90',
        output,
      ])

      const filmstripOutput = join(sheetDir, `jpo-filmstrip-${String(page).padStart(2, '0')}.jpg`)
      run('magick', [
        'montage',
        ...filmstripCards,
        '-tile', '4x5',
        '-geometry', '+14+14',
        '-background', '#111111',
        '-quality', '90',
        filmstripOutput,
      ])
      console.log(`  contact sheet ${page}/${Math.ceil(clips.length / perSheet)}`)
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

const args = argsFrom(process.argv.slice(2))
if (typeof args.source !== 'string') usage('Required: --source <JPO video directory>')

const sourceDir = resolve(args.source)
const outputDir = typeof args.output === 'string' ? resolve(ROOT, args.output) : DEFAULT_OUTPUT
if (!existsSync(sourceDir)) usage(`Source directory not found: ${sourceDir}`)

const videoFiles = readdirSync(sourceDir)
  .filter((name) => extname(name).toLowerCase() === '.mp4')
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

if (!videoFiles.length) usage(`No MP4 files found in ${sourceDir}`)

mkdirSync(outputDir, { recursive: true })
mkdirSync(join(outputDir, 'thumbs'), { recursive: true })

console.log(`Reading ${videoFiles.length} JPO clips…`)
const clips = []

for (const [index, file] of videoFiles.entries()) {
  const sourcePath = join(sourceDir, file)
  const id = basename(file, extname(file)).toUpperCase()
  const sidecarFile = `${id}M01.XML`
  const sidecarPath = join(sourceDir, sidecarFile)
  const sidecarExists = existsSync(sidecarPath)
  const xml = sidecarExists ? readFileSync(sidecarPath, 'utf8') : ''
  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:format_tags=creation_time',
    '-show_entries', 'stream=index,codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,color_space,color_transfer,color_primaries,sample_rate,channels:stream_side_data=rotation',
    '-of', 'json',
    sourcePath,
  ]))
  const video = probe.streams.find((stream) => stream.codec_type === 'video') ?? {}
  const audio = probe.streams.find((stream) => stream.codec_type === 'audio') ?? {}
  const durationSeconds = Number(probe.format.duration) || 0
  const captureLocal = xmlAttribute(xml, 'CreationDate', 'value')
  const captureUtc = probe.format.tags?.creation_time ?? ''
  const reviewFrames = ['a', 'b', 'c'].map((suffix) => `thumbs/${id}-${suffix}.jpg`)
  const rotation = Number(video.side_data_list?.find((entry) => Number.isFinite(Number(entry.rotation)))?.rotation) || 0
  const rotatesDimensions = Math.abs(rotation) % 180 === 90

  const clip = {
    id,
    file,
    sourcePath,
    sidecarFile: sidecarExists ? sidecarFile : '',
    sidecarExists,
    captureLocal,
    captureUtc,
    durationSeconds: round(durationSeconds),
    durationLabel: formatClock(durationSeconds),
    bytes: Number(probe.format.size) || statSync(sourcePath).size,
    mebibytes: round((Number(probe.format.size) || statSync(sourcePath).size) / 1024 / 1024, 1),
    bitRateMbps: round((Number(probe.format.bit_rate) || 0) / 1_000_000, 1),
    videoCodec: video.codec_name ?? '',
    videoProfile: video.profile ?? '',
    width: Number(video.width) || 0,
    height: Number(video.height) || 0,
    rotation,
    displayWidth: rotatesDimensions ? Number(video.height) || 0 : Number(video.width) || 0,
    displayHeight: rotatesDimensions ? Number(video.width) || 0 : Number(video.height) || 0,
    fps: round(fraction(video.avg_frame_rate || video.r_frame_rate), 2),
    pixelFormat: video.pix_fmt ?? '',
    colorSpace: video.color_space ?? '',
    colorTransfer: video.color_transfer ?? '',
    colorPrimaries: video.color_primaries ?? '',
    audioCodec: audio.codec_name ?? '',
    audioSampleRate: Number(audio.sample_rate) || 0,
    audioChannels: Number(audio.channels) || 0,
    camera: xmlAttribute(xml, 'Device', 'modelName'),
    lens: xmlAttribute(xml, 'Lens', 'modelName'),
    captureFps: xmlAttribute(xml, 'VideoFrame', 'captureFps'),
    formatFps: xmlAttribute(xml, 'VideoFrame', 'formatFps'),
    recordingMode: xmlAttribute(xml, 'RecordingMode', 'type'),
    timecodeFps: xmlAttribute(xml, 'LtcChangeTable', 'tcFps'),
    startTimecodeRaw: xmlAttribute(xml, 'LtcChange', 'value'),
    reviewFrames,
    reviewStatus: 'unreviewed',
    rating: '',
    contentType: '',
    keepReason: '',
    notes: '',
  }

  if (!args['inventory-only']) {
    const points = [0.2, 0.5, 0.8]
    for (let frameIndex = 0; frameIndex < points.length; frameIndex += 1) {
      const framePath = join(outputDir, reviewFrames[frameIndex])
      if (existsSync(framePath) && !args['force-thumbnails']) continue
      const seek = Math.max(0, Math.min(durationSeconds - 0.08, durationSeconds * points[frameIndex]))
      run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-ss', seek.toFixed(3),
        '-i', sourcePath,
        '-map', '0:v:0',
        '-frames:v', '1',
        '-vf', 'scale=640:-2:flags=lanczos',
        '-q:v', '3',
        '-y',
        framePath,
      ])
    }
  }

  clips.push(clip)
  if ((index + 1) % 10 === 0 || index === videoFiles.length - 1) {
    console.log(`  ${index + 1}/${videoFiles.length}`)
  }
}

clips.sort((a, b) => {
  const left = a.captureLocal || a.captureUtc
  const right = b.captureLocal || b.captureUtc
  return left.localeCompare(right) || a.file.localeCompare(b.file, undefined, { numeric: true })
})

let block = 1
let previousTime = null
for (const clip of clips) {
  const timestamp = Date.parse(clip.captureLocal || clip.captureUtc)
  const gapSeconds = previousTime === null || Number.isNaN(timestamp)
    ? null
    : round((timestamp - previousTime) / 1000, 1)
  if (gapSeconds !== null && gapSeconds > 12 * 60) block += 1
  clip.gapFromPreviousSeconds = gapSeconds
  clip.shootBlock = block
  previousTime = Number.isNaN(timestamp) ? previousTime : timestamp
}

const profiles = new Map()
for (const clip of clips) profiles.set(profileKey(clip), (profiles.get(profileKey(clip)) ?? 0) + 1)
const totalBytes = clips.reduce((sum, clip) => sum + clip.bytes, 0)
const totalDurationSeconds = clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
const missingSidecars = clips.filter((clip) => !clip.sidecarExists).map((clip) => clip.file)

const inventory = {
  version: 1,
  generatedAt: new Date().toISOString(),
  event: EVENT,
  source: {
    directory: sourceDir,
    policy: 'Read-only originals. Review derivatives live in the project.',
  },
  summary: {
    clips: clips.length,
    sidecars: clips.length - missingSidecars.length,
    missingSidecars,
    totalBytes,
    totalGiB: round(totalBytes / 1024 / 1024 / 1024, 2),
    totalDurationSeconds: round(totalDurationSeconds),
    totalDurationLabel: formatClock(totalDurationSeconds),
    firstCapture: clips[0]?.captureLocal || clips[0]?.captureUtc || '',
    lastCapture: clips.at(-1)?.captureLocal || clips.at(-1)?.captureUtc || '',
    shootBlocks: block,
    technicalProfiles: [...profiles.entries()].map(([profile, count]) => ({ profile, count })),
  },
  clips,
}

writeFileSync(join(outputDir, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)

const inventoryColumns = [
  'id', 'file', 'captureLocal', 'durationSeconds', 'mebibytes', 'displayWidth', 'displayHeight',
  'width', 'height', 'rotation', 'fps',
  'videoCodec', 'pixelFormat', 'colorSpace', 'audioCodec', 'camera', 'lens', 'shootBlock',
  'reviewStatus', 'rating', 'contentType', 'keepReason', 'notes',
]
writeFileSync(join(outputDir, 'inventory.csv'), rowsToCsv(clips, inventoryColumns))

const clipMap = clips.map((clip) => ({
  clip_id: `jpo-${clip.id.toLowerCase()}`,
  file: clip.file,
  event: EVENT.name,
  event_date: EVENT.date,
  team_a: '',
  team_b: '',
  players: '',
  participant_handles: '',
  court: '',
  round: '',
  play_type: '',
  outcome: '',
  score: '',
  clip_in: '',
  moment_time: '',
  clip_out: '',
  footage_tone: '',
  ball_visibility: '',
  footage_credit: EVENT.footageCredit,
  editor_credit: '',
  rights_status: 'unknown',
  copy_status: 'draft',
  caption_action: 'none',
  asset_cue: '',
  notes: `Captured ${localTimeLabel(clip.captureLocal)} · ${clip.durationLabel} source · review pending`,
}))
writeFileSync(join(outputDir, 'jpo-clip-map.csv'), recordsToCsv(clipMap, CLIP_COLUMNS))

if (!args['inventory-only']) makeContactSheets(clips, outputDir)

console.log(`\nJPO review inventory: ${relative(ROOT, join(outputDir, 'inventory.json'))}`)
console.log(`${clips.length} clips · ${inventory.summary.totalGiB} GiB · ${inventory.summary.totalDurationLabel} source duration`)
console.log(`${inventory.summary.shootBlocks} capture blocks · ${missingSidecars.length} missing sidecars`)
