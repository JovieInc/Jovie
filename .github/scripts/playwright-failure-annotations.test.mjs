import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectPlaywrightFailureAnnotations,
  formatPlaywrightFailureAnnotation,
  parsePlaywrightFailures,
} from './guard-playwright-artifacts.mjs';

// Line-reporter output shape from the E2E Full Browser Matrix lane
// (`--reporter=line`). Failure blocks start with
// `  N) [project] › path:line:col › title` followed by indented error lines.
const matrixFailureLog = `Running 403 tests using 2 workers

  1) [chromium] › tests/e2e/settings-profile-pane.spec.ts:584:7 › Account keeps its full pane after Profile navigation and browser history

    Error: expect(received).toHaveAttribute(expected)

    Expected: open
    Received: closed
    Call log:
      - Expect "Page.locator('#shell-artist-profile-rail')" to have attribute data-rail-phase

  2) [firefox] › tests/e2e/settings-profile-pane.spec.ts:584:7 › Account keeps its full pane after Profile navigation and browser history

    Error: expect(received).toHaveAttribute(expected)

    Expected: open
    Received: closed

  2 skipped
  310 passed (44.5m)
  2 failed
`;

const secret = 'jovie-fixture-credential-value-9f2c';

test('parses one record per failed test with file, line, project and title', () => {
  const failures = parsePlaywrightFailures(matrixFailureLog);
  assert.equal(failures.length, 2);
  assert.equal(failures[0].project, 'chromium');
  assert.equal(failures[0].file, 'tests/e2e/settings-profile-pane.spec.ts');
  assert.equal(failures[0].line, 584);
  assert.equal(
    failures[0].title,
    'Account keeps its full pane after Profile navigation and browser history'
  );
  assert.equal(failures[1].project, 'firefox');
  assert.ok(failures[0].error.includes('Expected: open'));
  assert.ok(failures[0].error.includes('Received: closed'));
});

test('ignores flaky, passed and skipped summary lines', () => {
  const failures = parsePlaywrightFailures(
    [
      '  1 flaky',
      '  [chromium] › tests/e2e/auth.spec.ts:12:7 › keeps the front door stable',
      '  403 passed (10m)',
      '  3 skipped',
    ].join('\n')
  );
  assert.equal(failures.length, 0);
});

test('formats a GitHub annotation naming the failing spec and its first error lines', () => {
  const [failure] = parsePlaywrightFailures(matrixFailureLog);
  const annotation = formatPlaywrightFailureAnnotation(failure, {
    redact: value => value,
  });
  assert.ok(annotation.includes('::error'));
  assert.ok(annotation.includes('settings-profile-pane.spec.ts:584'));
  assert.ok(
    annotation.includes(
      'Account keeps its full pane after Profile navigation and browser history'
    )
  );
  assert.ok(annotation.includes('Expected: open'));
  // The full multi-line error must ride in ONE annotation command.
  assert.ok(!annotation.includes('\n'));
});

test('redacts credential values from annotation text before emitting', () => {
  const [failure] = parsePlaywrightFailures(
    matrixFailureLog.replace('Received: closed', `Received: token ${secret}`)
  );
  const annotation = formatPlaywrightFailureAnnotation(failure, {
    redact: value => value.replaceAll(secret, '[REDACTED_SECRET]'),
  });
  assert.ok(!annotation.includes(secret));
  assert.ok(annotation.includes('[REDACTED_SECRET]'));
});

test('caps annotations and reports the omitted count for very red shards', () => {
  const noisy = Array.from(
    { length: 30 },
    (_, index) =>
      `  ${index + 1}) [chromium] › tests/e2e/cluster.spec.ts:${100 + index}:7 › case ${index}\n\n    Error: boom ${index}\n`
  ).join('\n');
  const { annotations, total, omitted } = collectPlaywrightFailureAnnotations(
    noisy,
    { redact: value => value, limit: 20 }
  );
  assert.equal(total, 30);
  assert.equal(annotations.length, 20);
  assert.equal(omitted, 10);
  assert.ok(annotations.at(-1).includes('10 more failing'));
});

test('emits nothing for a green run', () => {
  const { annotations } = collectPlaywrightFailureAnnotations(
    '  403 passed (44.5m)\n',
    { redact: value => value }
  );
  assert.equal(annotations.length, 0);
});
