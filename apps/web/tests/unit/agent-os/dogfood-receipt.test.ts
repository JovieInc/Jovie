import { describe, expect, it } from 'vitest';
import {
  buildDogfoodReceipt,
  DOGFOOD_RECEIPT_NO_RETENTION,
  type DogfoodCommandRun,
  type DogfoodDriver,
  type DogfoodMissionContext,
  type DogfoodReceipt,
  dogfoodReceiptFromCommandRun,
  dogfoodReceiptFromIosReport,
  dogfoodReceiptFromPlaywrightReport,
  evaluateDogfoodReliability,
  isDogfoodReceipt,
  JOVIE_DOGFOOD_RECEIPT_SCHEMA,
  validateDogfoodReceipt,
} from '@/lib/agent-os/dogfood-receipt';

const COMMIT_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const DEPLOYMENT_ID = 'dpl_test123';
const STARTED = '2026-09-27T10:00:00.000Z';
const COMPLETED = '2026-09-27T10:01:00.000Z';

const CONTEXT: DogfoodMissionContext = {
  actor: 'summer',
  commitSha: COMMIT_SHA,
  deploymentId: DEPLOYMENT_ID,
  environment: 'production',
  flagCohort: 'dogfood',
  missionId: 'claim-smart-link',
  product: 'jov',
  subjectId: 'jov:smart-link',
};

function receipt(overrides: Partial<DogfoodReceipt> = {}): DogfoodReceipt {
  return buildDogfoodReceipt({
    actor: 'summer',
    commitSha: COMMIT_SHA,
    completedAt: COMPLETED,
    deploymentId: DEPLOYMENT_ID,
    driver: 'playwright',
    environment: 'production',
    flagCohort: 'dogfood',
    kind: 'ui_agent',
    missionId: 'claim-smart-link',
    outcome: 'passed',
    product: 'jov',
    startedAt: STARTED,
    subjectId: 'jov:smart-link',
    ...overrides,
  });
}

describe('buildDogfoodReceipt', () => {
  it('emits the v1 schema with a no-retention privacy default', () => {
    const result = receipt();
    expect(result.schema).toBe(JOVIE_DOGFOOD_RECEIPT_SCHEMA);
    expect(result.privacy).toEqual(DOGFOOD_RECEIPT_NO_RETENTION);
    expect(result.blocker).toBeNull();
    expect(isDogfoodReceipt(result)).toBe(true);
  });

  it('rejects receipts without an exact 40-hex commitSha', () => {
    expect(() => receipt({ commitSha: 'abc123' })).toThrow(/commitSha/);
  });

  it('rejects receipts missing deploymentId', () => {
    expect(validateDogfoodReceipt(receipt({ deploymentId: 'x' }))).toEqual([]);
    const invalid = { ...receipt(), deploymentId: '' };
    expect(validateDogfoodReceipt(invalid)).toContain(
      'deploymentId is required'
    );
  });
});

describe('dogfoodReceiptFromPlaywrightReport', () => {
  it('maps a green Playwright run to a passed ui_agent receipt', () => {
    const result = dogfoodReceiptFromPlaywrightReport(CONTEXT, {
      stats: {
        duration: 60_000,
        expected: 4,
        flaky: 1,
        startTime: STARTED,
        unexpected: 0,
      },
    });
    expect(result.kind).toBe('ui_agent');
    expect(result.driver).toBe('playwright');
    expect(result.outcome).toBe('passed');
    expect(result.startedAt).toBe(STARTED);
    expect(result.completedAt).toBe(COMPLETED);
  });

  it('maps unexpected failures to a failed receipt with a blocker', () => {
    const result = dogfoodReceiptFromPlaywrightReport(CONTEXT, {
      stats: { expected: 2, startTime: STARTED, unexpected: 1 },
    });
    expect(result.outcome).toBe('failed');
    expect(result.blocker).toContain('1 unexpected');
  });

  it('maps an empty run to blocked', () => {
    const result = dogfoodReceiptFromPlaywrightReport(CONTEXT, {
      stats: { expected: 0, unexpected: 0 },
    });
    expect(result.outcome).toBe('blocked');
  });

  it('blocks skipped-only runs from certifying a required mission', () => {
    const runs = Array.from({ length: 3 }, (_, index) =>
      dogfoodReceiptFromPlaywrightReport(
        CONTEXT,
        { stats: { expected: 0, flaky: 0, skipped: 4, unexpected: 0 } },
        {
          completedAt: `2026-09-27T10:0${index + 1}:00.000Z`,
          startedAt: STARTED,
        }
      )
    );

    expect(runs.map(run => run.outcome)).toEqual([
      'blocked',
      'blocked',
      'blocked',
    ]);
    expect(runs[0]?.blocker).toBe('playwright mission ran no tests');
    const evaluation = evaluateDogfoodReliability(
      runs,
      { commitSha: COMMIT_SHA, deploymentId: DEPLOYMENT_ID },
      [CONTEXT.missionId]
    );
    expect(evaluation.machineCertifiable).toBe(false);
    expect(evaluation.missions[0]?.status).toBe('unmet');
    expect(evaluation.missions[0]?.reliableAgents).toEqual([]);
  });

  it.each([
    { expected: 1, flaky: 0, unexpected: 0, outcome: 'passed' },
    { expected: 0, flaky: 1, unexpected: 0, outcome: 'passed' },
    { expected: 0, flaky: 0, unexpected: 1, outcome: 'failed' },
  ])('preserves $outcome for executed tests alongside skips', stats => {
    const result = dogfoodReceiptFromPlaywrightReport(CONTEXT, {
      stats: { ...stats, skipped: 4 },
    });
    expect(result.outcome).toBe(stats.outcome);
    expect(result.blocker).toBe(
      stats.unexpected > 0 ? '1 unexpected playwright failure(s)' : null
    );
  });
});

describe('dogfoodReceiptFromCommandRun', () => {
  const run = (exitCode: number | null = 0): DogfoodCommandRun => ({
    completedAt: COMPLETED,
    invocation: {
      caller: { id: 'codex', model: 'gpt-5', runtime: 'cli', host: 'linux' },
      capability: {
        id: '@jovie/cli',
        version: '26.10.0',
        revision: COMMIT_SHA,
      },
      command: {
        surface: 'artist.get',
        redactedArgv: ['jovie', 'artist', 'get', 'tim'],
      },
      intendedTask: 'read Tim’s profile',
      expectedResult: 'canonical Tim profile',
      actualResult: exitCode === 0 ? 'canonical Tim profile' : 'request failed',
      executionStatus: exitCode === 0 ? 'completed' : 'failed',
      exitCode,
      attempt: 1,
      workaroundUsed: false,
      bypassUsed: false,
      canonicalComparison: {
        status: 'matched',
        sourceRef: 'jov.ie/tim',
        discrepancy: null,
      },
      defectFingerprint: exitCode === 0 ? null : 'f'.repeat(64),
      repair: null,
    },
    startedAt: STARTED,
  });

  it('maps a successful read-only CLI call to agent_on_behalf', () => {
    const result = dogfoodReceiptFromCommandRun(CONTEXT, 'cli', run());
    expect(result.kind).toBe('agent_on_behalf');
    expect(result.driver).toBe('cli');
    expect(result.outcome).toBe('passed');
    expect(result.invocation?.latencyMs).toBe(60_000);
  });

  it('maps a nonzero exit to failed and a missing exit to blocked', () => {
    expect(dogfoodReceiptFromCommandRun(CONTEXT, 'mcp', run(2)).outcome).toBe(
      'failed'
    );
    const blocked = dogfoodReceiptFromCommandRun(CONTEXT, 'mcp', run(null));
    expect(blocked.outcome).toBe('blocked');
    expect(blocked.blocker).toContain('jovie artist get tim');
  });
});

describe('dogfoodReceiptFromIosReport', () => {
  const report = {
    artifacts: { report: 'report.json', screenshots_dir: 'screenshots' },
    issues: [],
    run: { finished_at: COMPLETED, started_at: STARTED },
    schema: 'jovie-ios-dogfood/v1',
    verdict: 'pass' as const,
  };

  it('adapts a passing report to a ui_agent/xcuitest receipt', () => {
    const result = dogfoodReceiptFromIosReport(CONTEXT, report);
    expect(result.kind).toBe('ui_agent');
    expect(result.driver).toBe('xcuitest');
    expect(result.outcome).toBe('passed');
    expect(result.commitSha).toBe(COMMIT_SHA);
    expect(result.evidenceRefs).toContain('report.json');
  });

  it('maps fail to failed and inconclusive to blocked', () => {
    expect(
      dogfoodReceiptFromIosReport(CONTEXT, {
        ...report,
        issues: [{ issue: 'no profile rendered', surface: 'profile' }],
        verdict: 'fail' as const,
      }).outcome
    ).toBe('failed');
    expect(
      dogfoodReceiptFromIosReport(CONTEXT, {
        ...report,
        verdict: 'inconclusive' as const,
      }).outcome
    ).toBe('blocked');
  });

  it('rejects reports with the wrong schema', () => {
    expect(() =>
      dogfoodReceiptFromIosReport(CONTEXT, { schema: 'other/v9' })
    ).toThrow(/jovie-ios-dogfood/);
  });
});

describe('evaluateDogfoodReliability', () => {
  const binding = { commitSha: COMMIT_SHA, deploymentId: DEPLOYMENT_ID };

  function passingRuns(count: number, driver: DogfoodDriver = 'playwright') {
    return Array.from({ length: count }, (_, index) =>
      receipt({
        completedAt: `2026-09-27T10:0${index}:00.000Z`,
        driver,
        kind:
          driver === 'cli' || driver === 'mcp' ? 'agent_on_behalf' : 'ui_agent',
      })
    );
  }

  it('requires 3-of-3 passes for deterministic drivers on the exact deploy', () => {
    const evaluation = evaluateDogfoodReliability(
      [...passingRuns(2), ...passingRuns(1, 'cli')],
      binding,
      ['claim-smart-link']
    );
    expect(evaluation.missions[0]?.status).toBe('unmet');
    expect(evaluation.machineCertifiable).toBe(false);

    const withThree = evaluateDogfoodReliability(passingRuns(3), binding, [
      'claim-smart-link',
    ]);
    expect(withThree.missions[0]?.reliableAgents).toEqual([
      'ui_agent:playwright',
    ]);
    expect(withThree.machineCertifiable).toBe(true);
  });

  it('fails a deterministic kind when any of the latest 3 runs failed', () => {
    const runs = [
      ...passingRuns(3),
      receipt({ completedAt: '2026-09-27T10:09:00.000Z', outcome: 'failed' }),
    ];
    const evaluation = evaluateDogfoodReliability(runs, binding, [
      'claim-smart-link',
    ]);
    expect(evaluation.missions[0]?.status).toBe('unmet');
  });

  it('requires 4-of-5 for model-driven drivers', () => {
    const runs = [
      ...passingRuns(4, 'computer_use').map(run => ({
        ...run,
        kind: 'mac_closed_loop' as const,
      })),
      receipt({
        completedAt: '2026-09-27T10:09:00.000Z',
        driver: 'computer_use',
        kind: 'mac_closed_loop',
        outcome: 'failed',
      }),
    ];
    const evaluation = evaluateDogfoodReliability(runs, binding, [
      'claim-smart-link',
    ]);
    expect(evaluation.missions[0]?.reliableAgents).toEqual([
      'mac_closed_loop:computer_use',
    ]);
  });

  it('ignores receipts from a different commitSha or deploymentId', () => {
    const stale = passingRuns(3).map(run => ({ ...run, commitSha: OTHER_SHA }));
    const wrongDeploy = passingRuns(3).map(run => ({
      ...run,
      deploymentId: 'dpl_other',
    }));
    const evaluation = evaluateDogfoodReliability(
      [...stale, ...wrongDeploy],
      binding,
      ['claim-smart-link']
    );
    expect(evaluation.machineCertifiable).toBe(false);
  });

  it('does not count founder_real_account or human_signal toward machineCertifiable', () => {
    const runs = [
      ...passingRuns(3).map(run => ({
        ...run,
        driver: 'human' as const,
        kind: 'founder_real_account' as const,
      })),
      ...passingRuns(3).map(run => ({
        ...run,
        driver: 'human' as const,
        kind: 'human_signal' as const,
      })),
    ];
    const evaluation = evaluateDogfoodReliability(runs, binding, [
      'claim-smart-link',
    ]);
    expect(evaluation.machineCertifiable).toBe(false);
    expect(evaluation.missions[0]?.reliableAgents).toEqual([]);
  });

  it('does not require optional missions for machineCertifiable', () => {
    const evaluation = evaluateDogfoodReliability([], binding, [
      { id: 'optional-mission', required: false },
    ]);
    expect(evaluation.machineCertifiable).toBe(true);
  });
});
