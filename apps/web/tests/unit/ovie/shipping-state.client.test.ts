import { describe, expect, it } from 'vitest';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { LANE_BRANCH_PREFIXES } from '@/lib/ovie/shipping-state/contract';

function projectionFixture() {
  return unknownProjection({
    sequence: 1,
    observationTimestamp: '2026-08-22T00:00:00.000Z',
    emissionTimestamp: '2026-08-22T00:00:00.000Z',
    latencyMs: 0,
    publishing: true,
    lastError: null,
  });
}

describe('shipping cockpit client parser', () => {
  it('normalizes new v1 measurements when an older v1 producer omits them', () => {
    const legacy = JSON.parse(JSON.stringify(projectionFixture())) as {
      sources: Record<
        string,
        { counts: Record<string, unknown>; durations?: unknown }
      >;
    };
    for (const source of Object.values(legacy.sources)) {
      delete source.counts.openPullRequests;
      delete source.durations;
    }

    const parsed = parseShippingCockpitProjection(legacy);

    expect(parsed).not.toBeNull();
    expect(
      parsed?.sources['github-native-merge-queue'].counts.openPullRequests
    ).toEqual({ state: 'not-measured', value: null });
    expect(parsed?.sources['exact-sha-ci'].durations).toEqual({
      queueWaitMs: { state: 'not-measured', value: null },
      runDurationMs: { state: 'not-measured', value: null },
    });
  });

  it('rejects structurally incomplete source observations', () => {
    expect(
      parseShippingCockpitProjection({
        schema: 'ovie.shipping-state.v1',
        sources: { 'github-native-merge-queue': {} },
      })
    ).toBeNull();
  });
});

describe('shipping cockpit client parser: lane drift (2026-10-31)', () => {
  function withTasks(agents: readonly (string | null)[]) {
    const projection = JSON.parse(JSON.stringify(projectionFixture())) as {
      operationalTasks: { tasks: unknown[] };
    };
    projection.operationalTasks.tasks = agents.map((agent, index) => ({
      id: `linear:JOV-${index + 1}`,
      linearIdentifier: `JOV-${index + 1}`,
      linearUrl: null,
      title: `Task ${index + 1}`,
      workflowState: 'running',
      priority: 'none',
      attempt: null,
      retryAt: null,
      sourceRevision: null,
      updatedAt: null,
      pullRequest: {
        number: index + 1,
        url: null,
        branch: agent ? `${agent}/jov-${index + 1}` : null,
        agent,
        isDraft: false,
        checks: { rollup: 'unknown', failing: [] },
        queuePosition: null,
        queueState: null,
        createdAt: null,
      },
    }));
    return projection;
  }

  it('accepts a PR from every lane the server knows', () => {
    const parsed = parseShippingCockpitProjection(
      withTasks(LANE_BRANCH_PREFIXES)
    );
    expect(parsed).not.toBeNull();
    expect(
      parsed?.operationalTasks.tasks.map(task => task.pullRequest?.agent)
    ).toEqual([...LANE_BRANCH_PREFIXES]);
  });

  it('reads a lane this client does not know yet as no owner', () => {
    const parsed = parseShippingCockpitProjection(
      withTasks(['codex', 'some-future-lane'])
    );
    expect(parsed).not.toBeNull();
    expect(
      parsed?.operationalTasks.tasks.map(task => task.pullRequest?.agent)
    ).toEqual(['codex', null]);
  });

  it('drops one malformed task instead of rejecting the projection', () => {
    const projection = withTasks(['codex', 'glm']);
    (projection.operationalTasks.tasks[1] as { title: string }).title = '';
    const parsed = parseShippingCockpitProjection(projection);
    expect(parsed).not.toBeNull();
    expect(parsed?.operationalTasks.tasks.map(task => task.id)).toEqual([
      'linear:JOV-1',
    ]);
  });
});
