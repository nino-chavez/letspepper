#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MEDIA = join(ROOT, 'creative', 'exports', 'media-kit-v1')
const quizIds = ['bell', 'poblano', 'jalapeno', 'habanero', 'reaper', 'pepper-x']
const ogIds = ['standings', 'rankings', 'gallery', 'quiz', 'awards']
const QUIZ_OUT = join(ROOT, 'public', 'images', 'share', 'quiz')
const OG_OUT = join(ROOT, 'public', 'images', 'og', 'creative')
mkdirSync(QUIZ_OUT, { recursive: true }); mkdirSync(OG_OUT, { recursive: true })

function convert(source, output, args) {
  if (!existsSync(source)) throw new Error(`missing derivative source: ${source}`)
  const result = spawnSync('magick', [source, ...args, output], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`ImageMagick failed:\n${result.stderr}`)
  console.log(`✓ ${output}`)
}

for (const id of quizIds) {
  convert(join(MEDIA, 'share', 'quiz-results', `${id}.png`), join(QUIZ_OUT, `${id}.webp`), ['-strip', '-quality', '88'])
}
for (const id of ogIds) {
  convert(join(MEDIA, 'web', 'og', `${id}.png`), join(OG_OUT, `${id}.jpg`), ['-strip', '-quality', '90'])
}
