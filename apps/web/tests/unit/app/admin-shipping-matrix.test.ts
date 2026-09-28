import { describe, expect, it, vi } from 'vitest';
import { buildMatrixRows } from '@/app/app/(shell)/admin/shipping/ShippingMatrix';
import {
  initialCursors,
  interpretAuthorityRead,
  unknownProjection,
} from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import {
  type LiveIo,
  readLanePullRequests,
} from '@/lib/ovie/shipping-state/live';

const NOW = Date.parse('2026-09-27T02:00:00.000Z');
const SHA = 'ee7401f37e0b324e225751f0d97ce229838ac8b4';

function lanePrPayload(overrides: Record<string, unknown> = {}) {
  return {
    number: 18934,
    title: 'fix(share): keep native share-sheet cancellation a no-op',
    url: 'https://github.com/JovieInc/Jovie/pull/18934',
    createdAt: '2026-09-26T01:00:00.000Z',
    headRefName: 'devin/jov-5544-20260927t045528',
    headRefOid: SHA,
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    updatedAt: '2026-09-27T01:30:00.000Z',
    mergeQueuePosition: null,
    mergeQueueState: null,
    authorLogin: 'devin-ai-integration[bot]',
    checks: { rollup: 'failure', failing: ['PR Ready', 'biome'] },
    ...overrides,
  };
}

function interpretLanePrs(pullRequests: readonly Record<string, unknown>[]) {
  const cursor = initialCursors().get('lane-pull-requests');
  if (!cursor) throw new Error('missing cursor');
  return interpretAuthorityRead(
    {
      sourceId: 'lane-pull-requests',
      status: 'ok',
      schema: 'github-lane-pull-requests/v1',
      payload: { pullRequests },
      truncated: false,
      sourceTimestamp: null,
      sourceRevision: null,
      sequence: 1,
      eventId: null,
    },
    cursor,
    new Date(NOW).toISOString(),
    new Date(NOW).toISOString()
  ).observation;
}

describe('lane pull request detail (JOV-6893)', () => {
  it('surfaces PR number, url, agent, checks, and queue state on the task', () => {
    const observation = interpretLanePrs([
      lanePrPayload({ mergeQueuePosition: 3, mergeQueueState: 'QUEUED' }),
    ]);
    const task = observation.entities[0]?.operationalTask;
    expect(task?.pullRequest).toEqual({
      number: 18934,
      url: 'https://github.com/JovieInc/Jovie/pull/18934',
      branch: 'devin/jov-5544-20260927t045528',
      agent: 'devin',
      isDraft: false,
      checks: { rollup: 'failure', failing: ['PR Ready', 'biome'] },
      queuePosition: 3,
      queueState: 'QUEUED',
      createdAt: '2026-09-26T01:00:00.000Z',
    });
  });

  it('drops unsafe urls and unknown check rollups', () => {
    const observation = interpretLanePrs([
      lanePrPayload({
        url: 'javascript:alert(1)',
        checks: { rollup: 'weird' },
      }),
    ]);
    const pr = observation.entities[0]?.operationalTask?.pullRequest;
    expect(pr?.url).toBeNull();
    expect(pr?.checks).toEqual({ rollup: 'unknown', failing: [] });
  });

  it('extracts check rollup and failing check names from the GraphQL read', async () => {
    const fetchImpl: LiveIo['fetch'] = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        variables: { query: string };
      };
      const isCodex = body.variables.query.includes('head:codex/');
      return new Response(
        JSON.stringify({
          data: {
            search: {
              issueCount: isCodex ? 0 : 1,
              nodes: isCodex
                ? []
                : [
                    {
                      number: 42,
                      title: 'feat: thing',
                      url: 'https://github.com/JovieInc/Jovie/pull/42',
                      createdAt: '2026-09-25T00:00:00Z',
                      headRefName: 'devin/jov-42-20260925t000000',
                      headRefOid: SHA,
                      isDraft: false,
                      mergeable: 'MERGEABLE',
                      reviewDecision: null,
                      updatedAt: '2026-09-27T01:00:00Z',
                      mergeQueueEntry: { position: 1, state: 'QUEUED' },
                      author: { login: 'devin-ai-integration[bot]' },
                      commits: {
                        nodes: [
                          {
                            commit: {
                              statusCheckRollup: {
                                state: 'FAILURE',
                                contexts: {
                                  nodes: [
                                    {
                                      __typename: 'CheckRun',
                                      name: 'PR Ready',
                                      status: 'COMPLETED',
                                      conclusion: 'FAILURE',
                                    },
                                    {
                                      __typename: 'CheckRun',
                                      name: 'typecheck',
                                      status: 'COMPLETED',
                                      conclusion: 'SUCCESS',
                                    },
                                    {
                                      __typename: 'StatusContext',
                                      context: 'ci/circle',
                                      state: 'ERROR',
                                    },
                                  ],
                                },
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });
    const read = await readLanePullRequests({
      fetch: fetchImpl,
      githubToken: 'token',
      githubOwner: 'JovieInc',
      githubRepo: 'Jovie',
      nowMs: () => NOW,
    });
    expect(read.status).toBe('ok');
    const pr = (read.payload?.pullRequests as Record<string, unknown>[])[0];
    expect(pr).toMatchObject({
      mergeQueuePosition: 1,
      mergeQueueState: 'QUEUED',
      authorLogin: 'devin-ai-integration[bot]',
      checks: { rollup: 'failure', failing: ['PR Ready', 'ci/circle'] },
    });
  });
});

describe('buildMatrixRows (JOV-6893)', () => {
  const feedBase = {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'lane-pull-requests',
    observedAt: null,
    lastSyncedAt: null,
    freshnessDeadline: null,
    deltas: [],
  } as const;

  function task(overrides: Record<string, unknown> = {}) {
    return {
      id: 'linear:JOV-1' as const,
      linearIdentifier: 'JOV-1',
      linearUrl: 'https://linear.app/jovie/issue/jov-1',
      title: 'Lane work',
      workflowState: 'in-review' as const,
      priority: 'none' as const,
      attempt: null,
      retryAt: null,
      sourceRevision: SHA,
      updatedAt: '2026-09-27T01:30:00.000Z',
      ...overrides,
    };
  }

  it('marks blocked and failing-check rows for attention', () => {
    const rows = buildMatrixRows(
      {
        ...feedBase,
        tasks: [
          task({ workflowState: 'blocked' }),
          task({
            id: 'linear:JOV-2',
            linearIdentifier: 'JOV-2',
            pullRequest: {
              number: 7,
              url: 'https://github.com/JovieInc/Jovie/pull/7',
              branch: 'codex/jov-2-x',
              agent: 'codex',
              isDraft: false,
              checks: { rollup: 'failure', failing: ['PR Ready'] },
              queuePosition: null,
              queueState: null,
              createdAt: '2026-09-26T00:00:00.000Z',
            },
          }),
        ],
      },
      NOW
    );
    expect(rows.map(row => row.attention)).toEqual(['blocked', 'failing']);
    expect(rows[1]?.failingChecks).toEqual(['PR Ready']);
    expect(rows[1]?.agent).toBe('codex');
  });

  it('marks live work with no recent transition as stalled', () => {
    const rows = buildMatrixRows(
      {
        ...feedBase,
        tasks: [
          task({
            workflowState: 'in-review',
            updatedAt: '2026-09-25T00:00:00.000Z',
          }),
          task({ workflowState: 'merge-queued' }),
        ],
      },
      NOW
    );
    expect(rows.map(row => row.attention)).toEqual(['stalled', 'queued']);
  });

  it('reports the last meaningful transition from the delta feed', () => {
    const rows = buildMatrixRows(
      {
        ...feedBase,
        tasks: [task()],
        deltas: [
          {
            taskId: 'linear:JOV-1',
            kind: 'updated' as const,
            fromState: 'running' as const,
            toState: 'in-review' as const,
            sequence: 9,
          },
        ],
      },
      NOW
    );
    expect(rows[0]?.transition).toBe('running → in-review');
  });
});

describe('client projection parse', () => {
  it('retains pullRequest detail through the cockpit schema', () => {
    const projection = structuredClone(
      unknownProjection({
        sequence: 1,
        observationTimestamp: new Date(NOW).toISOString(),
        emissionTimestamp: new Date(NOW).toISOString(),
        latencyMs: 10,
        publishing: true,
        lastError: null,
      })
    );
    projection.operationalTasks.tasks = [
      {
        id: 'linear:JOV-1',
        linearIdentifier: 'JOV-1',
        linearUrl: 'https://linear.app/jovie/issue/jov-1',
        title: 'Lane work',
        workflowState: 'merge-queued',
        priority: 'none',
        attempt: null,
        retryAt: null,
        sourceRevision: SHA,
        updatedAt: '2026-09-27T01:30:00.000Z',
        pullRequest: {
          number: 7,
          url: 'https://github.com/JovieInc/Jovie/pull/7',
          branch: 'devin/jov-1-x',
          agent: 'devin',
          isDraft: false,
          checks: { rollup: 'failure', failing: ['biome'] },
          queuePosition: 2,
          queueState: 'QUEUED',
          createdAt: '2026-09-26T00:00:00.000Z',
        },
      },
    ];
    const parsed = parseShippingCockpitProjection(projection);
    expect(
      parsed?.operationalTasks.tasks[0]?.pullRequest?.checks.failing
    ).toEqual(['biome']);
  });
});
