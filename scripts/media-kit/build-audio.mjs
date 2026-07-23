#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'creative', 'exports', 'media-kit-v1', 'audio')
const RATE = 48000
mkdirSync(OUT, { recursive: true })

let randomState = 0x4c505045
function random() {
  randomState ^= randomState << 13
  randomState ^= randomState >>> 17
  randomState ^= randomState << 5
  return ((randomState >>> 0) / 0xffffffff) * 2 - 1
}
const clamp = (v) => Math.max(-1, Math.min(1, v))
const decay = (t, speed) => Math.exp(-t * speed)
const attack = (t, seconds) => Math.min(1, t / seconds)
const sine = (freq, t, phase = 0) => Math.sin(Math.PI * 2 * freq * t + phase)

function writeWav(path, seconds, synth) {
  const frames = Math.ceil(seconds * RATE)
  const samples = new Float64Array(frames * 2)
  let peak = 0
  let previousNoise = 0
  for (let i = 0; i < frames; i++) {
    const t = i / RATE
    const noise = random()
    const highNoise = noise - previousNoise * 0.88
    previousNoise = noise
    const [left, right] = synth(t, { noise, highNoise, i, seconds })
    samples[i * 2] = left
    samples[i * 2 + 1] = right
    peak = Math.max(peak, Math.abs(left), Math.abs(right))
  }
  const gain = peak > 0 ? 0.88 / peak : 1
  const dataBytes = frames * 2 * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write('WAVE', 8)
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 4, 28)
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(clamp(samples[i] * gain) * 32767), 44 + i * 2)
  writeFileSync(path, buf)
}

const cues = [
  {
    id: 'impact-slam', seconds: 0.58, use: 'Mascot entrance or title impact',
    synth: (t, { noise, highNoise }) => { const v = sine(58 - 18 * t, t) * decay(t, 8) + sine(116, t) * decay(t, 15) * .35 + highNoise * decay(t, 30) * .28; return [v, v * .96 + noise * .015] },
  },
  {
    id: 'serve-snap', seconds: 0.34, use: 'Serve contact or quick cut',
    synth: (t, { highNoise }) => { const env = decay(t, 34); const v = highNoise * env + sine(190, t) * decay(t, 18) * .42; return [v, v * .86] },
  },
  {
    id: 'block-hit', seconds: 0.46, use: 'Stuff block stamp',
    synth: (t, { noise }) => { const v = sine(82 - 22 * t, t) * decay(t, 10) + Math.sign(sine(310, t)) * decay(t, 28) * .22 + noise * decay(t, 42) * .18; return [v, v] },
  },
  {
    id: 'ref-whistle', seconds: 0.62, use: 'Round, schedule, or match start',
    synth: (t) => { const env = attack(t, .025) * Math.min(1, (0.62 - t) / .12); const freq = 2050 + sine(5.2, t) * 115; const v = (sine(freq, t) + sine(freq * 2.01, t) * .23) * env; return [v * .7, v * .66] },
  },
  {
    id: 'energy-rise', seconds: 0.92, use: 'Pre-impact rise',
    synth: (t, { highNoise }) => { const env = Math.pow(t / .92, 1.7); const v = highNoise * env * .42 + sine(120 + t * 480, t) * env * .25; return [v * (1 - t * .15), v * (.78 + t * .2)] },
  },
  {
    id: 'sizzle-tail', seconds: 0.78, use: 'Short visual tail; use sparingly',
    synth: (t, { noise, highNoise }) => { const pops = Math.max(0, sine(37, t) - .82) * noise * 1.7; const v = (highNoise * .35 + pops) * decay(t, 2.3); return [v, v * .82 + noise * .05] },
  },
  {
    id: 'camera-shutter', seconds: 0.24, use: 'Photo-of-the-day or gallery cut',
    synth: (t, { highNoise }) => { const a = highNoise * decay(Math.max(0, t - .018), 75) * (t > .018 ? 1 : 0); const b = highNoise * decay(Math.max(0, t - .105), 82) * (t > .105 ? .8 : 0); const v = a + b + sine(145, t) * decay(t, 30) * .18; return [v, v * .9] },
  },
  {
    id: 'digital-cut', seconds: 0.31, use: 'Score or bracket transition',
    synth: (t, { noise }) => { const step = Math.floor(t * 48) % 2 ? 1 : -1; const v = step * sine(330 + Math.floor(t * 12) * 55, t) * decay(t, 6) * .45 + noise * decay(t, 18) * .25; return [v, -v * .65] },
  },
  {
    id: 'bracket-lock', seconds: 0.52, use: 'Field set or bracket live',
    synth: (t, { highNoise }) => { const ping = sine(910, t) * decay(t, 13) + sine(1365, t) * decay(t, 18) * .55; const thump = sine(72, t) * decay(t, 9); const v = ping * .5 + thump + highNoise * decay(t, 45) * .12; return [v, v * .92] },
  },
  {
    id: 'sonic-logo', seconds: 1.08, use: 'End card only',
    synth: (t, { highNoise }) => { const notes = [[0, 110], [.18, 165], [.39, 220]]; let v = 0; for (const [start, freq] of notes) if (t >= start) v += sine(freq, t - start) * decay(t - start, 4.8) * .44; v += sine(55, t) * decay(t, 5) * .36 + highNoise * decay(t, 36) * .12; return [v, v * .94] },
  },
]

for (const cue of cues) {
  const path = join(OUT, `${cue.id}.wav`)
  writeWav(path, cue.seconds, cue.synth)
  console.log(`✓ ${path}`)
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  license: 'Original procedural synthesis created for Let’s Pepper; no samples or third-party recordings.',
  format: { sampleRate: RATE, channels: 2, bitDepth: 16 },
  cues: cues.map(({ id, seconds, use }) => ({ id, seconds, use, file: `${id}.wav` })),
}, null, 2)}\n`)

writeFileSync(join(OUT, 'README.md'), `# Original audio cue kit

These cues are procedurally synthesized from oscillators and deterministic noise.
No music, crowd recording, voice, or third-party sample is embedded. Keep stings
short and below commentary or live court audio; the sonic logo belongs on end cards.
`)
