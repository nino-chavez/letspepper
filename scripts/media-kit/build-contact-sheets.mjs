#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = join(ROOT, 'creative', 'exports', 'media-kit-v1')
const OUT = join(BASE, 'contact-sheets')
mkdirSync(OUT, { recursive: true })

function pngs(dir, recursive = false) {
  if (!existsSync(dir)) return []
  const result = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name)
    if (name.isDirectory() && recursive) result.push(...pngs(path, true))
    else if (name.isFile() && extname(name.name).toLowerCase() === '.png') result.push(path)
  }
  return result.sort()
}

const groups = [
  { id: 'capcut-static', files: pngs(join(BASE, 'capcut'), true), tile: '5x', size: '230x410' },
  { id: 'poblano-event', files: pngs(join(BASE, 'event', 'poblano'), true), tile: '5x', size: '220x390' },
  { id: 'fan-share', files: pngs(join(BASE, 'share'), true), tile: '5x', size: '220x390' },
  { id: 'web-and-highlights', files: [...pngs(join(BASE, 'web'), true), ...pngs(join(BASE, 'social'), true)], tile: '5x', size: '230x230' },
]

for (const group of groups) {
  if (!group.files.length) continue
  const out = join(OUT, `${group.id}.jpg`)
  const args = ['montage', ...group.files, '-thumbnail', `${group.size}>`, '-tile', group.tile, '-geometry', '+18+18', '-background', '#111111', '-quality', '90', out]
  const run = spawnSync('magick', args, { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`contact sheet failed for ${group.id}:\n${run.stderr}`)
  console.log(`✓ ${out}`)
}

const mascotFiles = [
  'jalapeno/menace-walk.png', 'bell-pepper/menace-walk.png', 'poblano/menace-walk.png', 'ghost-pepper/menace-walk.png',
  'habanero/anchor.png', 'reaper/anchor.png', 'pepper-x/anchor.png', 'chipotle/anchor.png',
  'pepper-belle/anchor.png', 'pepperoncini/anchor.png', 'banana-pepper/anchor.png', 'shishito/anchor.png',
].map((path) => join(ROOT, 'public', 'images', 'mascots', 'anime', path)).filter(existsSync)

if (mascotFiles.length) {
  const out = join(OUT, 'mascot-roster.png')
  const run = spawnSync('magick', ['montage', ...mascotFiles, '-thumbnail', '320x420>', '-tile', '4x', '-geometry', '+28+28', '-background', '#111111', out], { encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`mascot contact sheet failed:\n${run.stderr}`)
  console.log(`✓ ${out}`)
}
