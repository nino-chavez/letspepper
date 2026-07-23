#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const COPY_PATH = join(ROOT, 'creative', 'copy', 'approved-copy.json')
const REPORT_DIR = join(ROOT, 'creative', 'exports', 'media-kit-v1', 'reports')
const REPORT_PATH = join(REPORT_DIR, 'copy-lint.json')

const copy = JSON.parse(readFileSync(COPY_PATH, 'utf8'))
const errors = []
const warnings = []

for (const [section, items] of Object.entries(copy)) {
  if (!Array.isArray(items) || section === 'blocked') continue
  for (const item of items) {
    if (item.status !== 'approved') {
      errors.push(`${section}.${item.id ?? '?'} is ${item.status ?? 'missing a status'}`)
    }
    if (!item.label || !String(item.label).trim()) {
      errors.push(`${section}.${item.id ?? '?'} has no label`)
    }
  }
}

const blocked = [
  ...copy.blocked.map((entry) => entry.phrase),
  'link in bio',
  'absolute cinema',
  'vibes are immaculate',
  'main character',
  'understood the assignment',
  'fully spiced',
  'cooling things down',
  'dirty knees',
  'stakes that stay spicy',
]
const blockedPatterns = blocked.map((phrase) => ({
  phrase,
  pattern: new RegExp(`(?:^|\\W)${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\W)`, 'i'),
}))

const roots = [join(ROOT, 'src'), join(ROOT, 'scripts'), join(ROOT, 'creative', 'config')]
const extensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.csv'])

function walk(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'exports', 'queue', 'media-kit'].includes(entry)) continue
    const path = join(dir, entry)
    const st = statSync(path)
    if (st.isDirectory()) files.push(...walk(path))
    else if (extensions.has(extname(entry).toLowerCase())) files.push(path)
  }
  return files
}

const scanned = roots.flatMap(walk)
for (const path of scanned) {
  const rel = relative(ROOT, path)
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    for (const { phrase, pattern } of blockedPatterns) {
      if (pattern.test(lines[i])) {
        errors.push(`${rel}:${i + 1} contains blocked or temporary copy: “${phrase}”`)
      }
    }
    if (/!{2,}/.test(lines[i]) && !/!![\w[(]/.test(lines[i])) {
      warnings.push(`${rel}:${i + 1} uses repeated exclamation points`)
    }
  }
}

const queueDir = join(ROOT, 'scripts', 'social-publish', 'queue')
const queueFiles = existsSync(queueDir) ? readdirSync(queueDir).filter((name) => extname(name) === '.json') : []
let queueCaptionsScanned = 0
for (const name of queueFiles) {
  const rel = relative(ROOT, join(queueDir, name))
  const queue = JSON.parse(readFileSync(join(queueDir, name), 'utf8'))
  const items = (queue.items || []).filter((item) => ['pending', 'draft'].includes(item.status) && item.media_type !== 'STORIES')
  const firstLines = new Map()
  let stale = 0
  let missingCredit = 0

  for (const item of items) {
    const caption = String(item.caption || '').trim()
    if (!caption) {
      errors.push(`${rel}:${item.id} has no caption`)
      continue
    }
    queueCaptionsScanned++
    const hook = caption.split(/\r?\n/)[0].trim()
    firstLines.set(hook, (firstLines.get(hook) || 0) + 1)

    for (const { phrase, pattern } of blockedPatterns) {
      if (pattern.test(caption)) errors.push(`${rel}:${item.id} contains blocked or temporary copy: “${phrase}”`)
    }
    const hashtags = caption.match(/#[\p{L}\p{N}_]+/gu) || []
    if (hashtags.length > 5) errors.push(`${rel}:${item.id} has ${hashtags.length} hashtags; Instagram allows at most 5`)
    const words = caption.split(/\s+/).filter(Boolean).length
    if (words > 55) errors.push(`${rel}:${item.id} is ${words} words; the queue contract allows at most 55`)
    if (item.media_type === 'REELS' && !/\b(?:Footage|Photo|Video|Shot|Captured)\s*:/i.test(caption)) missingCredit++
    if (item.scheduledAt && new Date(item.scheduledAt).getTime() < Date.now()) stale++
  }

  if (items.length > 24) warnings.push(`${rel} has ${items.length} pending feed posts; select and schedule a smaller reviewed set before publishing`)
  if (stale) warnings.push(`${rel} has ${stale} pending item(s) with a past schedule time`)
  if (missingCredit) warnings.push(`${rel} has ${missingCredit} pending Reel caption(s) without an explicit footage credit`)
  const repeated = [...firstLines.entries()].filter(([, count]) => count > 4)
  if (repeated.length) warnings.push(`${rel} repeats ${repeated.length} opening line(s) more than four times; clip-specific copy is still needed`)
}

const unique = (items) => [...new Set(items)].sort()
const report = {
  generatedAt: new Date().toISOString(),
  copyVersion: copy.version,
  filesScanned: scanned.length,
  queueCaptionsScanned,
  approvedPhrases: Object.entries(copy)
    .filter(([key, value]) => key !== 'blocked' && Array.isArray(value))
    .reduce((sum, [, value]) => sum + value.length, 0),
  errors: unique(errors),
  warnings: unique(warnings),
}

mkdirSync(REPORT_DIR, { recursive: true })
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

if (report.errors.length) {
  console.error(`Copy gate failed with ${report.errors.length} issue(s):`)
  for (const error of report.errors) console.error(`  × ${error}`)
  console.error(`Report: ${REPORT_PATH}`)
  process.exit(1)
}

console.log(`✓ Copy gate passed: ${report.filesScanned} source files, ${report.queueCaptionsScanned} pending captions, ${report.approvedPhrases} approved phrases`)
if (report.warnings.length) console.log(`  ${report.warnings.length} non-blocking review warning(s)`)
console.log(`  ${REPORT_PATH}`)
