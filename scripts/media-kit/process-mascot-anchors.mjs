#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REMOVE = '/Users/nino/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py'
const SOURCE = join(ROOT, 'creative', 'mascots', 'sources')
const PUBLIC = join(ROOT, 'public', 'images', 'mascots', 'anime')
const WEB = join(PUBLIC, 'web')
const QC = join(ROOT, 'creative', 'exports', 'media-kit-v1', 'reports', 'mascot-qc')
mkdirSync(WEB, { recursive: true }); mkdirSync(QC, { recursive: true })

const characters = [
  { id: 'habanero', chroma: '#00ff00' },
  { id: 'reaper', chroma: '#00ff00' },
  { id: 'pepper-x', chroma: '#ff00ff' },
  { id: 'chipotle', chroma: '#00ff00' },
  { id: 'pepper-belle', chroma: '#00ff00' },
  { id: 'pepperoncini', chroma: '#ff00ff' },
  { id: 'banana-pepper', chroma: '#ff00ff' },
  { id: 'shishito', chroma: '#ff00ff' },
]

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

for (const character of characters) {
  const source = join(SOURCE, `${character.id}-chroma.png`)
  const dir = join(PUBLIC, character.id)
  const out = join(dir, 'anchor.png')
  if (!existsSync(source)) throw new Error(`missing generated source: ${source}`)
  mkdirSync(dir, { recursive: true })
  const log = run('python3', [REMOVE,
    '--input', source, '--out', out, '--key-color', character.chroma,
    '--auto-key', 'corners', '--soft-matte', '--transparent-threshold', '12',
    '--opaque-threshold', '96', '--edge-contract', '1', '--edge-feather', '0.35',
    '--spill-cleanup', '--force',
  ])
  run('magick', [out, '-resize', '1024x1024>', '-define', 'webp:lossless=true', join(WEB, `${character.id}-anchor-1024.webp`)])
  run('magick', [out, '-resize', '256x256>', '-define', 'webp:lossless=true', join(WEB, `${character.id}-anchor-256.webp`)])
  for (const [mode, color] of [['dark', '#080808'], ['light', '#f4f1e8']]) {
    run('magick', ['-size', '1024x1536', `xc:${color}`, out, '-gravity', 'center', '-compose', 'over', '-composite', '-resize', '512x768', '-quality', '90', join(QC, `${character.id}-on-${mode}.jpg`)])
  }
  console.log(`✓ ${character.id}/anchor.png`)
  console.log(`  ${log.split('\n').slice(1).join(' · ')}`)
}
