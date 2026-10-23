import { describe, expect, it } from 'vitest';
import { buildJourneyEvidence } from '../journey-evidence-builder.mjs';
import { evaluatePromotion } from '../promotion-journey-evidence.mjs';

// Every report/identity below is a synthetic fixture;
// no auth, database, Stripe, hosted job, deployment or artifact is exercised.
const NOW = new Date('2026-10-23T00:00:00.000Z');
const SHA = 'a'.repeat(40);
const range = {
  schema: 'jovie.release-range-risk/v1',
  baseDeployedSha: 'b'.repeat(40),
  candidateSha: SHA,
  unknown: false,
  affects: { auth: true, billing: true },
};

function promotionFromReport({
  file = 'tests/e2e/golden-path.spec.ts',
  status = 'expected',
  expectedStatus = 'passed',
  actualStatus = 'passed',
  testOverride = {},
  stepOutcome = 'success',
} = {}) {
  const evidence = buildJourneyEvidence({
    report: {
      stats: { startTime: '2026-10-22T23:59:00.000Z' },
      suites: [
        {
          specs: [
            {
              file,
              tests: [
                {
                  status,
                  expectedStatus,
                  results: [{ status: actualStatus }],
                  ...testOverride,
                },
              ],
            },
          ],
        },
      ],
    },
    candidateSha: SHA,
    runId: '99',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/99',
    stepOutcome,
    stripeMode: 'test',
    completedAt: NOW,
  });
  return evaluatePromotion({ range, evidence, now: NOW });
}

describe('journey report proves the canonical executed journey', () => {
  it.each([
    'tests/e2e/golden-path.spec.ts',
    '/workspace/apps/web/tests/e2e/golden-path.spec.ts',
    'C:\\workspace\\apps\\web\\tests\\e2e\\golden-path.spec.ts',
  ])('preserves a truly passing canonical report: %s', file => {
    expect(promotionFromReport({ file }).decision).toBe('pass');
  });

  it.each([
    'tests/e2e/synthetic-golden-path.spec.ts',
    'tests/e2e/responsive-golden-path.spec.ts',
    'tests/e2e/profile-fan-capture-golden-path.spec.ts',
  ])('blocks another spec whose name only shares a suffix: %s', file => {
    expect(promotionFromReport({ file }).decision).toBe('blocked');
  });

  it('blocks a canonical assertion that failed as expected (test.fail)', () => {
    expect(
      promotionFromReport({
        status: 'expected',
        expectedStatus: 'failed',
        actualStatus: 'failed',
      }).decision
    ).toBe('blocked');
  });

  it('keeps skipped canonical journeys blocked', () => {
    expect(
      promotionFromReport({
        status: 'skipped',
        expectedStatus: 'skipped',
        actualStatus: 'skipped',
      }).decision
    ).toBe('blocked');
  });

  it('keeps flaky canonical journeys blocked', () => {
    expect(promotionFromReport({ status: 'flaky' }).decision).toBe('blocked');
  });

  it.each([
    ['missing expectation', { expectedStatus: undefined }],
    ['missing results', { results: undefined }],
    ['empty results', { results: [] }],
    ['malformed results', { results: {} }],
    ['missing result status', { results: [{}] }],
    ['null result', { results: [null] }],
    ['failed execution', { results: [{ status: 'failed' }] }],
    ['timed out execution', { results: [{ status: 'timedOut' }] }],
    ['interrupted execution', { results: [{ status: 'interrupted' }] }],
    [
      'failed retry before pass',
      { results: [{ status: 'failed' }, { status: 'passed' }] },
    ],
  ])(
    'blocks incomplete or non-passing execution: %s',
    (_label, testOverride) => {
      expect(promotionFromReport({ testOverride }).decision).toBe('blocked');
    }
  );

  it('preserves a negative step outcome even when the canonical test passed', () => {
    expect(promotionFromReport({ stepOutcome: 'failure' }).decision).toBe(
      'blocked'
    );
  });
});
