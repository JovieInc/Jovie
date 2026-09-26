import { describe, expect, it } from 'vitest';
import {
  composeOvieActivityFeed,
  type OvieActivityOperationalFeed,
} from '@/lib/hud/ovie-activity-feed';
import type { OperationalTask } from '@/lib/ovie/shipping-state';

const RECEIPT = {
  linearIssue: 'JOV-5322',
  symphonyRef: 'symphony-task-9',
  mergeQueueRef: 'MQ-4',
  prodSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  receiptAt: '2026-09-25T10:00:00.000Z',
};

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: 'linear:JOV-5322',
    linearIdentifier: 'JOV-5322',
    linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
    title: 'Company activity feed',
    workflowState: 'running',
    priority: 'high',
    attempt: 1,
    retryAt: null,
    sourceRevision: null,
    updatedAt: '2026-09-26T08:00:00.000Z',
    ...overrides,
  };
}

function operational(
  tasks: readonly OperationalTask[],
  syncState: OvieActivityOperationalFeed['syncState'] = 'fresh'
): OvieActivityOperationalFeed {
  return { syncState, tasks };
}

describe('composeOvieActivityFeed', () => {
  it('renders receipt rows as deployed with provenance detail', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([]),
      receipts: [RECEIPT],
      receiptsAvailable: true,
      publicUpdates: [],
    });

    expect(feed.observation).toBe('ok');
    expect(feed.rows).toHaveLength(1);
    expect(feed.rows[0]).toMatchObject({
      state: 'deployed',
      linearIdentifier: 'JOV-5322',
      sourceLabel: 'Dogfood receipt',
      freshness: 'fresh',
    });
    expect(feed.rows[0]?.detail).toContain('bbbbbbb');
    expect(feed.rows[0]?.detail).toContain('MQ-4');
  });

  it('maps runtime task workflow states to feed states', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([
        task({ id: 'linear:JOV-1', linearIdentifier: 'JOV-1' }),
        task({
          id: 'linear:JOV-2',
          linearIdentifier: 'JOV-2',
          workflowState: 'merge-queued',
        }),
        task({
          id: 'linear:JOV-3',
          linearIdentifier: 'JOV-3',
          workflowState: 'blocked',
        }),
        task({
          id: 'linear:JOV-4',
          linearIdentifier: 'JOV-4',
          workflowState: 'merged',
        }),
      ]),
      receipts: [],
      receiptsAvailable: true,
      publicUpdates: [],
    });

    const byId = new Map(
      feed.rows.map(row => [row.linearIdentifier, row.state])
    );
    expect(byId.get('JOV-1')).toBe('in-progress');
    expect(byId.get('JOV-2')).toBe('queued');
    expect(byId.get('JOV-3')).toBe('blocked');
    expect(byId.get('JOV-4')).toBe('merged');
    expect(feed.rows.every(row => row.freshness === 'fresh')).toBe(true);
  });

  it('dedupes deployed tasks already covered by a receipt', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([
        task({ workflowState: 'production-verified' }),
      ]),
      receipts: [RECEIPT],
      receiptsAvailable: true,
      publicUpdates: [],
    });

    expect(feed.rows).toHaveLength(1);
    expect(feed.rows[0]?.key).toMatch(/^receipt:/);
  });

  it('marks stale operational cache on every task row', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([task()], 'stale'),
      receipts: [],
      receiptsAvailable: true,
      publicUpdates: [],
    });

    expect(feed.rows[0]?.freshness).toBe('stale');
  });

  it('renders curated public updates as public rows', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([]),
      receipts: [],
      receiptsAvailable: true,
      publicUpdates: [
        {
          title: 'Faster profile editing',
          date: '2026-09-24',
          url: '/changelog',
        },
      ],
    });

    expect(feed.rows[0]).toMatchObject({
      state: 'public',
      sourceLabel: 'Public digest',
      href: '/changelog',
    });
  });

  it('orders rows by occurrence, newest first', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([task()]),
      receipts: [RECEIPT],
      receiptsAvailable: true,
      publicUpdates: [],
    });

    expect(feed.rows[0]?.key).toMatch(/^task:/);
    expect(feed.rows[1]?.key).toMatch(/^receipt:/);
  });

  it('reports syncing when nothing has landed and the cache is cold', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([], 'syncing'),
      receipts: [],
      receiptsAvailable: false,
      publicUpdates: [],
    });

    expect(feed.observation).toBe('syncing');
    expect(feed.rows).toHaveLength(0);
  });

  it('reports unavailable when the task cache fails and receipts are missing', () => {
    const feed = composeOvieActivityFeed({
      operational: operational([], 'failed'),
      receipts: [],
      receiptsAvailable: false,
      publicUpdates: [],
    });

    expect(feed.observation).toBe('unavailable');
  });

  it('caps rows at the configured limit', () => {
    const tasks = Array.from({ length: 20 }, (_, index) =>
      task({
        id: `linear:JOV-${index + 1}`,
        linearIdentifier: `JOV-${index + 1}`,
        updatedAt: `2026-09-26T08:${String(index).padStart(2, '0')}:00.000Z`,
      })
    );
    const feed = composeOvieActivityFeed({
      operational: operational(tasks),
      receipts: [],
      receiptsAvailable: true,
      publicUpdates: [],
      limit: 5,
    });

    expect(feed.rows).toHaveLength(5);
  });
});
