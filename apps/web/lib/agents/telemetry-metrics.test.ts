import { describe, expect, it } from 'vitest';
import { aggregateSkillRunFixtures } from './telemetry-metrics';

describe('aggregateSkillRunFixtures', () => {
  it('rolls up run/completion/error/feedback/cost metrics per skill+version', () => {
    const rows = aggregateSkillRunFixtures([
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.02,
        feedbackVote: 'up',
        successMetricName: 'identity_pass',
        successMetricOutcome: { ok: true },
      },
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'error',
        costUsd: 0.01,
        feedbackVote: 'down',
      },
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.03,
      },
      {
        skillId: 'retouch',
        skillVersion: '1.1.0',
        status: 'completed',
        costUsd: 0.05,
        successMetricName: 'identity_pass',
        successMetricOutcome: { ok: true },
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      skillId: 'retouch',
      skillVersion: '1.0.0',
      runCount: 3,
      completionRate: 2 / 3,
      errorRate: 1 / 3,
      negativeFeedbackRate: 0.5,
      medianCostUsd: 0.02,
      successMetricSummary: {
        named: 'identity_pass',
        outcomesRecorded: 1,
      },
    });
    expect(rows[1]).toMatchObject({
      skillId: 'retouch',
      skillVersion: '1.1.0',
      runCount: 1,
      completionRate: 1,
      errorRate: 0,
      medianCostUsd: 0.05,
    });
  });

  it('returns empty array for empty fixtures', () => {
    expect(aggregateSkillRunFixtures([])).toEqual([]);
  });

  it('keeps control and named cohort metrics separately', () => {
    const rows = aggregateSkillRunFixtures([
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        cohort: 'control',
        status: 'error',
      },
      {
        skillId: 'retouch',
        skillVersion: '2.0.0',
        cohort: 'blue',
        status: 'completed',
      },
    ]);
    expect(rows.map(row => [row.cohort, row.runCount])).toEqual([
      ['control', 1],
      ['blue', 1],
    ]);
  });

  it('averages the two middle costs when the sample is even', () => {
    const rows = aggregateSkillRunFixtures([
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.1,
      },
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.02,
      },
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.04,
      },
      {
        skillId: 'retouch',
        skillVersion: '1.0.0',
        status: 'completed',
        costUsd: 0.01,
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.medianCostUsd).toBe((0.02 + 0.04) / 2);
  });

  it('leaves median cost empty when a run recorded no cost', () => {
    const rows = aggregateSkillRunFixtures([
      { skillId: 'retouch', skillVersion: '1.0.0', status: 'completed' },
    ]);

    expect(rows[0]?.medianCostUsd).toBeNull();
    expect(rows[0]?.runCount).toBe(1);
  });

  it('orders rows by skill, then version, then cohort', () => {
    const rows = aggregateSkillRunFixtures([
      { skillId: 'zeta', skillVersion: '1.0.0', status: 'completed' },
      {
        skillId: 'alpha',
        skillVersion: '1.0.0',
        cohort: 'blue',
        status: 'completed',
      },
      {
        skillId: 'alpha',
        skillVersion: '1.0.0',
        cohort: 'control',
        status: 'completed',
      },
      { skillId: 'alpha', skillVersion: '0.9.0', status: 'started' },
    ]);

    expect(
      rows.map(row => [row.skillId, row.skillVersion, row.cohort ?? ''])
    ).toEqual([
      ['alpha', '0.9.0', ''],
      ['alpha', '1.0.0', 'blue'],
      ['alpha', '1.0.0', 'control'],
      ['zeta', '1.0.0', ''],
    ]);
  });
});
