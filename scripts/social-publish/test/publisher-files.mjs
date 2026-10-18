/**
 * What a test sandbox copies to run post-reels.mjs or post-now.mjs from a throwaway root: the
 * publisher's import closure, plus the copy audit it shells out to (tools/lib). One list, imported
 * by every sandbox, so a new import is added here once. Before this file each test kept its own
 * copy, and on 2026-10-18 release-contract.mjs landed in post-reels.mjs with six hold-gate tests
 * failing on ERR_MODULE_NOT_FOUND because that test's list had not heard of it.
 */
export const PUBLISHER_FILES = [
  'post-reels.mjs', 'post-now.mjs',
  'route-gate.mjs', 'route-shape.mjs', 'release-contract.mjs', 'reel-audio.mjs',
  'review-package.mjs', 'review-package-shape.mjs', 'review-package-worker.mjs',
  'hold-shape.mjs', 'collab-shape.mjs', 'tag-params.mjs', 'carousel-container-params.mjs',
  'queue-dir.mjs', 'queue-store.mjs', 'vary-captions.mjs',
  'accounts.json',
]
export const TOOL_LIB_FILES = ['encounter-audit.mjs', 'invoked-directly.mjs', 'copy-segments.mjs']
