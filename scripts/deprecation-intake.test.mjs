import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  extractDeprecations,
  normalizeWarning,
} from './deprecation-intake.mjs';

const LOG = [
  'Build\tRun build\t2026-09-26T02:07:03.0996069Z (node:2413) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
  'Build\tRun build\t2026-09-26T02:09:03.0996069Z (node:9999) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
  'Build\tRun build\t2026-09-26T02:10:00.0000000Z ⚠ The Edge Runtime is deprecated. You can use the "nodejs" runtime instead.',
  'Build\tRun build\t2026-09-26T02:10:01.0000000Z Compiled successfully',
  'Build\tRun build\t2026-09-26T02:10:02.0000000Z \u001b[36;1m  echo "deprecated flag"\u001b[0m',
].join('\n');

test('dedupes the same warning across pids and timestamps', () => {
  const found = extractDeprecations(LOG);
  assert.equal(found.length, 2);
  assert.match(found[0].fingerprint, /^deprecation-[0-9a-f]{12}$/);
  assert.ok(found.some(w => w.text.includes('Edge Runtime is deprecated')));
});

test('ignores non-deprecation lines and echoed shell source', () => {
  const found = extractDeprecations(LOG);
  assert.ok(found.every(w => !w.text.includes('Compiled successfully')));
  assert.ok(found.every(w => !w.text.includes('echo')));
});

test('ignores git ref updates whose branch name contains deprecated', () => {
  const updates = [
    'Build\tCheckout\t2026-09-21T12:56:42.5859549Z  * [new branch]          fix/sonarcloud-s1874-deprecated-app-url-batch1 -> origin/fix/sonarcloud-s1874-deprecated-app-url-batch1',
    'Build + Layout (combined)\tUNKNOWN STEP\t2026-09-21T12:59:05.7735656Z  * [new branch] fix/sonarcloud-s1874-deprecated-app-url-batch3 -> origin/fix/sonarcloud-s1874-deprecated-app-url-batch3',
    'Build\tCheckout\t2026-09-21T13:00:00.0000000Z  t [tag update] deprecated-v1 -> deprecated-v1',
    'Build\tCheckout\t2026-09-21T13:00:01.0000000Z  + 123abc...456def fix/deprecated-ref -> origin/fix/deprecated-ref (forced update)',
  ];

  for (const update of updates) {
    assert.deepEqual(extractDeprecations(update), []);
  }
});

test('normalizes runner paths so fingerprints are stable', () => {
  assert.equal(
    normalizeWarning(
      '(node:1) warn /home/runner/work/Jovie/Jovie/x.js deprecated'
    ),
    '(node) warn <path> deprecated'
  );
});

// Skipped jobs have no log blob; the job-logs endpoint 404s on them and
// `set -e` kills the step (nightly-failure JOV-6876). Only fetch logs for
// Build jobs that actually ran.
test('workflow only fetches logs from successful Build jobs', () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  const workflow = readFileSync(
    path.join(repoRoot, '.github/workflows/deprecation-intake.yml'),
    'utf8'
  );
  assert.match(workflow, /\.conclusion == "success"/);
  // gh v2.97+ rejects raw logs containing ANSI escapes unless the caller opts
  // in; build logs are captured to a file here and parsed rather than rendered.
  assert.match(
    workflow,
    /gh api --allow-escape-sequences "repos\/\$GITHUB_REPOSITORY\/actions\/jobs\/\$job\/logs"/
  );
  // Main push runs skip the Build jobs under the merge-queue model; the
  // queue run is the real "main build".
  assert.match(workflow, /--event merge_group/);
  // GitHub's server-side status filter has returned stale successful runs in
  // production, so filter recent run conclusions in jq instead.
  assert.doesNotMatch(workflow, /--status success/);
  assert.match(workflow, /map\(select\(\.conclusion == "success"\)\)\[:10\]/);
  assert.match(
    workflow,
    /No successful merge-queue CI run with Build logs found/
  );
});
