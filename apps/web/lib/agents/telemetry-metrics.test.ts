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
});
