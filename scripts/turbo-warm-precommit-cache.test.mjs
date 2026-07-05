import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsDir, '..');
const warmScript = path.join(scriptsDir, 'turbo-warm-precommit-cache.mjs');

function runWarmScript(stagedFiles, options = {}) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'jovie-turbo-warm-test-'));
  const binDir = path.join(tmp, 'bin');

  try {
    mkdirSync(binDir, { recursive: true });
    if (options.installGit !== false) {
      writeFileSync(
        path.join(binDir, 'git'),
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' ${stagedFiles.map(file => JSON.stringify(file)).join(' ')}
`,
        { mode: 0o755 }
      );
    }

    return spawnSync(process.execPath, [warmScript], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        JOVIE_TURBO_WARM_PRECOMMIT_DRY_RUN: '1',
        PATH:
          options.installGit === false
            ? binDir
            : `${binDir}:${process.env.PATH ?? ''}`,
      },
    });
  } finally {
    rmSync(tmp, { force: true, recursive: true });
  }
}

test('turbo pre-commit warmer skips commits without staged web TypeScript', () => {
  const result = runWarmScript(['README.md', 'apps/web/app/styles.css']);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /skipped; no staged apps\/web TypeScript files/);
  assert.doesNotMatch(output, /dry run: node scripts\/turbo-local\.mjs/);
});

test('turbo pre-commit warmer targets web typecheck for staged web TypeScript', () => {
  const result = runWarmScript(['apps/web/app/page.tsx']);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /warming @jovie\/web typecheck cache/);
  assert.match(
    output,
    /dry run: node scripts\/turbo-local\.mjs typecheck --filter=@jovie\/web/
  );
});

test('turbo pre-commit warmer skips gracefully when git cannot spawn', () => {
  const result = runWarmScript([], { installGit: false });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /could not inspect staged files/);
  assert.match(output, /spawn(?:Sync)? git ENOENT|unknown git diff failure/);
});
