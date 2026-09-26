import { describe, expect, it } from 'vitest';
import { composeCompanyActivity } from '@/lib/hud/company-activity';
import type {
  OvieMacHudInFlightPullRequests,
  OvieMacHudReceiptedShip,
} from '@/lib/hud/ovie-mac-hud';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

type OperationalTaskFeed = ShippingCockpitProjection['operationalTasks'];
type OperationalTask = OperationalTaskFeed['tasks'][number];

const EMPTY_PRS: OvieMacHudInFlightPullRequests = {
  availability: 'available',
  totalOpen: 0,
  items: [],
  truncated: false,
  errorMessage: null,
};

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: 'linear:JOV-5000',
    linearIdentifier: 'JOV-5000',
    linearUrl: 'https://linear.app/jovie/issue/JOV-5000/example',
    title: 'Example work',
    workflowState: 'running',
    priority: 'high',
    attempt: null,
    retryAt: null,
    sourceRevision: null,
    updatedAt: '2026-09-26T10:00:00.000Z',
    ...overrides,
  };
}

function feed(
  overrides: Partial<OperationalTaskFeed> = {}
): OperationalTaskFeed {
  return {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-26T10:00:00.000Z',
    lastSyncedAt: '2026-09-26T10:00:00.000Z',
    freshnessDeadline: '2026-09-26T10:00:10.000Z',
    tasks: [],
    deltas: [],
    ...overrides,
  };
}

function ship(
  overrides: Partial<OvieMacHudReceiptedShip> = {}
): OvieMacHudReceiptedShip {
  return {
    linearIssue: 'JOV-4999',
    symphonyRef: 'sym-1',
    mergeQueueRef: 'mq-1',
    prodSha: '0123456789abcdef0123456789abcdef01234567',
    receiptAt: '2026-09-26T09:00:00.000Z',
    ...overrides,
  };
}

describe('composeCompanyActivity', () => {
  it('projects a runtime-hot Linear row with its latest state delta', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed({
        tasks: [task()],
        deltas: [
          {
            taskId: 'linear:JOV-5000',
            kind: 'updated',
            fromState: 'queued',
            toState: 'running',
            sequence: 7,
          },
        ],
      }),
      pullRequests: EMPTY_PRS,
    });

    expect(result.sources.linear).toBe('ok');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'linear:JOV-5000',
      linearIdentifier: 'JOV-5000',
      linearUrl: 'https://linear.app/jovie/issue/JOV-5000/example',
      state: 'in-progress',
      actor: 'Symphony',
      detail: 'Queued → In Progress',
      receipted: false,
    });
  });

  it('marks a production-verified task as receipted and never duplicates the receipt row', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed({
        tasks: [
          task({
            workflowState: 'production-verified',
            linearIdentifier: 'JOV-4999',
          }),
        ],
      }),
      pullRequests: EMPTY_PRS,
      receiptedShips: [ship()],
      receiptsAvailable: true,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      state: 'deployed',
      receipted: true,
    });
    expect(result.sources.receipts).toBe('ok');
  });

  it('emits a standalone deployed row for a receipt with no matching work row', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed(),
      pullRequests: EMPTY_PRS,
      receiptedShips: [ship()],
      receiptsAvailable: true,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      linearIdentifier: 'JOV-4999',
      state: 'deployed',
      actor: 'Dogfood receipt',
      receipted: true,
      detail: 'prod 0123456',
    });
  });

  it('projects a GitHub merge-queue row with Linear identity and PR provenance', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed(),
      pullRequests: {
        ...EMPTY_PRS,
        totalOpen: 1,
        items: [
          {
            number: 17156,
            title: 'feat(hud): activity feed',
            url: 'https://github.com/JovieInc/Jovie/pull/17156',
            headRefName: 'devin/jov-5322-20260926t104330',
            authorLogin: 'devin-ai-integration',
            updatedAtIso: '2026-09-26T11:00:00.000Z',
            status: 'merge_queue',
            statusLabel: 'MQ',
            statusDetail: 'Position 2',
            mergeQueuePosition: 2,
          },
        ],
      },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      linearIdentifier: 'JOV-5322',
      state: 'merge-queued',
      actor: 'devin-ai-integration',
      prNumber: 17156,
      prUrl: 'https://github.com/JovieInc/Jovie/pull/17156',
      href: 'https://github.com/JovieInc/Jovie/pull/17156',
    });
  });

  it('projects curated digest rows as public with changelog provenance only', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed(),
      pullRequests: EMPTY_PRS,
      publicDigest: {
        availability: 'available',
        items: [
          {
            title: 'Faster profile pages',
            slug: 'faster-profile-pages-v1-2-0-0',
            date: '2026-09-25',
            technicalVersion: '1.2.0',
          },
        ],
      },
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      state: 'public',
      actor: "What's New",
      detail: 'v1.2.0',
      href: '/changelog#faster-profile-pages-v1-2-0-0',
      prUrl: null,
    });
    expect(result.sources.digest).toBe('ok');
  });

  it('reports unavailable sources instead of inventing rows', () => {
    const result = composeCompanyActivity({
      operationalTasks: null,
      pullRequests: {
        ...EMPTY_PRS,
        availability: 'error',
        errorMessage: 'GitHub API error (502)',
      },
      receiptsAvailable: false,
      publicDigest: null,
    });

    expect(result.rows).toEqual([]);
    expect(result.sources).toEqual({
      linear: 'unavailable',
      github: 'unavailable',
      receipts: 'unavailable',
      digest: 'unavailable',
    });
  });

  it('sorts rows newest first, leaves unknown timestamps last, and truncates', () => {
    const result = composeCompanyActivity({
      operationalTasks: feed({
        tasks: [
          task({
            id: 'linear:JOV-1',
            linearIdentifier: 'JOV-1',
            title: 'Old work',
            updatedAt: '2026-09-20T00:00:00.000Z',
          }),
          task({
            id: 'linear:JOV-2',
            linearIdentifier: 'JOV-2',
            title: 'New work',
            updatedAt: '2026-09-26T00:00:00.000Z',
          }),
          task({
            id: 'linear:JOV-3',
            linearIdentifier: 'JOV-3',
            title: 'Undated work',
            updatedAt: null,
          }),
        ],
      }),
      pullRequests: EMPTY_PRS,
      limit: 2,
    });

    expect(result.rows.map(row => row.linearIdentifier)).toEqual([
      'JOV-2',
      'JOV-1',
    ]);
    expect(result.truncated).toBe(true);
  });
});
