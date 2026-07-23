#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REVIEW_DIR = join(ROOT, 'creative', 'editor-kits', 'capcut', 'jpo-review')

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

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})\n${result.stderr || result.stdout}`)
}

const args = argsFrom(process.argv.slice(2))
const inventoryPath = typeof args.inventory === 'string' ? resolve(ROOT, args.inventory) : join(REVIEW_DIR, 'inventory.json')
if (!existsSync(inventoryPath)) throw new Error(`Inventory not found: ${inventoryPath}`)
if (typeof args.clips !== 'string') throw new Error('Required: --clips C2260,C2285,…')

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
const requested = args.clips.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
const clipsById = new Map(inventory.clips.map((clip) => [clip.id.toUpperCase(), clip]))
const clips = requested.map((id) => {
  const clip = clipsById.get(id)
  if (!clip) throw new Error(`Unknown clip: ${id}`)
  return clip
})
const outputDir = typeof args.output === 'string' ? resolve(ROOT, args.output) : join(REVIEW_DIR, 'storyboards')
mkdirSync(outputDir, { recursive: true })
const tempDir = mkdtempSync(join(tmpdir(), 'letspepper-jpo-storyboards-'))

const storyboardPaths = []
try {
  for (const [index, clip] of clips.entries()) {
    const rawPath = join(tempDir, `${clip.id}-raw.jpg`)
    const outputPath = join(outputDir, `${clip.id}.jpg`)
    const sampleFps = Math.max(0.05, 12 / Math.max(clip.durationSeconds, 0.1))
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', clip.sourcePath,
      '-map', '0:v:0',
      '-vf', `fps=${sampleFps.toFixed(6)},scale=240:-2:flags=lanczos,tile=4x3:padding=8:margin=8:color=0x111111`,
      '-frames:v', '1',
      '-q:v', '3',
      '-y',
      rawPath,
    ])
    run('magick', [
      rawPath,
      '-gravity', 'south',
      '-background', '#090909',
      '-splice', '0x64',
      '-fill', '#f5f5f0',
      '-font', 'Arial-Bold',
      '-pointsize', '30',
      '-annotate', '+0+17', `${clip.file}  ·  ${clip.durationLabel}  ·  ${clip.captureLocal}`,
      '-quality', '90',
      outputPath,
    ])
    storyboardPaths.push(outputPath)
    console.log(`${index + 1}/${clips.length} ${clip.id}`)
  }

  for (let start = 0; start < storyboardPaths.length; start += 4) {
    const page = Math.floor(start / 4) + 1
    const output = join(outputDir, `shortlist-page-${String(page).padStart(2, '0')}.jpg`)
    run('magick', [
      'montage',
      ...storyboardPaths.slice(start, start + 4),
      '-tile', '2x2',
      '-geometry', '+18+18',
      '-background', '#111111',
      '-quality', '90',
      output,
    ])
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log(`\n${clips.length} storyboards → ${basename(outputDir)}/`)
