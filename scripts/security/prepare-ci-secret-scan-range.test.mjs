import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(
  new URL('./prepare-ci-secret-scan-range.test.sh', import.meta.url)
);

for (const [mode, failure] of [
  ['complete', null],
  ['wrong-base', 'did not emit a positive repository-scan receipt'],
  ['aborted', 'did not complete a nonempty older-dated merge-group scan'],
]) {
  test(`range fixture validates ${mode} scanner evidence`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'scan-receipt-test-'));
    try {
      const scanner = join(directory, 'trufflehog');
      // Model 3.99.4's log-level contract at the scanner process boundary.
      // The shell fixture must reject a wrong base or a traversal abort even
      // when the scanner exits zero and emits a nonempty completion line.
      writeFileSync(
        scanner,
        `#!/usr/bin/env bash
set -euo pipefail
verbose=false
base=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log-level=2) verbose=true ;;
    --since-commit) base="$2"; shift ;;
  esac
  shift
done
if [[ "$verbose" == true ]]; then
  if [[ "$SCAN_RECEIPT_MODE" == wrong-base ]]; then
    base=0000000000000000000000000000000000000000
  fi
  printf 'info-2 trufflehog scanning repo {"base":"%s"}\\n' "$base"
  if [[ "$SCAN_RECEIPT_MODE" == aborted ]]; then
    echo 'error trufflehog encountered errors during scan'
  fi
fi
echo 'info-0 trufflehog finished scanning {"chunks":7,"bytes":1068}'
`,
        { mode: 0o755 }
      );
      const result = spawnSync('bash', [fixture], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRUFFLEHOG_BIN: scanner,
          SCAN_RECEIPT_MODE: mode,
        },
        timeout: 90_000,
      });
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      if (failure) {
        assert.equal(result.status, 1, output);
        assert.ok(output.includes(failure), output);
      } else {
        assert.equal(result.status, 0, output);
        assert.match(
          output,
          /PASS: exact CI secret-scan range regression tests/
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
