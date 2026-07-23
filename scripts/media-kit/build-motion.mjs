#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const BASE = join(ROOT, 'creative', 'exports', 'media-kit-v1')
const ALPHA = join(BASE, 'capcut', 'motion', 'alpha')
const SCREEN = join(BASE, 'capcut', 'motion', 'screen')
mkdirSync(ALPHA, { recursive: true }); mkdirSync(SCREEN, { recursive: true })

const clips = [
  { id: 'brand-intro', source: 'creative/exports/media-kit-v1/capcut/bugs/brand-light.png', height: 250, y: 170, x: 54, duration: 1.05, audio: 'sonic-logo.wav' },
  { id: 'ace-stamp', source: 'creative/exports/media-kit-v1/capcut/moments/ace.png', width: 960, y: 320, x: 40, duration: .82, audio: 'serve-snap.wav' },
  { id: 'block-stamp', source: 'creative/exports/media-kit-v1/capcut/moments/stuff-block.png', width: 960, y: 320, x: 40, duration: .88, audio: 'block-hit.wav' },
  { id: 'dig-stamp', source: 'creative/exports/media-kit-v1/capcut/moments/dig.png', width: 960, y: 320, x: 40, duration: .84, audio: 'digital-cut.wav' },
  { id: 'jalapeno-entry', source: 'public/images/mascots/anime/jalapeno/menace-walk.png', height: 720, y: 940, x: 520, duration: 1.08, audio: 'impact-slam.wav' },
  { id: 'bell-block', source: 'public/images/mascots/anime/bell-pepper/block.png', height: 750, y: 875, x: 480, duration: 1.02, audio: 'block-hit.wav' },
  { id: 'poblano-dig', source: 'public/images/mascots/anime/poblano/diving-dig.png', width: 990, y: 990, x: 120, duration: 1.12, audio: 'digital-cut.wav' },
  { id: 'ghost-serve', source: 'public/images/mascots/anime/ghost-pepper/jump-serve.png', height: 800, y: 825, x: 470, duration: 1.08, audio: 'serve-snap.wav' },
  { id: 'champion-hit', source: 'public/images/mascots/anime/poblano/champion.png', height: 790, y: 850, x: 470, duration: 1.18, audio: 'bracket-lock.wav' },
  { id: 'flickday-credit', source: 'creative/exports/media-kit-v1/capcut/bugs/credit-light.png', height: 250, y: 1520, x: 54, duration: 1.25, audio: null },
]

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`ffmpeg failed:\n${result.stderr}`)
}

for (const clip of clips) {
  const source = join(ROOT, clip.source)
  if (!existsSync(source)) throw new Error(`missing motion source: ${source}`)
  const alphaOut = join(ALPHA, `${clip.id}.mov`)
  const screenOut = join(SCREEN, `${clip.id}.mp4`)
  const scale = clip.width ? `${clip.width}:-2` : `-2:${clip.height}`
  const fadeOut = Math.max(.2, clip.duration - .22).toFixed(3)
  const slide = clip.x > 400 ? 150 : -150
  const x = `${clip.x}+(${slide})*(1-min(t/.18\,1))`
  const filter = (transparent) => `[0:v]format=rgba[base];[1:v]scale=${scale},format=rgba,fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=${fadeOut}:d=0.20:alpha=1[fg];[base][fg]overlay=x='${x}':y='${clip.y}':shortest=1,format=${transparent ? 'rgba' : 'yuv420p'}[v]`

  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=black@0.0:s=1080x1920:r=30:d=${clip.duration}`,
    '-loop', '1', '-framerate', '30', '-i', source,
    '-filter_complex', filter(true), '-map', '[v]', '-t', String(clip.duration), '-an',
    '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', alphaOut,
  ])
  ffmpeg([
    '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:r=30:d=${clip.duration}`,
    '-loop', '1', '-framerate', '30', '-i', source,
    '-filter_complex', filter(false), '-map', '[v]', '-t', String(clip.duration), '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', screenOut,
  ])
  console.log(`✓ ${clip.id}  alpha + screen fallback`)
}

writeFileSync(join(BASE, 'capcut', 'motion', 'manifest.json'), `${JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  canvas: '1080x1920',
  frameRate: 30,
  alphaUse: 'Import the ProRes 4444 MOV directly.',
  screenUse: 'Import the MP4 and set CapCut blend mode to Screen.',
  clips: clips.map((clip) => ({ ...clip, alpha: `alpha/${clip.id}.mov`, screen: `screen/${clip.id}.mp4` })),
}, null, 2)}\n`)
