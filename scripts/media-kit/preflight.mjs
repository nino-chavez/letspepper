#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { verifyPng } from '../story-assets/preflight.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = join(ROOT, 'creative', 'exports', 'media-kit-v1')
const REPORTS = join(BASE, 'reports')
mkdirSync(REPORTS, { recursive: true })

const errors = []
const checks = []
const add = (name, ok, detail) => { checks.push({ name, ok, detail }); if (!ok) errors.push(`${name}: ${detail}`) }

function run(command, args) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' })
}

const lint = run(process.execPath, [join(ROOT, 'scripts', 'media-kit', 'lint-copy.mjs')])
add('copy-gate', lint.status === 0, lint.status === 0 ? lint.stdout.trim().split('\n')[0] : (lint.stderr || lint.stdout).trim())

const clipPlanTest = run(process.execPath, [join(ROOT, 'scripts', 'media-kit', 'test-clip-plan.mjs')])
add('clip-planner', clipPlanTest.status === 0, clipPlanTest.status === 0 ? clipPlanTest.stdout.trim() : (clipPlanTest.stderr || clipPlanTest.stdout).trim())

const clipDeskFiles = ['index.html', 'styles.css', 'app.js', 'clip-plan-core.mjs']
  .map((name) => join(ROOT, 'creative', 'editor-kits', 'capcut', 'clip-mapper', name))
const clipDeskValid = clipDeskFiles.filter(existsSync).length
add('clip-desk', clipDeskValid === clipDeskFiles.length, `${clipDeskValid}/${clipDeskFiles.length} local editor files`)

const staticPath = join(BASE, 'manifest-static.json')
if (!existsSync(staticPath)) add('static-manifest', false, 'manifest-static.json is missing')
else {
  const manifest = JSON.parse(readFileSync(staticPath, 'utf8'))
  let valid = 0
  for (const asset of manifest.assets) {
    const path = join(ROOT, asset.path)
    try {
      verifyPng(path, { width: asset.width, height: asset.height, alpha: asset.alpha })
      valid++
    } catch (error) { errors.push(`static ${asset.path}: ${error.message}`) }
  }
  add('static-assets', valid === manifest.count, `${valid}/${manifest.count} PNGs match dimensions and alpha requirements`)
}

const anchorIds = ['habanero', 'reaper', 'pepper-x', 'chipotle', 'pepper-belle', 'pepperoncini', 'banana-pepper', 'shishito']
let anchorsValid = 0
for (const id of anchorIds) {
  const path = join(ROOT, 'public', 'images', 'mascots', 'anime', id, 'anchor.png')
  if (!existsSync(path)) { errors.push(`missing anchor: ${id}`); continue }
  try { verifyPng(path, { alpha: true }) } catch (error) { errors.push(`anchor ${id}: ${error.message}`); continue }
  const probe = run('magick', ['identify', '-format', '%w|%h|%[fx:mean.a]', path])
  const [width, height, alphaMean] = probe.stdout.trim().split('|').map(Number)
  const web1024 = join(ROOT, 'public', 'images', 'mascots', 'anime', 'web', `${id}-anchor-1024.webp`)
  const web256 = join(ROOT, 'public', 'images', 'mascots', 'anime', 'web', `${id}-anchor-256.webp`)
  if (width >= 1000 && height >= 1000 && alphaMean > .08 && alphaMean < .55 && existsSync(web1024) && existsSync(web256)) anchorsValid++
  else errors.push(`anchor ${id}: unexpected geometry/alpha or missing WebP (${width}x${height}, alpha mean ${alphaMean})`)
}
add('mascot-anchors', anchorsValid === anchorIds.length, `${anchorsValid}/${anchorIds.length} alpha anchors with two WebP derivatives`)

const motionPath = join(BASE, 'capcut', 'motion', 'manifest.json')
let motionValid = 0
if (existsSync(motionPath)) {
  const motion = JSON.parse(readFileSync(motionPath, 'utf8'))
  for (const clip of motion.clips) {
    const alphaPath = join(BASE, 'capcut', 'motion', clip.alpha)
    const screenPath = join(BASE, 'capcut', 'motion', clip.screen)
    const alpha = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height', '-of', 'json', alphaPath])
    const screen = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height', '-of', 'json', screenPath])
    try {
      const a = JSON.parse(alpha.stdout).streams[0]
      const s = JSON.parse(screen.stdout).streams[0]
      if (a.codec_name === 'prores' && a.pix_fmt.startsWith('yuva') && a.width === 1080 && a.height === 1920 && s.codec_name === 'h264' && s.width === 1080 && s.height === 1920) motionValid++
      else errors.push(`motion ${clip.id}: unexpected codecs or canvas`)
    } catch { errors.push(`motion ${clip.id}: ffprobe failed`) }
  }
  add('motion-clips', motionValid === motion.clips.length, `${motionValid}/${motion.clips.length} alpha/fallback pairs`)
} else add('motion-clips', false, 'motion manifest missing')

const audioPath = join(BASE, 'audio', 'manifest.json')
let audioValid = 0
if (existsSync(audioPath)) {
  const audio = JSON.parse(readFileSync(audioPath, 'utf8'))
  for (const cue of audio.cues) {
    const path = join(BASE, 'audio', cue.file)
    const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels', '-of', 'json', path])
    try {
      const stream = JSON.parse(probe.stdout).streams[0]
      if (Number(stream.sample_rate) === 48000 && stream.channels === 2) audioValid++
      else errors.push(`audio ${cue.id}: expected 48kHz stereo`)
    } catch { errors.push(`audio ${cue.id}: ffprobe failed`) }
  }
  add('audio-cues', audioValid === audio.cues.length, `${audioValid}/${audio.cues.length} original 48kHz stereo WAVs`)
} else add('audio-cues', false, 'audio manifest missing')

const lutDir = join(BASE, 'capcut', 'luts')
const lutFiles = existsSync(lutDir) ? readdirSync(lutDir).filter((name) => extname(name) === '.cube') : []
let lutValid = 0
for (const name of lutFiles) {
  const lines = readFileSync(join(lutDir, name), 'utf8').split(/\r?\n/)
  const data = lines.filter((line) => /^\d/.test(line.trim()))
  if (lines.includes('LUT_3D_SIZE 33') && data.length === 33 ** 3 && data.every((line) => line.trim().split(/\s+/).every((value) => Number(value) >= 0 && Number(value) <= 1))) lutValid++
  else errors.push(`LUT ${name}: invalid 33-point cube`)
}
add('field-luts', lutValid === 5, `${lutValid}/5 valid 33-point LUTs`)

const expectedSheets = ['capcut-static.jpg', 'poblano-event.jpg', 'fan-share.jpg', 'web-and-highlights.jpg', 'mascot-roster.png']
const sheetValid = expectedSheets.filter((name) => existsSync(join(BASE, 'contact-sheets', name))).length
add('contact-sheets', sheetValid === expectedSheets.length, `${sheetValid}/${expectedSheets.length} review sheets`)

const publicDerivatives = [
  ...['bell', 'poblano', 'jalapeno', 'habanero', 'reaper', 'pepper-x'].map((id) => ({ path: join(ROOT, 'public', 'images', 'share', 'quiz', `${id}.webp`), width: 1080, height: 1920 })),
  ...['standings', 'rankings', 'gallery', 'quiz', 'awards'].map((id) => ({ path: join(ROOT, 'public', 'images', 'og', 'creative', `${id}.jpg`), width: 1200, height: 630 })),
]
let publicValid = 0
for (const item of publicDerivatives) {
  const probe = run('magick', ['identify', '-format', '%w|%h', item.path])
  const [width, height] = probe.stdout.trim().split('|').map(Number)
  if (probe.status === 0 && width === item.width && height === item.height) publicValid++
  else errors.push(`public derivative ${relative(ROOT, item.path)}: expected ${item.width}x${item.height}`)
}
add('public-derivatives', publicValid === publicDerivatives.length, `${publicValid}/${publicDerivatives.length} website-ready share and Open Graph files`)

function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(path))
    else if (!entry.name.startsWith('.')) out.push(path)
  }
  return out
}

const files = listFiles(BASE)
const byExtension = files.reduce((out, path) => {
  const key = extname(path).toLowerCase() || 'none'
  out[key] = (out[key] || 0) + 1
  return out
}, {})

const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  ok: errors.length === 0,
  checks,
  errors,
  inventory: { files: files.length, bytes: files.reduce((sum, path) => sum + statSync(path).size, 0), byExtension },
}
writeFileSync(join(REPORTS, 'preflight.json'), `${JSON.stringify(report, null, 2)}\n`)
writeFileSync(join(BASE, 'manifest.json'), `${JSON.stringify({
  version: 1,
  generatedAt: report.generatedAt,
  status: report.ok ? 'production-ready' : 'failed-preflight',
  inventory: report.inventory,
  roots: {
    capcut: 'capcut', event: 'event/poblano', share: 'share', web: 'web', social: 'social',
    audio: 'audio', contactSheets: 'contact-sheets', reports: 'reports',
  },
  files: files.map((path) => relative(BASE, path)),
}, null, 2)}\n`)

for (const check of checks) console.log(`${check.ok ? '✓' : '×'} ${check.name}: ${check.detail}`)
console.log(`\nInventory: ${report.inventory.files} files · ${(report.inventory.bytes / 1024 / 1024).toFixed(1)} MB`)
if (errors.length) {
  console.error(`\nPreflight failed with ${errors.length} issue(s).`)
  for (const error of errors) console.error(`  × ${error}`)
  process.exit(1)
}
console.log('Production preflight passed.')
