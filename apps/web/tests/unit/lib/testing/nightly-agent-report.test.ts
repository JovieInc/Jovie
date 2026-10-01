import { describe, expect, it } from 'vitest';
import {
  buildNightlyAgentStatusFromSkillDelta,
  formatNightlyAgentSummary,
  isNightlyAgentStatus,
  parseNightlyAgentStatus,
} from '@/lib/testing/nightly-agent-report';

describe('nightly-agent-report', () => {
  it('builds pass status from clean skill delta and suites', () => {
    const status = buildNightlyAgentStatusFromSkillDelta(
      {
        generatedAt: '2026-06-12T11:31:02.768Z',
        repo: 'jovie',
        selectedTargets: [
          { id: 'billing', module: 'Billing', score: 118, lanes: ['unit'] },
        ],
        failures: [],
      },
      {
        suites: [
          {
            lane: 'unit',
            total: 100,
            passed: 100,
            failed: 0,
            flaky: 0,
            skipped: 0,
          },
        ],
        workflowRunUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
        workflowConclusion: 'success',
      }
    );

    expect(status.pass).toBe(true);
    expect(status.failureCount).toBe(0);
    expect(status.selectedTargetCount).toBe(1);
    expect(status.workflowRunUrl).toContain('/actions/runs/1');
  });

  it('marks fail when suite failures are present', () => {
    const status = buildNightlyAgentStatusFromSkillDelta(
      {
        generatedAt: '2026-06-12T11:31:02.768Z',
        repo: 'jovie',
        failures: [{ testId: 'auth test', lane: 'unit', fingerprint: 'abc' }],
      },
      {
        suites: [
          {
            lane: 'unit',
            total: 10,
            passed: 9,
            failed: 1,
            flaky: 0,
            skipped: 0,
          },
        ],
      }
    );

    expect(status.pass).toBe(false);
    expect(status.failureCount).toBe(1);
  });

  it('parses and validates stored status payloads', () => {
    const payload = {
      generatedAt: '2026-06-12T11:31:02.768Z',
      repo: 'jovie',
      pass: true,
      reportDocPath: 'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
      suites: [
        {
          lane: 'unit',
          total: 1,
          passed: 1,
          failed: 0,
          flaky: 0,
          skipped: 0,
        },
      ],
      failureCount: 0,
      selectedTargetCount: 2,
      mutation: { score: 91.2, killed: 120, survived: 10, total: 130 },
    };

    expect(isNightlyAgentStatus(payload)).toBe(true);
    expect(parseNightlyAgentStatus(JSON.stringify(payload))).toEqual(payload);
    expect(formatNightlyAgentSummary(payload)).toContain('pass');
    expect(formatNightlyAgentSummary(payload)).toContain('mutation 91.2%');
  });

  it.each(['failure', 'cancelled', 'timed_out'] as const)(
    'never reports a %s workflow as passing from partial green telemetry',
    workflowConclusion => {
      const status = buildNightlyAgentStatusFromSkillDelta(
        { generatedAt: '2026-10-01T16:31:02Z', repo: 'jovie', failures: [] },
        {
          workflowConclusion,
          suites: [
            {
              lane: 'unit',
              total: 2,
              passed: 2,
              failed: 0,
              flaky: 0,
              skipped: 0,
            },
          ],
        }
      );
      expect(status.pass).toBe(false);
      expect(status.workflowConclusion).toBe(workflowConclusion);
    }
  );

  it('requires executed test or mutation evidence even when the workflow says success', () => {
    const status = buildNightlyAgentStatusFromSkillDelta(
      { generatedAt: '2026-10-01T16:31:02Z', repo: 'jovie', failures: [] },
      { workflowConclusion: 'success', suites: [] }
    );
    expect(status.pass).toBe(false);
  });

  it('does not count an entirely skipped suite as executed evidence', () => {
    const status = buildNightlyAgentStatusFromSkillDelta(
      { generatedAt: '2026-10-01T16:31:02Z', repo: 'jovie', failures: [] },
      {
        workflowConclusion: 'success',
        suites: [
          {
            lane: 'unit',
            total: 5,
            passed: 0,
            failed: 0,
            flaky: 0,
            skipped: 5,
          },
        ],
      }
    );
    expect(status.pass).toBe(false);
  });

  it('accepts successful mutation-only execution', () => {
    const status = buildNightlyAgentStatusFromSkillDelta(
      {
        generatedAt: '2026-10-01T16:31:02Z',
        repo: 'jovie',
        failures: [],
        mutation: { score: 100, killed: 4, survived: 0, total: 4 },
      },
      { workflowConclusion: 'success', suites: [] }
    );
    expect(status.pass).toBe(true);
    expect(status.mutation?.total).toBe(4);
  });

  it('rejects malformed redis payloads', () => {
    expect(parseNightlyAgentStatus({ pass: true })).toBeNull();
    expect(isNightlyAgentStatus(null)).toBe(false);
  });
});
