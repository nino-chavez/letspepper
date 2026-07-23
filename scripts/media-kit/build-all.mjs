#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const steps = ['lint-copy.mjs', 'render-media-kit.mjs', 'build-public-derivatives.mjs', 'build-audio.mjs', 'build-luts.mjs', 'build-motion.mjs', 'build-contact-sheets.mjs', 'preflight.mjs']
for (const script of steps) {
  console.log(`\n── ${script} ──`)
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'media-kit', script)], { cwd: ROOT, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
