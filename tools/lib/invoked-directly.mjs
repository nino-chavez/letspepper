// invoked-directly.mjs — the one entry-point guard for Blueprint's scripts.
//
// A file that is both imported (by the CLI, another lib, a test) and run on its
// own needs to know which happened, so its CLI or self-test block runs only when
// node was pointed at it. The obvious test compares two spellings of one path as
// strings: `import.meta.url === \`file://${process.argv[1]}\``. Node resolves the
// entry module through symlinks, so on macOS import.meta.url reads
// /private/var/... while argv[1] keeps /var/...; and the URL percent-encodes a
// space that argv[1] keeps as a space. Either way the guard is false, the block
// never runs, and the process exits 0 having done nothing — which a gate counts
// as a pass. Measured 2026-09-25: from a checkout path containing a space, five
// `test:core` steps exited 0 with no output; invoked by an absolute path through
// a symlink, seven did.
//
// So compare real paths. Four hand-rolled variants of this guard had drifted
// apart across template/ before it lived here; import this one instead of
// writing a fifth.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Pass the caller's import.meta.url. Returns false when there is no script path
// (node -e, a REPL) or either path cannot be resolved.
export function invokedDirectly(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

async function selftest() {
  const { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  let assertions = 0;
  const ok = (condition, label) => {
    assertions++;
    if (!condition) {
      console.error(`FAIL: ${label}`);
      process.exit(1);
    }
  };

  // The probe prints what the old string guard and this helper each decided.
  const tmp = mkdtempSync(join(tmpdir(), 'invoked-directly-'));
  try {
    const dir = join(tmp, 'dir with space');
    mkdirSync(dir);
    writeFileSync(join(dir, 'probe.mjs'), [
      `import { invokedDirectly } from ${JSON.stringify(import.meta.url)};`,
      'const old = import.meta.url === `file://${process.argv[1]}`;',
      'console.log(`old=${old} new=${invokedDirectly(import.meta.url)}`);',
      '',
    ].join('\n'));
    writeFileSync(join(dir, 'importer.mjs'), "import './probe.mjs';\n");
    symlinkSync(dir, join(tmp, 'link'), 'dir');

    const run = (script) => {
      const r = spawnSync(process.execPath, [script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
      return (r.stdout || '').trim() || `exit ${r.status}: ${(r.stderr || '').trim()}`;
    };

    // Each fixture must first reproduce the old failure, or it proves nothing.
    const spaced = run(join(dir, 'probe.mjs'));
    ok(spaced.startsWith('old=false'), `a path with a space defeats the string guard (got "${spaced}")`);
    ok(spaced.endsWith('new=true'), `a path with a space → invoked directly (got "${spaced}")`);

    const linked = run(join(tmp, 'link', 'probe.mjs'));
    ok(linked.startsWith('old=false'), `an absolute path through a symlink defeats the string guard (got "${linked}")`);
    ok(linked.endsWith('new=true'), `an absolute path through a symlink → invoked directly (got "${linked}")`);

    // The other direction: an imported module must not run its direct block.
    const imported = run(join(dir, 'importer.mjs'));
    ok(imported.endsWith('new=false'), `imported by another script → not invoked directly (got "${imported}")`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`invoked-directly self-test: PASS (${assertions} assertions)`);
}

if (invokedDirectly(import.meta.url) && process.argv.includes('--self-test')) {
  await selftest();
}
