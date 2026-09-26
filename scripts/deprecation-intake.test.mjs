import assert from 'node:assert/strict';
import { test } from 'node:test';
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

test('normalizes runner paths so fingerprints are stable', () => {
  assert.equal(
    normalizeWarning(
      '(node:1) warn /home/runner/work/Jovie/Jovie/x.js deprecated'
    ),
    '(node) warn <path> deprecated'
  );
});
