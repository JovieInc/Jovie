import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import MatrixOutcomesReporter from '../../apps/web/tests/e2e/reporters/matrix-outcomes.mjs';
import parsers from './flakiness-report-parsers.js';
import { artifactContainsSecret } from './guard-playwright-artifacts.mjs';

test('matrix report preserves retries and failures without runtime diagnostics', t => {
  const directory = mkdtempSync(join(tmpdir(), 'matrix-outcomes-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const outputFile = join(directory, 'test-results', 'results.json');
  const reporter = new MatrixOutcomesReporter({ outputFile });
  const secret = 'synthetic-credential-value';
  const tests = ['flaky', 'unexpected', 'expected', 'skipped'].map(outcome => ({
    location: { file: join(directory, 'profile.spec.ts') },
    parent: { project: () => ({ name: 'chromium' }) },
    titlePath: () => ['', 'chromium', 'profile.spec.ts', 'profile', outcome],
    outcome: () => outcome,
    results: [
      {
        status:
          outcome === 'skipped'
            ? 'skipped'
            : outcome === 'expected'
              ? 'passed'
              : 'failed',
        retry: 0,
        stdout: [secret],
        error: { message: secret },
        attachments: [{ body: Buffer.from(secret) }],
      },
      ...(outcome === 'flaky' ? [{ status: 'passed', retry: 1 }] : []),
    ],
  }));

  reporter.onBegin(
    { rootDir: directory, metadata: { secret } },
    { allTests: () => tests }
  );
  reporter.onEnd();

  const text = readFileSync(outputFile, 'utf8');
  assert.equal(artifactContainsSecret(text, { SESSION_SECRET: secret }), false);
  const report = JSON.parse(text);
  assert.deepEqual(report.stats, {
    expected: 1,
    skipped: 1,
    unexpected: 1,
    flaky: 1,
  });
  assert.deepEqual(report.suites[0].specs[0].tests[0].results, [
    { status: 'failed', retry: 0 },
    { status: 'passed', retry: 1 },
  ]);
  assert.deepEqual(
    parsers
      .parsePlaywrightJsonReport(report)
      .map(({ kind, testId }) => [kind, testId]),
    [
      ['flaky-retry', 'profile.spec.ts::[chromium] profile › flaky'],
      ['failure', 'profile.spec.ts::[chromium] profile › unexpected'],
    ]
  );
});
