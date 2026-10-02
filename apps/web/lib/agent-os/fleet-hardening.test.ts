import { describe, expect, it } from 'vitest';
import {
  buildFleetInvocation,
  computeFleetHardeningMetrics,
  type FleetInvocationInput,
} from './fleet-hardening';

const STARTED = '2026-10-01T10:00:00.000Z';

function invocation(
  overrides: Partial<FleetInvocationInput> = {},
  completedAt = '2026-10-01T10:00:00.200Z'
) {
  return buildFleetInvocation(
    {
      caller: {
        id: 'codex',
        model: 'gpt-5',
        runtime: 'codex-cli',
        host: 'linux-x64',
      },
      capability: {
        id: '@jovie/cli',
        version: '26.10.0',
        revision: 'a'.repeat(40),
      },
      command: {
        surface: 'artist.get',
        redactedArgv: ['jovie', 'artist', 'get', 'tim', '--json'],
      },
      intendedTask: 'read Tim’s public profile',
      expectedResult: 'the canonical Tim profile',
      actualResult: 'the canonical Tim profile',
      executionStatus: 'completed',
      exitCode: 0,
      attempt: 1,
      workaroundUsed: false,
      bypassUsed: false,
      canonicalComparison: {
        status: 'matched',
        sourceRef: 'https://jov.ie/tim',
        discrepancy: null,
      },
      defectFingerprint: null,
      repair: null,
      ...overrides,
    },
    STARTED,
    completedAt
  );
}

describe('fleet invocation evidence', () => {
  it('rejects raw secrets and recertification without a regression test', () => {
    expect(() =>
      invocation({
        command: {
          surface: 'artist.get',
          redactedArgv: ['jovie', '--token', 'secret'],
        },
      })
    ).toThrow(/unredacted secret/);
    expect(() =>
      invocation({
        repair: {
          linearIssueId: 'JOV-6919',
          detectedAt: STARTED,
          repairedAt: '2026-10-01T10:00:01.000Z',
          recertifiedAt: '2026-10-01T10:00:02.000Z',
          regressionTestRef: null,
        },
      })
    ).toThrow(/permanent regression proof/);
  });
});

describe('computeFleetHardeningMetrics', () => {
  it('projects success, friction, repair, latency, and fleet coverage', () => {
    const retry = invocation(
      {
        attempt: 2,
        workaroundUsed: true,
        defectFingerprint: 'b'.repeat(64),
        repair: {
          linearIssueId: 'JOV-6919',
          detectedAt: STARTED,
          repairedAt: '2026-10-01T10:00:05.000Z',
          recertifiedAt: '2026-10-01T10:00:10.000Z',
          regressionTestRef: 'apps/web/app/api/agents/profiles/route.test.ts',
        },
      },
      '2026-10-01T10:00:00.300Z'
    );
    const failure = invocation(
      {
        caller: {
          id: 'cursor',
          model: 'composer',
          runtime: 'cursor-agent',
          host: 'darwin-arm64',
        },
        executionStatus: 'failed',
        exitCode: 1,
        bypassUsed: true,
        defectFingerprint: 'c'.repeat(64),
      },
      '2026-10-01T10:00:00.100Z'
    );
    const result = computeFleetHardeningMetrics([
      { outcome: 'passed', invocation: invocation() },
      { outcome: 'passed', invocation: retry },
      { outcome: 'failed', invocation: failure },
      { outcome: 'passed', invocation: null },
    ]);

    expect(result.totalInvocations).toBe(3);
    expect(result.successRate.value).toBeCloseTo(2 / 3);
    expect(result.firstAttemptSuccessRate.value).toBeCloseTo(1 / 3);
    expect(result.workaroundBypassRate.value).toBeCloseTo(2 / 3);
    expect(result.retryRate.value).toBeCloseTo(1 / 3);
    expect(result.defectRatePer100.value).toBe(66.7);
    expect(result.latencyMs).toEqual({ p50: 200, p95: 300, sampleSize: 3 });
    expect(result.meanDefectToRecertificationMs).toEqual({
      value: 10_000,
      sampleSize: 1,
    });
    expect(result.regressionsPromoted).toBe(1);
    expect(result.coverage.callers).toEqual({ codex: 2, cursor: 1 });
    expect(result.coverage.commandSurfaces).toEqual({ 'artist.get': 3 });
  });
});
