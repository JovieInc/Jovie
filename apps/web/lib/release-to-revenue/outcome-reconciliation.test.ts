import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockRecordWorkflowRunOutcome, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockRecordWorkflowRunOutcome: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }));

vi.mock('@/lib/db', () => ({
  db: { select: mockDbSelect },
}));

vi.mock('@/lib/connectors/workflows/outcome-attribution', () => ({
  RELEASE_OUTCOME_MEASUREMENT_WINDOW_DAYS: 30,
  recordWorkflowRunOutcome: mockRecordWorkflowRunOutcome,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: mockLoggerWarn },
}));

import {
  MAX_RELEASE_OUTCOME_RECONCILIATIONS_PER_TICK,
  needsReleaseOutcomeReconciliation,
  reconcileReleaseWorkflowRunOutcomes,
} from './outcome-reconciliation';

interface CandidateFixture {
  readonly workflowRunId: string;
  readonly windowStart: Date | null;
  readonly windowEnd: Date | null;
}

function candidateQuery(candidates: readonly CandidateFixture[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(candidates),
  };
}

function installCandidates(candidates: readonly CandidateFixture[]) {
  const chain = candidateQuery(candidates);
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

describe('needsReleaseOutcomeReconciliation', () => {
  const windowStart = new Date('2026-06-20T12:00:00.000Z');
  const maturityAt = new Date('2026-07-20T12:00:00.000Z');

  it.each([
    {
      name: 'requires the first snapshot',
      windowStart: null,
      windowEnd: null,
      asOf: windowStart,
      expected: true,
    },
    {
      name: 'does not repeat the same as-of snapshot',
      windowStart,
      windowEnd: new Date('2026-06-21T12:00:00.000Z'),
      asOf: new Date('2026-06-21T12:00:00.000Z'),
      expected: false,
    },
    {
      name: 'reconciles at the exact maturity boundary',
      windowStart,
      windowEnd: new Date('2026-07-19T12:00:00.000Z'),
      asOf: maturityAt,
      expected: true,
    },
    {
      name: 'stops after the mature snapshot',
      windowStart,
      windowEnd: maturityAt,
      asOf: new Date('2026-08-20T12:00:00.000Z'),
      expected: false,
    },
  ] as const)('$name', ({ asOf, expected, windowEnd, windowStart }) => {
    expect(
      needsReleaseOutcomeReconciliation({ asOf, windowEnd, windowStart })
    ).toBe(expected);
  });
});

describe('reconcileReleaseWorkflowRunOutcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecordWorkflowRunOutcome.mockResolvedValue({ workflowRunId: 'run' });
  });

  it('repeats the exact run only when the bounded as-of endpoint advances', async () => {
    const windowStart = new Date('2026-06-20T12:00:00.000Z');
    const firstAsOf = new Date('2026-06-21T12:00:00.000Z');
    const nextAsOf = new Date('2026-06-22T12:00:00.000Z');
    mockDbSelect
      .mockReturnValueOnce(
        candidateQuery([
          { workflowRunId: 'run-1', windowStart: null, windowEnd: null },
        ])
      )
      .mockReturnValueOnce(
        candidateQuery([
          { workflowRunId: 'run-1', windowStart, windowEnd: firstAsOf },
        ])
      )
      .mockReturnValueOnce(
        candidateQuery([
          { workflowRunId: 'run-1', windowStart, windowEnd: firstAsOf },
        ])
      );

    await reconcileReleaseWorkflowRunOutcomes({ asOf: firstAsOf });
    await reconcileReleaseWorkflowRunOutcomes({ asOf: firstAsOf });
    await reconcileReleaseWorkflowRunOutcomes({ asOf: nextAsOf });

    expect(mockRecordWorkflowRunOutcome).toHaveBeenNthCalledWith(1, 'run-1', {
      asOf: firstAsOf,
    });
    expect(mockRecordWorkflowRunOutcome).toHaveBeenNthCalledWith(2, 'run-1', {
      asOf: nextAsOf,
    });
    expect(mockRecordWorkflowRunOutcome).toHaveBeenCalledTimes(2);
  });

  it('isolates one failed run and continues the bounded batch', async () => {
    const chain = installCandidates([
      { workflowRunId: 'run-fails', windowStart: null, windowEnd: null },
      { workflowRunId: 'run-succeeds', windowStart: null, windowEnd: null },
    ]);
    mockRecordWorkflowRunOutcome
      .mockRejectedValueOnce(new Error('query failed'))
      .mockResolvedValueOnce({ workflowRunId: 'run-succeeds' });

    const summary = await reconcileReleaseWorkflowRunOutcomes({ limit: 100 });

    expect(chain.limit).toHaveBeenCalledWith(
      MAX_RELEASE_OUTCOME_RECONCILIATIONS_PER_TICK
    );
    const candidateQuery = new PgDialect().sqlToQuery(
      chain.where.mock.calls[0]?.[0] as never
    );
    expect(candidateQuery.sql).toContain('jsonb_path_exists');
    expect(candidateQuery.sql).toContain('distributionDrafts.items');
    expect(candidateQuery.sql).toContain('dispatched');
    expect(candidateQuery.params).toContain(30);
    expect(mockRecordWorkflowRunOutcome).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      scanned: 2,
      attempted: 2,
      reconciled: 1,
      unavailable: 0,
      failed: 1,
    });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[release-outcome-reconciliation] run failed',
      expect.objectContaining({ workflowRunId: 'run-fails' })
    );
  });

  it('does not rewrite a snapshot that already reached maturity', async () => {
    installCandidates([
      {
        workflowRunId: 'run-mature',
        windowStart: new Date('2026-06-20T12:00:00.000Z'),
        windowEnd: new Date('2026-07-20T12:00:00.000Z'),
      },
    ]);

    const summary = await reconcileReleaseWorkflowRunOutcomes({
      asOf: new Date('2026-08-20T12:00:00.000Z'),
    });

    expect(summary.attempted).toBe(0);
    expect(mockRecordWorkflowRunOutcome).not.toHaveBeenCalled();
  });
});
