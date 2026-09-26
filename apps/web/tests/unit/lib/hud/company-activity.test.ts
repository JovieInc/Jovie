import { describe, expect, it } from 'vitest';
import type { CustomerChangelogEntry } from '@/lib/customer-changelog';
import { composeCompanyActivityRows } from '@/lib/hud/company-activity';
import type { OvieMacHudInFlightPullRequests } from '@/lib/hud/ovie-mac-hud';
import type { OperationalTaskFeed } from '@/lib/ovie/shipping-state/contract';

const RECEIPT = {
  linearIssue: '5298',
  symphonyRef: 'symphony-task-1',
  mergeQueueRef: 'MQ-1',
  prodSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  receiptAt: '2026-09-20T12:00:00.000Z',
};

function feed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-21T00:00:00.000Z',
    lastSyncedAt: '2026-09-21T00:00:00.000Z',
    freshnessDeadline: '2026-09-21T00:00:10.000Z',
    tasks: [],
    deltas: [],
    ...overrides,
  };
}

function prs(
  overrides: Partial<OvieMacHudInFlightPullRequests> = {}
): OvieMacHudInFlightPullRequests {
  return {
    availability: 'available',
    totalOpen: 0,
    items: [],
    truncated: false,
    errorMessage: null,
    ...overrides,
  };
}

function digestEntry(
  overrides: Partial<CustomerChangelogEntry> = {}
): CustomerChangelogEntry {
  return {
    title: 'Smarter release digests',
    slug: 'smarter-release-digests-v1-2-3-0',
    date: '2026-09-19',
    summary: 'Ships a curated daily digest.',
    category: 'new',
    capabilities: [],
    surfaces: ['web'],
    availability: 'ga',
    media: null,
    technicalVersion: '1.2.3',
    explanation: '',
    supporting: [],
    technical: [],
    prominence: 'featured',
    ...overrides,
  };
}

describe('composeCompanyActivityRows', () => {
  it('maps Linear ledger tasks to exact workflow states', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed({
        tasks: [
          {
            id: 'linear:JOV-5544',
            linearIdentifier: 'JOV-5544',
            linearUrl: 'https://linear.app/jovie/issue/JOV-5544/x',
            title: 'Cache Symphony workspaces',
            workflowState: 'running',
            priority: 'high',
            attempt: 1,
            retryAt: null,
            sourceRevision: 'rev-1',
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
        ],
      }),
      inFlightPullRequests: prs(),
      shippedReceipts: [],
      receiptsAvailable: false,
      publicDigest: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'linear:JOV-5544',
      source: 'linear',
      actor: 'symphony',
      linearIdentifier: 'JOV-5544',
      state: 'in-progress',
      href: 'https://linear.app/jovie/issue/JOV-5544/x',
      freshness: 'fresh',
    });
  });

  it('marks a stale task cache as stale instead of fresh', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed({
        syncState: 'failed',
        tasks: [
          {
            id: 'linear:JOV-1',
            linearIdentifier: 'JOV-1',
            linearUrl: null,
            title: 'Stale row',
            workflowState: 'queued',
            priority: 'none',
            attempt: null,
            retryAt: null,
            sourceRevision: null,
            updatedAt: null,
          },
        ],
      }),
      inFlightPullRequests: prs(),
      shippedReceipts: [],
      receiptsAvailable: false,
      publicDigest: [],
    });

    expect(rows[0]?.freshness).toBe('unknown');
    expect(rows[0]?.state).toBe('queued');
  });

  it('keeps merged PRs distinct from deployed receipts', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed({
        tasks: [
          {
            id: 'linear:JOV-9',
            linearIdentifier: 'JOV-9',
            linearUrl: null,
            title: 'Merged but not verified',
            workflowState: 'merged',
            priority: 'high',
            attempt: null,
            retryAt: null,
            sourceRevision: null,
            updatedAt: '2026-09-21T00:00:00.000Z',
          },
        ],
      }),
      inFlightPullRequests: prs(),
      shippedReceipts: [RECEIPT],
      receiptsAvailable: true,
      publicDigest: [],
    });

    const merged = rows.find(row => row.id === 'linear:JOV-9');
    const receipt = rows.find(row => row.id === `receipt:${RECEIPT.prodSha}`);
    expect(merged?.state).toBe('merged');
    expect(merged?.receipt).toBeNull();
    expect(receipt?.state).toBe('deployed');
    expect(receipt?.receipt).toBe('aaaaaaa');
    expect(receipt?.linearIdentifier).toBe('JOV-5298');
  });

  it('suppresses receipt rows when the receipt source is unavailable', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed(),
      inFlightPullRequests: prs(),
      shippedReceipts: [RECEIPT],
      receiptsAvailable: false,
      publicDigest: [],
    });

    expect(rows).toHaveLength(0);
  });

  it('adds GitHub rows only when the PR signal is available', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed(),
      inFlightPullRequests: prs({
        items: [
          {
            number: 16886,
            title: 'feat: bind signed ingress',
            url: 'https://github.com/JovieInc/Jovie/pull/16886',
            headRefName: 'tim/jov-1',
            authorLogin: 'codex',
            updatedAtIso: '2026-09-21T01:00:00.000Z',
            status: 'merge_queue',
            statusLabel: 'MQ',
            statusDetail: 'Position 1',
            mergeQueuePosition: 1,
          },
        ],
      }),
      shippedReceipts: [],
      receiptsAvailable: false,
      publicDigest: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'pr:16886',
      source: 'github',
      state: 'merge-queued',
      href: 'https://github.com/JovieInc/Jovie/pull/16886',
    });

    const unavailable = composeCompanyActivityRows({
      operationalTasks: feed(),
      inFlightPullRequests: prs({ availability: 'error' }),
      shippedReceipts: [],
      receiptsAvailable: false,
      publicDigest: [],
    });
    expect(unavailable).toHaveLength(0);
  });

  it('marks curated digest rows publicly available without a receipt claim', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed(),
      inFlightPullRequests: prs(),
      shippedReceipts: [],
      receiptsAvailable: false,
      publicDigest: [digestEntry()],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'digest:smarter-release-digests-v1-2-3-0',
      source: 'public-digest',
      actor: 'curated',
      state: 'publicly-available',
      href: '/changelog/1.2.3',
      receipt: null,
    });
  });

  it('sorts rows newest first and caps the feed', () => {
    const rows = composeCompanyActivityRows({
      operationalTasks: feed({
        tasks: [
          {
            id: 'linear:JOV-2',
            linearIdentifier: 'JOV-2',
            linearUrl: null,
            title: 'Newest',
            workflowState: 'queued',
            priority: 'none',
            attempt: null,
            retryAt: null,
            sourceRevision: null,
            updatedAt: '2026-09-22T00:00:00.000Z',
          },
        ],
      }),
      inFlightPullRequests: prs(),
      shippedReceipts: [RECEIPT],
      receiptsAvailable: true,
      publicDigest: [digestEntry()],
      maxRows: 2,
    });

    expect(rows.map(row => row.id)).toEqual([
      'linear:JOV-2',
      `receipt:${RECEIPT.prodSha}`,
    ]);
  });
});
