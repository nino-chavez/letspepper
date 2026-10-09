/**
 * Module-resolution hook for node --test: maps the app's "@/…" import alias
 * (tsconfig paths) to src/….ts, so tests can load app modules that use it.
 * Registered by alias-register.mjs.
 */
const SRC = new URL('../../src/', import.meta.url)

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, SRC).href, context)
  return next(specifier, context)
}
