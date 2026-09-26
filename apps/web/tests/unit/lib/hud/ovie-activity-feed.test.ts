import { describe, expect, it } from 'vitest';
import {
  composeOvieActivityFeed,
  mergeOvieActivityFeed,
  operationalTaskToFeedRow,
} from '@/lib/hud/ovie-activity-feed';
import type {
  OvieMacHudInFlightPullRequest,
  OvieMacHudInFlightPullRequests,
} from '@/lib/hud/ovie-mac-hud';
import type {
  OperationalTask,
  OperationalTaskWorkflowState,
} from '@/lib/ovie/shipping-state';

function task(
  workflowState: OperationalTaskWorkflowState,
  overrides: Partial<OperationalTask> = {}
): OperationalTask {
  return {
    id: 'linear:JOV-5322',
    linearIdentifier: 'JOV-5322',
    linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
    title: 'Company activity feed',
    workflowState,
    priority: 'high',
    attempt: null,
    retryAt: null,
    sourceRevision: null,
    updatedAt: '2026-09-26T09:00:00.000Z',
    ...overrides,
  };
}

function pr(
  overrides: Partial<OvieMacHudInFlightPullRequest> = {}
): OvieMacHudInFlightPullRequest {
  return {
    number: 18623,
    title: 'feat: digest contract',
    url: 'https://github.com/JovieInc/Jovie/pull/18623',
    headRefName: 'devin/jov-5762',
    authorLogin: 'devin',
    updatedAtIso: '2026-09-26T08:00:00.000Z',
    status: 'in_review',
    statusLabel: 'In Review',
    statusDetail: 'Review requested',
    mergeQueuePosition: null,
    ...overrides,
  };
}

const PULL_REQUESTS = (
  items: readonly OvieMacHudInFlightPullRequest[] = [],
  availability: OvieMacHudInFlightPullRequests['availability'] = 'available'
): OvieMacHudInFlightPullRequests => ({
  availability,
  totalOpen: items.length,
  items,
  truncated: false,
  errorMessage: null,
});

const RECEIPT = {
  linearIssue: 'JOV-5322',
  symphonyRef: 'run-9',
  mergeQueueRef: 'mq-4',
  prodSha: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
  receiptAt: '2026-09-26T10:00:00.000Z',
};

const DIGEST_ENTRY = {
  title: 'Faster profile editor',
  slug: 'faster-profile-editor-1-2-3-0',
  date: '2026-09-25',
  summary: 'Faster profile editor',
  category: 'new' as const,
  capabilities: [],
  surfaces: [],
  availability: 'ga' as const,
  media: null,
  technicalVersion: '1.2.3',
  explanation: '',
  supporting: [],
  technical: [],
  prominence: 'medium' as const,
};

describe('operationalTaskToFeedRow', () => {
  it.each([
    ['queued', 'queued'],
    ['running', 'in-progress'],
    ['retrying', 'in-progress'],
    ['in-review', 'in-progress'],
    ['merge-queued', 'queued'],
    ['merged', 'merged'],
    ['production-verified', 'deployed'],
    ['blocked', 'blocked'],
  ] as const)('maps %s to %s', (workflowState, expected) => {
    const row = operationalTaskToFeedRow(task(workflowState), 'fresh');
    expect(row.state).toBe(expected);
    expect(row.linearIdentifier).toBe('JOV-5322');
    expect(row.freshness).toBe('fresh');
  });

  it('never reports merged work as deployed without a receipt', () => {
    const row = operationalTaskToFeedRow(task('merged'), 'fresh');
    expect(row.state).toBe('merged');
    expect(row.detail).toContain('receipt');
  });

  it('propagates stale sync state as stale freshness', () => {
    expect(operationalTaskToFeedRow(task('running'), 'stale').freshness).toBe(
      'stale'
    );
    expect(operationalTaskToFeedRow(task('running'), 'failed').freshness).toBe(
      'unknown'
    );
  });
});

describe('composeOvieActivityFeed', () => {
  it('emits a runtime/GitHub row for each in-flight PR', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS([
        pr(),
        pr({
          number: 9,
          status: 'merge_queue',
          statusDetail: 'Position 1',
          mergeQueuePosition: 1,
          updatedAtIso: '2026-09-26T09:00:00.000Z',
        }),
        pr({
          number: 8,
          status: 'blocked',
          statusDetail: 'Merge conflict',
          updatedAtIso: '2026-09-26T07:00:00.000Z',
        }),
      ]),
      shippingEntries: [],
      digestEntries: [],
      digestAvailable: true,
    });
    expect(feed.rows).toHaveLength(3);
    expect(feed.rows.map(r => r.state)).toEqual([
      'queued',
      'in-progress',
      'blocked',
    ]);
    expect(feed.rows[0]?.prUrl).toContain('/pull/');
    expect(feed.availability).toBe('available');
  });

  it('emits deployed rows only for receipted ships', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS(),
      shippingEntries: [RECEIPT, { junk: true }],
      digestEntries: [],
      digestAvailable: true,
    });
    expect(feed.rows).toHaveLength(1);
    expect(feed.rows[0]?.state).toBe('deployed');
    expect(feed.rows[0]?.detail).toContain('prod a1b2c3d');
    expect(feed.rows[0]?.linearIdentifier).toBe('JOV-5322');
  });

  it('emits public digest rows linked to the changelog', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS(),
      shippingEntries: [],
      digestEntries: [DIGEST_ENTRY],
      digestAvailable: true,
    });
    expect(feed.rows[0]?.state).toBe('publicly-available');
    expect(feed.rows[0]?.digestUrl).toBe(
      '/changelog#faster-profile-editor-1-2-3-0'
    );
  });

  it('keeps deployed and publicly-available as distinct states', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS(),
      shippingEntries: [RECEIPT],
      digestEntries: [DIGEST_ENTRY],
      digestAvailable: true,
    });
    const states = feed.rows.map(r => r.state);
    expect(states).toContain('deployed');
    expect(states).toContain('publicly-available');
  });

  it('marks degraded sources without hiding the rest', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS([pr()], 'error'),
      shippingEntries: [RECEIPT],
      digestEntries: [],
      digestAvailable: true,
    });
    expect(feed.availability).toBe('partial');
    expect(feed.rows).toHaveLength(1);
    expect(feed.rows[0]?.source).toBe('deploy-receipt');
  });

  it('reports not_configured when every source is absent', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS([], 'not_configured'),
      shippingEntries: [],
      shippingAvailable: false,
      digestEntries: [],
      digestAvailable: false,
    });
    expect(feed.availability).toBe('not_configured');
    expect(feed.rows).toHaveLength(0);
  });

  it('sorts newest first and keeps undated digest rows last', () => {
    const feed = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS([pr()]),
      shippingEntries: [RECEIPT],
      digestEntries: [DIGEST_ENTRY],
      digestAvailable: true,
    });
    expect(feed.rows.map(r => r.source)).toEqual([
      'deploy-receipt',
      'github',
      'public-digest',
    ]);
  });
});

describe('mergeOvieActivityFeed', () => {
  it('folds a deploy receipt into the matching merged task', () => {
    const base = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS(),
      shippingEntries: [RECEIPT],
      digestEntries: [],
      digestAvailable: true,
    });
    const merged = mergeOvieActivityFeed(base, {
      tasks: [task('merged')],
      syncState: 'fresh',
    });
    expect(merged.rows).toHaveLength(1);
    expect(merged.rows[0]?.source).toBe('linear');
    expect(merged.rows[0]?.state).toBe('deployed');
    expect(merged.rows[0]?.detail).toContain('receipted');
  });

  it('keeps standalone receipts for issues with no live task', () => {
    const base = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS(),
      shippingEntries: [RECEIPT],
      digestEntries: [],
      digestAvailable: true,
    });
    const merged = mergeOvieActivityFeed(base, {
      tasks: [task('running', { linearIdentifier: 'JOV-9999' })],
      syncState: 'fresh',
    });
    const states = merged.rows.map(r => `${r.source}:${r.state}`);
    expect(states).toContain('deploy-receipt:deployed');
    expect(states).toContain('linear:in-progress');
  });

  it('returns the base feed untouched when no task feed is present', () => {
    const base = composeOvieActivityFeed({
      pullRequests: PULL_REQUESTS([pr()]),
      shippingEntries: [],
      digestEntries: [],
      digestAvailable: true,
    });
    expect(mergeOvieActivityFeed(base, null)).toBe(base);
  });
});
