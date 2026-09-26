import { describe, expect, it } from 'vitest';
import {
  composeOvieActivityRows,
  EMPTY_OVIE_ACTIVITY_SOURCES,
  observeOvieActivityFeed,
  parseLandedPullRequest,
} from '@/lib/hud/company-activity';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type TaskFeed = ShippingCockpitProjection['operationalTasks'];

function taskFeed(overrides: Partial<TaskFeed> = {}): TaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-26T08:00:00.000Z',
    lastSyncedAt: '2026-09-26T08:00:00.000Z',
    freshnessDeadline: '2026-09-26T08:00:10.000Z',
    tasks: [],
    deltas: [],
    ...overrides,
  };
}

describe('parseLandedPullRequest', () => {
  it('accepts the what-shipped ledger shape', () => {
    expect(
      parseLandedPullRequest({
        number: 18400,
        title: 'feat: activity feed',
        url: 'https://github.com/JovieInc/Jovie/pull/18400',
        merged_at: '2026-09-26T01:02:03Z',
      })
    ).toEqual({
      number: 18400,
      title: 'feat: activity feed',
      url: 'https://github.com/JovieInc/Jovie/pull/18400',
      mergedAtIso: '2026-09-26T01:02:03.000Z',
    });
  });

  it('rejects malformed or unmerged records', () => {
    expect(parseLandedPullRequest(null)).toBeNull();
    expect(parseLandedPullRequest({ number: 1 })).toBeNull();
    expect(
      parseLandedPullRequest({
        number: 1,
        title: 'x',
        url: 'https://x',
        merged_at: 'not-a-date',
      })
    ).toBeNull();
  });
});

describe('composeOvieActivityRows', () => {
  it('emits Linear task rows with runtime state and provenance', () => {
    const rows = composeOvieActivityRows({
      taskFeed: taskFeed({
        tasks: [
          {
            id: 'linear:JOV-5322',
            linearIdentifier: 'JOV-5322',
            linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
            title: 'Company activity feed',
            workflowState: 'running',
            priority: 'high',
            attempt: 2,
            retryAt: null,
            sourceRevision: 'r9',
            updatedAt: '2026-09-26T08:01:00.000Z',
          },
        ],
      }),
      sources: EMPTY_OVIE_ACTIVITY_SOURCES,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      state: 'in_progress',
      actor: 'Symphony runtime',
      linearId: 'JOV-5322',
      linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
      freshness: 'fresh',
    });
    expect(rows[0]?.detail).toContain('attempt 2');
  });

  it('keeps merged, deployed, and public rows distinct', () => {
    const rows = composeOvieActivityRows({
      taskFeed: null,
      sources: {
        landedPullRequests: [
          {
            number: 18400,
            title: 'feat: activity feed',
            url: 'https://github.com/JovieInc/Jovie/pull/18400',
            mergedAtIso: '2026-09-26T01:00:00.000Z',
          },
        ],
        receiptedShips: [
          {
            linearIssue: 'JOV-5300',
            symphonyRef: 's1',
            mergeQueueRef: 'mq-7',
            prodSha: 'a'.repeat(40),
            receiptAt: '2026-09-26T02:00:00.000Z',
          },
        ],
        publicDigest: [
          {
            version: '26.9.0',
            date: '2026-09-25',
            title: 'Artist inbox redesign',
            url: '/changelog/26.9.0',
          },
        ],
      },
    });

    const byState = Object.fromEntries(rows.map(row => [row.state, row]));
    expect(byState.merged?.href).toBe(
      'https://github.com/JovieInc/Jovie/pull/18400'
    );
    expect(byState.merged?.receipt).toBeNull();
    expect(byState.deployed?.receipt).toContain(`prod ${'a'.repeat(7)}`);
    expect(byState.deployed?.linearId).toBe('JOV-5300');
    expect(byState.public?.stateLabel).toBe('Public');
    expect(byState.public?.href).toBe('/changelog/26.9.0');
    expect(rows).not.toContainEqual(
      expect.objectContaining({ state: 'deployed', receipt: null })
    );
  });

  it('marks task rows stale or unknown from the feed sync state', () => {
    const task = {
      id: 'linear:JOV-1',
      linearIdentifier: 'JOV-1',
      linearUrl: null,
      title: 'X',
      workflowState: 'blocked' as const,
      priority: 'none' as const,
      attempt: null,
      retryAt: null,
      sourceRevision: null,
      updatedAt: null,
    };
    const stale = composeOvieActivityRows({
      taskFeed: taskFeed({ syncState: 'stale', tasks: [task] }),
      sources: EMPTY_OVIE_ACTIVITY_SOURCES,
    });
    expect(stale[0]?.freshness).toBe('stale');
    expect(stale[0]?.state).toBe('blocked');

    const missing = composeOvieActivityRows({
      taskFeed: null,
      sources: EMPTY_OVIE_ACTIVITY_SOURCES,
    });
    expect(missing).toEqual([]);
  });

  it('dedupes rows and honors the limit', () => {
    const rows = composeOvieActivityRows({
      taskFeed: null,
      sources: {
        landedPullRequests: Array.from({ length: 20 }, (_, i) => ({
          number: i + 1,
          title: `pr ${i}`,
          url: `https://github.com/x/pull/${i}`,
          mergedAtIso: '2026-09-26T00:00:00.000Z',
        })),
        receiptedShips: [],
        publicDigest: [],
      },
      limit: 5,
    });
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map(row => row.id)).size).toBe(5);
  });
});

describe('observeOvieActivityFeed', () => {
  it('reports unavailable only when both live and serialized sources fail', () => {
    expect(
      observeOvieActivityFeed({
        rows: [],
        taskRequestFailed: true,
        sourcesAvailable: false,
      })
    ).toBe('unavailable');
    expect(
      observeOvieActivityFeed({
        rows: [],
        taskRequestFailed: true,
        sourcesAvailable: true,
      })
    ).toBe('empty');
    expect(
      observeOvieActivityFeed({
        rows: [
          {
            id: 'x',
            state: 'merged',
            stateLabel: 'Merged',
            title: 't',
            actor: 'GitHub',
            linearId: null,
            linearUrl: null,
            href: null,
            receipt: null,
            freshness: 'fresh',
            updatedAtIso: null,
            detail: null,
          },
        ],
        taskRequestFailed: true,
        sourcesAvailable: false,
      })
    ).toBe('ok');
  });
});
