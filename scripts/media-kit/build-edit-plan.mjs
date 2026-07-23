#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEditPlans, recordsFromCsv } from '../../creative/editor-kits/capcut/clip-mapper/clip-plan-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function argsFrom(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const next = argv[i + 1]
    args[token.slice(2)] = !next || next.startsWith('--') ? true : next
    if (next && !next.startsWith('--')) i++
  }
  return args
}

function usage(message) {
  if (message) console.error(message)
  console.error('Usage: node scripts/media-kit/build-edit-plan.mjs --input <clip-map.csv> [--output <edit-plan.json>] [--queue-output <queue-draft.json>] [--allow-incomplete]')
  process.exit(1)
}

const args = argsFrom(process.argv.slice(2))
if (typeof args.input !== 'string') usage('Required: --input <clip-map.csv>')

const inputPath = resolve(ROOT, args.input)
if (!existsSync(inputPath)) usage(`Clip map not found: ${inputPath}`)

const defaultName = `${inputPath.slice(0, inputPath.length - extname(inputPath).length)}.edit-plan.json`
const outputPath = typeof args.output === 'string' ? resolve(ROOT, args.output) : defaultName
const queuePath = typeof args['queue-output'] === 'string' ? resolve(ROOT, args['queue-output']) : null

let records
try {
  records = recordsFromCsv(readFileSync(inputPath, 'utf8'))
} catch (error) {
  usage(error.message)
}
if (!records.length) usage('The clip map has no clip rows.')

const clips = createEditPlans(records)
const missingAssets = []
for (const clip of clips) {
  for (const [role, path] of Object.entries(clip.treatment.assets)) {
    if (!path) continue
    if (!existsSync(join(ROOT, path))) missingAssets.push({ clip, role, path })
  }
}

for (const { clip, role, path } of missingAssets) {
  clip.blockers.push({ level: 'error', field: 'assets', message: `Missing recommended ${role} asset: ${path}` })
  clip.ready = false
}

const ready = clips.filter((clip) => clip.ready)
const blocked = clips.filter((clip) => !clip.ready)
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: relative(ROOT, inputPath),
  summary: { clips: clips.length, ready: ready.length, blocked: blocked.length },
  clips,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Edit plan: ${relative(ROOT, outputPath)}`)
console.log(`${ready.length}/${clips.length} clips ready · ${blocked.length} blocked`)

if (queuePath) {
  const queue = {
    version: 1,
    generatedAt: report.generatedAt,
    source: report.source,
    note: 'Draft only. Add a hosted video URL and schedule before publishing.',
    items: ready.map((clip) => clip.queueDraft),
  }
  mkdirSync(dirname(queuePath), { recursive: true })
  writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`)
  console.log(`Queue draft: ${relative(ROOT, queuePath)} (${queue.items.length} ready clips)`)
}

for (const clip of blocked) {
  console.error(`\n${clip.clipId || '(unnamed clip)'}`)
  for (const issue of clip.blockers) console.error(`  × ${issue.field}: ${issue.message}`)
}

if (blocked.length && !args['allow-incomplete']) process.exit(1)
