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
const evidenceHelper = fileURLToPath(
  new URL('./test-fixtures/range-scanner-evidence.sh', import.meta.url)
);
const findingFailure =
  'did not report only the expected historical Postgres fixture';

function writeScanner(directory) {
  const scanner = join(directory, 'trufflehog');
  // Model the real JSON process boundary, including --fail's finding status.
  writeFileSync(
    scanner,
    `#!/usr/bin/env bash
set -euo pipefail
repo="\${2#file://}"
base=''
flags=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since-commit) base="$2"; shift ;;
    --log-level=2|--no-update|--no-verification|--fail|--json) flags="$flags $1 " ;;
  esac
  shift
done
for required in --log-level=2 --no-update --no-verification --fail --json; do
  [[ "$flags" == *" $required "* ]] || exit 42
done
mode="$SCAN_RECEIPT_MODE"
if [[ "$mode" == wrong-base ]]; then
  base=0000000000000000000000000000000000000000
fi
if [[ "$mode" != no-receipt ]]; then
  printf '{"level":"info-2","msg":"scanning repo","base":"%s"}\\n' "$base" >&2
fi
if [[ "$mode" == diagnostic-error ]]; then
  echo '{"level":"error","msg":"cleanup failed"}' >&2
elif [[ "$mode" == aborted &&
  ( "$repo" == *skewed-merge-group || "\${SCAN_RECEIPT_DIRECT:-}" == 1 ) ]]; then
  echo '{"level":"error","msg":"encountered errors during scan"}' >&2
fi
if [[ "$mode" != empty-completion ]]; then
  echo '{"level":"info-0","msg":"finished scanning","chunks":7,"bytes":1068}' >&2
fi
commit="\${SCAN_RECEIPT_COMMIT:-$(git -C "$repo" log --all --format=%H --grep='^introduce backup fixture$')}"
[[ "$mode" != removal ]] || commit="$SCAN_RECEIPT_REMOVED"
detector=Postgres
file=settings.local.json.backup
verified=false
raw=fixture
case "$mode" in
  wrong-detector) detector=GitHubOauth2 ;;
  wrong-file) file=feature.txt ;;
  wrong-commit) commit=0000000000000000000000000000000000000000 ;;
  verified) verified=true ;;
  missing-raw) raw='' ;;
  malformed-findings) echo 'not JSON'; exit 183 ;;
  no-findings) exit 183 ;;
  clean-exit) exit 0 ;;
  runtime-error) exit 42 ;;
esac
jq -cn --arg commit "$commit" --arg detector "$detector" --arg file "$file" \\
  --arg raw "$raw" --argjson verified "$verified" \\
  '{DetectorName:$detector,Raw:$raw,Verified:$verified,SourceMetadata:{Data:{Git:{commit:$commit,file:$file}}}}'
if [[ "$mode" == extra-finding ]]; then
  echo '{"DetectorName":"Postgres","Raw":"other","Verified":false,"SourceMetadata":{"Data":{"Git":{"commit":"0000000000000000000000000000000000000000","file":"other.backup"}}}}'
fi
exit 183
`,
    { mode: 0o755 }
  );
  return scanner;
}

for (const [mode, failure] of [
  ['complete', null],
  ['wrong-base', 'did not emit a positive repository-scan receipt'],
  ['aborted', 'did not complete a nonempty older-dated merge-group scan'],
]) {
  test(`range fixture validates ${mode} scanner evidence`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'scan-receipt-test-'));
    try {
      const result = spawnSync('bash', [fixture], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TRUFFLEHOG_BIN: writeScanner(directory),
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

for (const [mode, failure] of [
  ['complete', null],
  ['removal', null],
  ['clean-exit', 'did not return finding status 183'],
  ['runtime-error', 'did not return finding status 183'],
  ['no-findings', findingFailure],
  ['malformed-findings', findingFailure],
  ['wrong-detector', findingFailure],
  ['wrong-file', findingFailure],
  ['wrong-commit', findingFailure],
  ['verified', findingFailure],
  ['missing-raw', findingFailure],
  ['extra-finding', findingFailure],
  ['no-receipt', 'did not emit a positive repository-scan receipt'],
  ['wrong-base', 'did not emit a positive repository-scan receipt'],
  ['aborted', 'did not complete a nonempty boundary scan'],
  ['diagnostic-error', 'did not complete a nonempty boundary scan'],
  ['empty-completion', 'did not complete a nonempty boundary scan'],
]) {
  test(`historical finding evidence validates ${mode}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'historical-finding-test-'));
    try {
      const result = spawnSync(
        'bash',
        [
          '-c',
          `set -euo pipefail
fail() { echo "FAIL: $*" >&2; exit 1; }
source "$1"
assert_historical_postgres_scan "$2" "$3" boundary
`,
          'historical-evidence',
          evidenceHelper,
          directory,
          join(directory, 'scan'),
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            TRUFFLEHOG_BIN: writeScanner(directory),
            BASE_SHA: '3'.repeat(40),
            INTRODUCED_SHA: '1'.repeat(40),
            REMOVED_SHA: '2'.repeat(40),
            SCAN_RECEIPT_COMMIT: '1'.repeat(40),
            SCAN_RECEIPT_REMOVED: '2'.repeat(40),
            SCAN_RECEIPT_MODE: mode,
            SCAN_RECEIPT_DIRECT: '1',
          },
          timeout: 10_000,
        }
      );
      assert.ifError(result.error);
      const output = result.stdout + result.stderr;
      assert.equal(result.status, failure ? 1 : 0, output);
      if (failure) assert.ok(output.includes(failure), output);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
