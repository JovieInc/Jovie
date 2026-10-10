import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { select: mockDbSelect },
}));

import { workflowRunOutcomes } from '@/lib/db/schema/connectors';
import { RELEASE_TO_REVENUE_WORKFLOW_KIND } from '@/lib/release-to-revenue/types';
import { loadJovieWorkFeed } from './load-jovie-work-feed';

function queryChain(rows: readonly unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

describe('loadJovieWorkFeed outcome readback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('left-joins release outcomes and exposes measured or unavailable states', async () => {
    const workflowQuery = queryChain([
      {
        id: 'run-measuring',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        status: 'completed',
        currentStep: 'completed',
        stepOutputs: { release: { title: 'Still Measuring' } },
        createdAt: new Date('2026-06-20T12:00:00.000Z'),
        updatedAt: new Date('2026-07-19T12:00:00.000Z'),
        outcomeWindowStart: new Date('2026-06-20T12:00:00.000Z'),
        outcomeWindowEnd: new Date('2026-07-19T12:00:00.000Z'),
        outcomeGmvDeltaCents: 0,
        outcomeClickDelta: 1,
        outcomeDspClickDelta: 0,
        outcomeNewFansDelta: 0,
      },
      {
        id: 'run-zero',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        status: 'completed',
        currentStep: 'completed',
        stepOutputs: { release: { title: 'Quiet Window' } },
        createdAt: new Date('2026-06-20T12:00:00.000Z'),
        updatedAt: new Date('2026-07-20T12:00:00.000Z'),
        outcomeWindowStart: new Date('2026-06-20T12:00:00.000Z'),
        outcomeWindowEnd: new Date('2026-07-20T12:00:00.000Z'),
        outcomeGmvDeltaCents: 0,
        outcomeClickDelta: 0,
        outcomeDspClickDelta: 0,
        outcomeNewFansDelta: 0,
      },
      {
        id: 'run-positive',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        status: 'completed',
        currentStep: 'completed',
        stepOutputs: { release: { title: 'Night Drive' } },
        createdAt: new Date('2026-06-20T12:00:00.000Z'),
        updatedAt: new Date('2026-07-20T12:00:00.000Z'),
        outcomeWindowStart: new Date('2026-06-20T12:00:00.000Z'),
        outcomeWindowEnd: new Date('2026-07-20T12:00:00.000Z'),
        outcomeGmvDeltaCents: 1800,
        outcomeClickDelta: 12,
        outcomeDspClickDelta: 7,
        outcomeNewFansDelta: 3,
      },
      {
        id: 'run-unavailable',
        kind: RELEASE_TO_REVENUE_WORKFLOW_KIND,
        status: 'completed',
        currentStep: 'completed',
        stepOutputs: { release: { title: 'No Snapshot' } },
        createdAt: new Date('2026-06-21T12:00:00.000Z'),
        updatedAt: new Date('2026-06-21T13:00:00.000Z'),
        outcomeWindowStart: null,
        outcomeWindowEnd: null,
        outcomeGmvDeltaCents: null,
        outcomeClickDelta: null,
        outcomeDspClickDelta: null,
        outcomeNewFansDelta: null,
      },
    ]);
    mockDbSelect
      .mockReturnValueOnce(workflowQuery)
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]))
      .mockReturnValueOnce(queryChain([]));

    const items = await loadJovieWorkFeed({
      userId: 'user-1',
      creatorProfileId: 'profile-1',
      limit: 10,
      range: '30d',
    });

    expect(workflowQuery.leftJoin).toHaveBeenCalledWith(
      workflowRunOutcomes,
      expect.anything()
    );
    const workflowWhereSql = new PgDialect().sqlToQuery(
      workflowQuery.where.mock.calls[0]?.[0] as never
    ).sql;
    expect(workflowWhereSql).toContain('workflow_run_outcomes"."window_end');
    expect(
      items.find(item => item.id === 'workflow:run-positive')?.outcome
    ).toEqual({
      state: 'measured_positive',
      metrics: {
        gmvDeltaCents: 1800,
        clickDelta: 12,
        dspClickDelta: 7,
        newFansDelta: 3,
      },
    });
    expect(
      items.find(item => item.id === 'workflow:run-measuring')?.outcome
    ).toEqual({
      state: 'measuring',
      metrics: {
        gmvDeltaCents: 0,
        clickDelta: 1,
        dspClickDelta: 0,
        newFansDelta: 0,
      },
    });
    expect(
      items.find(item => item.id === 'workflow:run-zero')?.outcome
    ).toEqual({
      state: 'measured_zero',
      metrics: {
        gmvDeltaCents: 0,
        clickDelta: 0,
        dspClickDelta: 0,
        newFansDelta: 0,
      },
    });
    expect(
      items.find(item => item.id === 'workflow:run-unavailable')?.outcome
    ).toEqual({ state: 'unavailable', metrics: null });
  });
});

describe('creator work projection', () => {
  it('selects completed records before per-source limits so pending work cannot crowd Done for you out', async () => {
    mockDbSelect.mockReset();
    const timestamp = new Date('2026-10-01T12:00:00Z');
    const rows = [
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `pending-${index}`,
        agentSlug: 'gmail-event-extractor',
        status: 'running',
        completedAt: null,
        startedAt: timestamp,
      })),
      {
        id: 'completed',
        agentSlug: 'gmail-event-extractor',
        status: 'completed',
        completedAt: timestamp,
        startedAt: timestamp,
      },
    ];
    const agents = queryChain([]);
    agents.limit.mockImplementation(async (limit: number) => {
      const query = new PgDialect().sqlToQuery(agents.where.mock.calls[0][0]);
      const selected = query.params.includes('completed')
        ? rows.filter(row => row.status === 'completed')
        : rows;
      return selected.slice(0, limit);
    });
    const chains = [
      queryChain([]),
      agents,
      ...Array.from({ length: 5 }, () => queryChain([])),
    ];
    for (const chain of chains) mockDbSelect.mockReturnValueOnce(chain);
    const items = await loadJovieWorkFeed({
      userId: 'owner',
      creatorProfileId: 'creator-profile',
      limit: 1,
      range: '30d',
      phase: 'completed',
    });
    expect(items.map(item => item.id)).toEqual(['agent:completed']);
    const completedStatuses = [
      ['completed'],
      ['completed'],
      ['executed'],
      ['completed', 'accepted_by_user'],
      ['succeeded'],
      ['live'],
      ['sent'],
    ];
    for (const [index, chain] of chains.entries()) {
      const query = new PgDialect().sqlToQuery(chain.where.mock.calls[0][0]);
      expect(query.sql).toContain('"status"');
      expect(query.params).toEqual(
        expect.arrayContaining(completedStatuses[index])
      );
      expect(chain.where.mock.invocationCallOrder[0]).toBeLessThan(
        chain.limit.mock.invocationCallOrder[0]
      );
    }
  });

  it('removes explicit operator sources before serialization and limits Done for you to completed records', async () => {
    mockDbSelect.mockReset();
    const timestamp = new Date('2026-10-01T12:00:00Z');
    const agents = queryChain([
      ...[
        'gmail-event-extractor',
        'founder.review',
        'ops.healthcheck',
        'ovie.queue',
      ].map(agentSlug => ({
        id: agentSlug,
        agentSlug,
        status: 'completed',
        completedAt: timestamp,
        startedAt: timestamp,
      })),
      {
        id: 'pending',
        agentSlug: 'gmail-event-extractor',
        status: 'running',
        completedAt: null,
        startedAt: timestamp,
      },
    ]);
    const chains = [
      queryChain([]),
      agents,
      queryChain([]),
      queryChain([]),
      queryChain([]),
      queryChain([]),
      queryChain([]),
    ];
    for (const chain of chains) mockDbSelect.mockReturnValueOnce(chain);
    const items = await loadJovieWorkFeed({
      userId: 'owner',
      creatorProfileId: 'creator-profile',
      limit: 20,
      range: '30d',
      phase: 'completed',
    });
    expect(items.map(item => item.id)).toEqual(['agent:gmail-event-extractor']);
    for (const index of [0, 1, 2]) {
      const query = new PgDialect().sqlToQuery(
        chains[index].where.mock.calls[0][0]
      );
      expect(query.params).toContain('owner');
      expect(query.params).toContain('founder.%');
      expect(query.params).toContain('ops.%');
      expect(query.params).toContain('ovie.%');
    }
    for (const index of [4, 5, 6]) {
      const query = new PgDialect().sqlToQuery(
        chains[index].where.mock.calls[0][0]
      );
      expect(query.params).toContain('creator-profile');
    }
  });
});
