import { describe, expect, it } from 'vitest';
import {
  END,
  expectedExposure,
  exposureEvidence,
  START,
} from '../../../../packages/release-channel-contracts/test-fixtures/dogfood-exposure';
import {
  buildDogfoodReceipt,
  dogfoodReceiptFromCommandRun,
  dogfoodReceiptFromPlaywrightReport,
  evaluateDogfoodReliability,
  validateDogfoodReceipt,
} from './dogfood-receipt';

const expected = expectedExposure();
const context = {
  subjectId: 'jov:scoped-capability',
  product: 'jov' as const,
  missionId: expected.identity.missionId,
  actor: expected.identity.actorRef,
  environment: 'production',
  deploymentId: expected.artifact.buildId,
  commitSha: expected.artifact.sourceSha,
  flagCohort: 'early_access',
  expectedExposure: expected,
};
const report = {
  stats: { expected: 1, startTime: START, duration: 1000 },
  exposure: exposureEvidence(),
};

describe('exposure-scoped dogfood receipts', () => {
  it('binds executed observations to the existing receipt and reliability evaluator', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, report);
    expect(receipt.outcome).toBe('passed');
    expect(receipt.exposure?.observations).toHaveLength(2);
    expect(
      evaluateDogfoodReliability([receipt, receipt, receipt], context, [
        { id: context.missionId, expectedExposure: expected },
      ]).machineCertifiable
    ).toBe(true);
  });
  it('cannot count legacy green runs toward an exposure-scoped mission', () => {
    const { expectedExposure: _expected, ...legacyContext } = context;
    const receipt = dogfoodReceiptFromPlaywrightReport(legacyContext, {
      stats: report.stats,
    });
    expect(receipt.outcome).toBe('passed');
    expect(
      evaluateDogfoodReliability([receipt, receipt, receipt], context, [
        { id: context.missionId, expectedExposure: expected },
      ]).machineCertifiable
    ).toBe(false);
  });
  it('downgrades a green legacy-screen run with no exposure proof', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, {
      stats: report.stats,
    });
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toContain('UNKNOWN_CONFIGURATION');
  });
  it('uses owner expectations rather than accepting a report that relabels its legacy variant', () => {
    const wrong = {
      ...expected,
      features: [{ ...expected.features[0], value: 'legacy' }],
    };
    const evidence = exposureEvidence(wrong);
    const receipt = dogfoodReceiptFromPlaywrightReport(context, {
      ...report,
      exposure: evidence,
    });
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toContain('BLOCKED_EXPOSURE');
  });
  it('prevents one mode from certifying the other and rejects forged pass outcomes', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, report);
    const control = {
      ...expected,
      identity: { ...expected.identity, mode: 'customer_control' as const },
    };
    expect(
      evaluateDogfoodReliability([receipt, receipt, receipt], context, [
        { id: context.missionId, expectedExposure: control },
      ]).machineCertifiable
    ).toBe(false);
    expect(
      validateDogfoodReceipt({
        ...receipt,
        exposure: { ...receipt.exposure, invalidated: true },
      })
    ).toContain('exposure: UNKNOWN_CONFIGURATION');
  });
  it('rejects evidence copied from another actor, mission or artifact', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, report);
    for (const change of [
      { actor: 'other' },
      { missionId: 'other' },
      { deploymentId: 'other' },
    ]) {
      const rebound = buildDogfoodReceipt({
        ...receipt,
        ...change,
        startedAt: START,
        completedAt: END,
      });
      expect(rebound.outcome).toBe('blocked');
    }
  });
  it('keeps a recent exposure blocker in the reliability window', () => {
    const receipt = dogfoodReceiptFromPlaywrightReport(context, report);
    const blocked = {
      ...receipt,
      outcome: 'blocked' as const,
      completedAt: '2026-10-15T08:00:02.000Z',
      exposure: undefined,
    };
    expect(
      evaluateDogfoodReliability(
        [receipt, receipt, receipt, blocked],
        context,
        [{ id: context.missionId, expectedExposure: expected }]
      ).machineCertifiable
    ).toBe(false);
  });
  it('records exposure blocking separately from a successful command execution', () => {
    const receipt = dogfoodReceiptFromCommandRun(context, 'cli', {
      startedAt: START,
      completedAt: END,
      invocation: {
        caller: {
          id: 'synthetic-one',
          model: 'test',
          runtime: 'cli',
          host: 'linux',
        },
        capability: {
          id: '@jovie/cli',
          version: 'test',
          revision: context.commitSha,
        },
        command: {
          surface: 'artist.get',
          redactedArgv: ['jovie', 'artist', 'get', 'synthetic'],
        },
        intendedTask: 'read synthetic profile',
        expectedResult: 'synthetic profile',
        actualResult: 'synthetic profile',
        executionStatus: 'completed',
        exitCode: 0,
        attempt: 1,
        workaroundUsed: false,
        bypassUsed: false,
        canonicalComparison: {
          status: 'matched',
          sourceRef: 'synthetic-profile',
          discrepancy: null,
        },
        defectFingerprint: null,
        repair: null,
      },
    });
    expect(receipt.outcome).toBe('blocked');
    expect(receipt.blocker).toContain('UNKNOWN_CONFIGURATION');
    expect(validateDogfoodReceipt(receipt)).toEqual([]);
  });
});
