/**
 * Module-resolution hook for node --test: maps the app's "@/…" import alias
 * (tsconfig paths) to src/….ts, so tests can load app modules that use it.
 * Registered by alias-register.mjs.
 *
 * Route handlers also import siblings without an extension ('../_lib/validate')
 * and 'next/server', which Next's bundler resolves and Node does not. Both are
 * mapped here so tests can call a route's GET/POST directly.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../../src/', import.meta.url)

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, SRC).href, context)
  if (specifier === 'next/server') return next('next/server.js', context)
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    const parent = context.parentURL
    if (parent?.startsWith('file:') && fileURLToPath(parent).startsWith(fileURLToPath(SRC))) {
      const candidate = new URL(`${specifier}.ts`, parent)
      if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context)
    }
  }
  return next(specifier, context)
}
