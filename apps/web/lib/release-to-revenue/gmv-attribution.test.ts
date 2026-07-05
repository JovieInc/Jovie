import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockResolveMerchCardIdsForRun = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('./store-listing', () => ({
  resolveMerchCardIdsForRun: mockResolveMerchCardIdsForRun,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

import {
  buildReleaseGmvRowForRun,
  computeStoreGmvCents,
  getPaidOrdersForMerchCards,
  getReleaseGmvSnapshotForUser,
  isReleaseGmvCountableStatus,
  resolveReleaseWorkflowRunIdForMerchCard,
} from './gmv-attribution';
import type { ReleaseToRevenueRunStepOutputs } from './types';

const dialect = new PgDialect();

interface OrderFixture {
  readonly id: string;
  readonly creatorProfileId: string;
  readonly merchCardId: string;
  readonly subtotalCents: number;
  readonly status: string;
}

interface RunFixture {
  readonly id: string;
  readonly stepOutputs: ReleaseToRevenueRunStepOutputs;
}

const captured: {
  orderQuery: { sql: string; params: unknown[] } | null;
  runQuery: { sql: string; params: unknown[] } | null;
} = { orderQuery: null, runQuery: null };

/**
 * Table-routing fake `db.select()` that faithfully applies the rendered WHERE
 * predicate against a two-tenant fixture. `merch_orders` rows only survive when
 * their owner + card id are both bound in the query, so dropping the owner
 * predicate would leak the other tenant's order and fail the test.
 */
function installFakeDb(opts: {
  readonly orders?: readonly OrderFixture[];
  readonly runs?: readonly RunFixture[];
}) {
  captured.orderQuery = null;
  captured.runQuery = null;

  mockDbSelect.mockImplementation(() => {
    let table = '';
    const chain = {
      from(t: unknown) {
        table = getTableName(t as never);
        return chain;
      },
      where(cond: unknown) {
        const q = dialect.sqlToQuery(cond as never);
        const params = q.params as unknown[];

        if (table === 'merch_orders') {
          captured.orderQuery = { sql: q.sql, params };
          const matched = (opts.orders ?? []).filter(
            order =>
              params.includes(order.creatorProfileId) &&
              params.includes(order.merchCardId)
          );
          return Promise.resolve(
            matched.map(order => ({
              id: order.id,
              merchCardId: order.merchCardId,
              subtotalCents: order.subtotalCents,
              status: order.status,
            }))
          );
        }

        // workflow_runs — chainable so both `.where().orderBy()` (snapshot scan)
        // and `.where().orderBy().limit(n)` (explicit run lookup) resolve.
        // Faithfully apply the owner predicate: when the query is user-scoped,
        // only runs whose owner userId is bound survive (so dropping the
        // `user_id` predicate would leak the other tenant's run and fail a test).
        captured.runQuery = { sql: q.sql, params };
        const userScoped = q.sql.includes('"workflow_runs"."user_id"');
        const runs = (opts.runs ?? []).filter(run =>
          userScoped
            ? params.includes(run.stepOutputs.designPartner?.userId)
            : true
        );
        const runsChain = {
          orderBy: () => runsChain,
          limit: (n: number) => Promise.resolve(runs.slice(0, n)),
          then: (
            res: (value: readonly RunFixture[]) => unknown,
            rej?: (reason: unknown) => unknown
          ) => Promise.resolve(runs).then(res, rej),
        };
        return runsChain;
      },
    };
    return chain;
  });
}

function stepOutputsFor(input: {
  readonly creatorProfileId: string;
  readonly creatorUsername: string;
  readonly userId: string;
  readonly merchCardIds: readonly string[];
}): ReleaseToRevenueRunStepOutputs {
  return {
    releaseId: `release-${input.creatorUsername}`,
    triggerSource: 'catalog',
    triggeredAt: '2026-06-19T00:00:00.000Z',
    designPartner: {
      creatorUsername: input.creatorUsername,
      creatorProfileId: input.creatorProfileId,
      userId: input.userId,
      store: { provider: 'printful', scope: 'default' },
      socialAccount: { platform: 'instagram', handle: input.creatorUsername },
      smsListId: `sms-${input.creatorUsername}`,
    },
    release: {
      title: `Release for ${input.creatorUsername}`,
      artworkUrl: null,
      links: [],
    },
    storeListing: { merchCardIds: [...input.merchCardIds] },
  };
}

describe('release-to-revenue GMV attribution', () => {
  it('counts only paid Printful-backed order subtotals toward GMV', () => {
    const result = computeStoreGmvCents([
      { subtotalCents: 2500, status: 'paid' },
      { subtotalCents: 3000, status: 'shipped' },
      { subtotalCents: 9999, status: 'checkout_created' },
      { subtotalCents: 1200, status: 'refunded' },
    ]);

    expect(result).toEqual({ gmvCents: 5500, orderCount: 2 });
  });

  it('treats fulfillment pipeline statuses as countable GMV', () => {
    expect(isReleaseGmvCountableStatus('submitted_to_printful')).toBe(true);
    expect(isReleaseGmvCountableStatus('fulfilling')).toBe(true);
    expect(isReleaseGmvCountableStatus('checkout_created')).toBe(false);
    expect(isReleaseGmvCountableStatus('cancelled')).toBe(false);
  });

  it('returns zero GMV when no orders qualify', () => {
    expect(
      computeStoreGmvCents([
        { subtotalCents: 4000, status: 'checkout_created' },
        { subtotalCents: 1500, status: 'failed' },
      ])
    ).toEqual({ gmvCents: 0, orderCount: 0 });
  });
});

describe('getPaidOrdersForMerchCards tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only the owning creator orders even when a foreign card id is requested', async () => {
    installFakeDb({
      orders: [
        {
          id: 'order-A',
          creatorProfileId: 'profile-A',
          merchCardId: 'card-A',
          subtotalCents: 2500,
          status: 'paid',
        },
        {
          id: 'order-B',
          creatorProfileId: 'profile-B',
          merchCardId: 'card-B',
          subtotalCents: 9900,
          status: 'paid',
        },
      ],
    });

    const orders = await getPaidOrdersForMerchCards(
      ['card-A', 'card-B'],
      'profile-A'
    );

    expect(orders.map(order => order.id)).toEqual(['order-A']);
    // Owner predicate must be present in the rendered query.
    expect(captured.orderQuery?.sql).toContain(
      '"merch_orders"."creator_profile_id"'
    );
    expect(captured.orderQuery?.params).toContain('profile-A');
    expect(captured.orderQuery?.params).not.toContain('profile-B');
  });

  it('fails closed (no query) when the owner is missing', async () => {
    installFakeDb({ orders: [] });

    const orders = await getPaidOrdersForMerchCards(['card-A'], '');

    expect(orders).toEqual([]);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});

describe('buildReleaseGmvRowForRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls up paid orders from a release store listing to the autopilot run', async () => {
    mockResolveMerchCardIdsForRun.mockResolvedValue(['card-1', 'card-2']);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'order-1',
            merchCardId: 'card-1',
            subtotalCents: 3200,
            status: 'paid',
          },
          {
            id: 'order-2',
            merchCardId: 'card-2',
            subtotalCents: 1800,
            status: 'shipped',
          },
          {
            id: 'order-3',
            merchCardId: 'card-2',
            subtotalCents: 5000,
            status: 'checkout_created',
          },
        ]),
      }),
    });

    const row = await buildReleaseGmvRowForRun({
      workflowRunId: 'run-1',
      stepOutputs: stepOutputsFor({
        creatorProfileId: 'profile-1',
        creatorUsername: 'tim',
        userId: 'user-1',
        merchCardIds: ['card-1', 'card-2'],
      }),
    });

    expect(row).toMatchObject({
      workflowRunId: 'run-1',
      releaseTitle: 'Release for tim',
      creatorUsername: 'tim',
      merchCardIds: ['card-1', 'card-2'],
      orderCount: 2,
      gmvCents: 5000,
    });
  });

  it('owner-scopes the order query so a foreign card in the listing cannot count', async () => {
    // Listing contains a foreign card; orders for it belong to another tenant.
    mockResolveMerchCardIdsForRun.mockResolvedValue(['card-A', 'card-B']);
    installFakeDb({
      orders: [
        {
          id: 'order-A',
          creatorProfileId: 'profile-A',
          merchCardId: 'card-A',
          subtotalCents: 2500,
          status: 'paid',
        },
        {
          id: 'order-B',
          creatorProfileId: 'profile-B',
          merchCardId: 'card-B',
          subtotalCents: 9900,
          status: 'paid',
        },
      ],
    });

    const row = await buildReleaseGmvRowForRun({
      workflowRunId: 'run-A',
      stepOutputs: stepOutputsFor({
        creatorProfileId: 'profile-A',
        creatorUsername: 'tenant-a',
        userId: 'user-A',
        merchCardIds: ['card-A', 'card-B'],
      }),
    });

    expect(row.gmvCents).toBe(2500);
    expect(row.orderCount).toBe(1);
    expect(captured.orderQuery?.params).toContain('profile-A');
    expect(captured.orderQuery?.params).not.toContain('profile-B');
  });
});

describe('getReleaseGmvSnapshotForUser tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveMerchCardIdsForRun.mockImplementation(
      async (stepOutputs: ReleaseToRevenueRunStepOutputs) =>
        stepOutputs.storeListing?.merchCardIds ?? []
    );
  });

  it('returns only the queried user own orders and totals', async () => {
    installFakeDb({
      // Two tenants each have a run + a paid order. Tenant A's snapshot must
      // surface only A's run and only A's order.
      runs: [
        {
          id: 'run-A',
          stepOutputs: stepOutputsFor({
            creatorProfileId: 'profile-A',
            creatorUsername: 'tenant-a',
            userId: 'user-A',
            merchCardIds: ['card-A'],
          }),
        },
        {
          id: 'run-B',
          stepOutputs: stepOutputsFor({
            creatorProfileId: 'profile-B',
            creatorUsername: 'tenant-b',
            userId: 'user-B',
            merchCardIds: ['card-B'],
          }),
        },
      ],
      orders: [
        {
          id: 'order-A',
          creatorProfileId: 'profile-A',
          merchCardId: 'card-A',
          subtotalCents: 2500,
          status: 'paid',
        },
        // Tenant B's paid order — must never appear in tenant A's snapshot.
        {
          id: 'order-B',
          creatorProfileId: 'profile-B',
          merchCardId: 'card-B',
          subtotalCents: 9900,
          status: 'paid',
        },
      ],
    });

    const snapshot = await getReleaseGmvSnapshotForUser({ userId: 'user-A' });

    expect(snapshot.creatorUsername).toBe('tenant-a');
    expect(snapshot.totalGmvCents).toBe(2500);
    expect(snapshot.releases).toHaveLength(1);
    expect(snapshot.releases[0]?.workflowRunId).toBe('run-A');
    expect(snapshot.releases[0]?.gmvCents).toBe(2500);

    // The run scan is scoped to the queried user, and the order scan to that
    // run's creator. Both predicates must be present in the rendered queries.
    expect(captured.runQuery?.sql).toContain('"workflow_runs"."user_id"');
    expect(captured.runQuery?.params).toContain('user-A');
    expect(captured.orderQuery?.params).toContain('profile-A');
    expect(captured.orderQuery?.params).not.toContain('profile-B');
  });

  it('fails closed for a blank userId instead of returning every tenant', async () => {
    installFakeDb({
      runs: [
        {
          id: 'run-A',
          stepOutputs: stepOutputsFor({
            creatorProfileId: 'profile-A',
            creatorUsername: 'tenant-a',
            userId: 'user-A',
            merchCardIds: ['card-A'],
          }),
        },
      ],
      orders: [
        {
          id: 'order-A',
          creatorProfileId: 'profile-A',
          merchCardId: 'card-A',
          subtotalCents: 2500,
          status: 'paid',
        },
      ],
    });

    const snapshot = await getReleaseGmvSnapshotForUser({ userId: '' });

    expect(snapshot.releases).toEqual([]);
    expect(snapshot.totalGmvCents).toBe(0);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});

describe('resolveReleaseWorkflowRunIdForMerchCard tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('owner-scopes the run lookup to the merch card creator', async () => {
    installFakeDb({
      runs: [
        {
          id: 'run-A',
          stepOutputs: stepOutputsFor({
            creatorProfileId: 'profile-A',
            creatorUsername: 'tenant-a',
            userId: 'user-A',
            merchCardIds: ['card-A'],
          }),
        },
      ],
    });

    const runId = await resolveReleaseWorkflowRunIdForMerchCard(
      'card-A',
      'profile-A'
    );

    expect(runId).toBe('run-A');
    // The JSONB owner predicate binds the creator profile id.
    expect(captured.runQuery?.params).toContain('profile-A');
    expect(captured.runQuery?.params).not.toContain('profile-B');
  });

  it('fails closed (no query) when the creator owner is missing', async () => {
    installFakeDb({ runs: [] });

    const runId = await resolveReleaseWorkflowRunIdForMerchCard('card-A', '');

    expect(runId).toBeNull();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
});
