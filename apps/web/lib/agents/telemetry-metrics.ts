/**
 * Pure skill-run metric aggregates (JOV-3946).
 * Kept free of server-only / DB so unit tests and the promotion engine
 * can reuse the same rollup math on fixtures.
 */

export type SkillRunStatus = 'started' | 'completed' | 'error';

export interface SkillRunMetricsRow {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly runCount: number;
  readonly completionRate: number;
  readonly errorRate: number;
  readonly negativeFeedbackRate: number;
  readonly medianCostUsd: number | null;
  readonly successMetricSummary: {
    readonly named: string | null;
    readonly outcomesRecorded: number;
  };
}

export interface SkillRunFixtureEvent {
  readonly skillId: string;
  readonly skillVersion: string;
  readonly status: SkillRunStatus;
  readonly costUsd?: number | null;
  readonly feedbackVote?: 'up' | 'down' | null;
  readonly successMetricName?: string | null;
  readonly successMetricOutcome?: unknown;
}

/**
 * Per skill+version rollups from an in-memory event list.
 */
export function aggregateSkillRunFixtures(
  events: ReadonlyArray<SkillRunFixtureEvent>
): SkillRunMetricsRow[] {
  const groups = new Map<
    string,
    {
      skillId: string;
      skillVersion: string;
      runCount: number;
      completed: number;
      errors: number;
      negativeFeedback: number;
      feedback: number;
      costs: number[];
      successMetricName: string | null;
      outcomesRecorded: number;
    }
  >();

  for (const event of events) {
    const key = `${event.skillId}::${event.skillVersion}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        skillId: event.skillId,
        skillVersion: event.skillVersion,
        runCount: 0,
        completed: 0,
        errors: 0,
        negativeFeedback: 0,
        feedback: 0,
        costs: [],
        successMetricName: null,
        outcomesRecorded: 0,
      };
      groups.set(key, group);
    }
    group.runCount += 1;
    if (event.status === 'completed') group.completed += 1;
    if (event.status === 'error') group.errors += 1;
    if (event.feedbackVote) {
      group.feedback += 1;
      if (event.feedbackVote === 'down') group.negativeFeedback += 1;
    }
    if (event.costUsd != null) group.costs.push(event.costUsd);
    if (event.successMetricName) {
      group.successMetricName = event.successMetricName;
    }
    if (event.successMetricOutcome != null) {
      group.outcomesRecorded += 1;
    }
  }

  return [...groups.values()]
    .map(group => {
      const sortedCosts = [...group.costs].sort((a, b) => a - b);
      const mid = Math.floor(sortedCosts.length / 2);
      const medianCostUsd =
        sortedCosts.length === 0
          ? null
          : sortedCosts.length % 2 === 0
            ? (sortedCosts[mid - 1]! + sortedCosts[mid]!) / 2
            : sortedCosts[mid]!;

      return {
        skillId: group.skillId,
        skillVersion: group.skillVersion,
        runCount: group.runCount,
        completionRate:
          group.runCount > 0 ? group.completed / group.runCount : 0,
        errorRate: group.runCount > 0 ? group.errors / group.runCount : 0,
        negativeFeedbackRate:
          group.feedback > 0 ? group.negativeFeedback / group.feedback : 0,
        medianCostUsd,
        successMetricSummary: {
          named: group.successMetricName,
          outcomesRecorded: group.outcomesRecorded,
        },
      };
    })
    .sort((a, b) =>
      a.skillId === b.skillId
        ? a.skillVersion.localeCompare(b.skillVersion)
        : a.skillId.localeCompare(b.skillId)
    );
}
