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

  it('rejects malformed redis payloads', () => {
    expect(parseNightlyAgentStatus({ pass: true })).toBeNull();
    expect(isNightlyAgentStatus(null)).toBe(false);
  });
});
