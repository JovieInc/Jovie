import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectDiagnosticLines,
  collectPlaywrightFailureAnnotations,
  formatDiagnosticLinesAnnotation,
  formatPlaywrightFailureAnnotation,
  formatPlaywrightFailureTailAnnotation,
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

// Real CI shape (JOV-8805): the tee'd line reporter prefixes every line
// with cursor-control escapes (\x1B[1A\x1B[2K) even under CI=true, so the
// numbered failure block never matched ^\s*\d+\) — the guard fell back to
// the JSON tail and the actual error stayed invisible to remediation.
const ciEscapedFailureLog = [
  'Running 5 tests using 1 worker',
  '\u001B[1A\u001B[2K[1/2] [auth-setup] › tests/e2e/auth.setup.ts:11:8 › Auth Setup › authenticate',
  '\u001B[1A\u001B[2K  1) [chromium] › tests/e2e/claim-checkout.spec.ts:288:7 › Claim checkout dogfood › high reach: pay → pending verification → Ovie card → reject with a test refund, then approve ──',
  '',
  '    Error: Timed out waiting for the poll.',
  '',
  '    Expected: pending_verification',
  '    Received: awaiting_payment',
  '',
  '  4 passed (35.1s)',
  '  1 failed',
].join('\n');

test('parses the CI ANSI-escaped numbered failure block (JOV-8805)', () => {
  const failures = parsePlaywrightFailures(ciEscapedFailureLog);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].project, 'chromium');
  assert.equal(failures[0].file, 'tests/e2e/claim-checkout.spec.ts');
  assert.equal(failures[0].line, 288);
  assert.ok(
    failures[0].title.startsWith('Claim checkout dogfood › high reach: pay')
  );
  assert.ok(failures[0].error.includes('Expected: pending_verification'));
  const { annotations } = collectPlaywrightFailureAnnotations(
    ciEscapedFailureLog,
    { redact: value => value }
  );
  assert.equal(annotations.length, 1);
  assert.ok(annotations[0].includes('claim-checkout.spec.ts:288'));
  assert.ok(annotations[0].includes('pending_verification'));
});

test('diagnostic lines survive the CI escape prefixes', () => {
  const output = [
    '\u001B[1A\u001B[2K    at fake',
    '\u001B[1A\u001B[2K  POST /api/stripe/checkout returned 500: {"error":"boom"}',
  ].join('\n');
  assert.deepEqual(collectDiagnosticLines(output), [
    '  POST /api/stripe/checkout returned 500: {"error":"boom"}',
  ]);
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

test('formats a bounded tail annotation when no failure block is parseable', () => {
  const output = [
    'Running 2 tests using 1 worker',
    'Error: Playwright does not support chromium on ubuntu26.04-x64',
  ].join('\n');
  const annotation = formatPlaywrightFailureTailAnnotation(output);
  assert.ok(annotation);
  assert.ok(annotation.startsWith('::error title='));
  assert.ok(annotation.includes('ubuntu26.04-x64'));
  assert.ok(annotation.includes('%0A'));
});

test('tail annotation omits blank lines, caps length and redacts secrets', () => {
  const output = [
    '',
    ...Array.from({ length: 60 }, (_, index) => `line ${index}`),
    secret,
  ].join('\n');
  const annotation = formatPlaywrightFailureTailAnnotation(output, {
    redact: text => text.split(secret).join('[redacted]'),
  });
  assert.ok(annotation);
  assert.ok(!annotation.includes(secret));
  assert.ok(annotation.length <= 3000);
  assert.ok(annotation.includes('line 59'));
  assert.ok(!annotation.includes('line 0'));
});

test('tail annotation returns null for empty output', () => {
  assert.equal(formatPlaywrightFailureTailAnnotation(''), null);
  assert.equal(formatPlaywrightFailureTailAnnotation(undefined), null);
});

test('collects bounded diagnostic lines naming the surfaced failure', () => {
  const output = [
    '{"config":{"reporter":"json"},',
    '      "message":"POST /api/stripe/checkout returned 500: {\\"error\\":\\"Failed to create checkout session: stripe test clock rolled back\\"}"',
    '      "message":"POST /api/stripe/checkout returned 500: {\\"error\\":\\"Failed to create checkout session: stripe test clock rolled back\\"}"',
    '[claim-dogfood] checkout session creation failed: Error: stripe test clock rolled back',
  ].join('\n');
  const hits = collectDiagnosticLines(output);
  assert.equal(hits.length, 2);
  assert.ok(hits[0].includes('returned 500:'));
  assert.ok(hits[1].includes('[claim-dogfood]'));
});

test('caps diagnostic lines at the limit', () => {
  const output = Array.from(
    { length: 10 },
    (_, index) => `line returned 500: ${index}`
  ).join('\n');
  assert.equal(collectDiagnosticLines(output).length, 4);
});

test('diagnostic annotation is one redacted ::error with the cause inline', () => {
  const hits = [
    'POST /api/stripe/checkout returned 500: {"error":"Failed to create checkout session: boom"}',
    secret,
  ];
  const annotation = formatDiagnosticLinesAnnotation(hits, {
    redact: text => text.split(secret).join('[redacted]'),
  });
  assert.ok(
    annotation.startsWith('::error title=E2E checkout failure diagnostics ::')
  );
  assert.ok(annotation.includes('Failed to create checkout session: boom'));
  assert.ok(!annotation.includes(secret));
});

test('diagnostic annotation returns null when nothing matched', () => {
  assert.equal(formatDiagnosticLinesAnnotation([]), null);
  assert.equal(collectDiagnosticLines('no matches here').length, 0);
});
