import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PR-4: the queue-tick reconciler is the fail-safe that guarantees merch
 * generation reaches a terminal state even when the request-scoped worker
 * was cut off. Options stuck in `pending_mockup` are failed with reason
 * `enrichment_timeout` via a conditional update that never clobbers a late
 * success; batches stuck in `generating` are failed. Bounded, idempotent,
 * and reported at warning level through the capture helper (console +
 * analytics; the production logger is a no-op, and the Sentry filing for
 * this designed-path receipt is intentionally dropped per JOV-12581).
 */

const hoisted = vi.hoisted(() => ({
  optionSet: vi.fn(),
  optionWhere: vi.fn(),
  optionReturning: vi.fn(),
  batchSet: vi.fn(),
  batchWhere: vi.fn(),
  batchReturning: vi.fn(),
  captureWarning: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: vi.fn((table: unknown) => ({
      set: table === merchDesignOptions ? hoisted.optionSet : hoisted.batchSet,
    })),
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: hoisted.captureWarning,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { merchDesignOptions } from '@/lib/db/schema/merch';
import {
  MERCH_GENERATION_STALE_MINUTES,
  MERCH_RECOVERY_BATCH_SIZE,
  reconcileMerchGeneration,
} from './generation-recovery';

const dialect = new PgDialect();
const NOW = new Date('2026-11-10T12:00:00.000Z');
const CUTOFF = new Date(
  NOW.getTime() - MERCH_GENERATION_STALE_MINUTES * 60_000
);

describe('reconcileMerchGeneration (PR-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.optionSet.mockReturnValue({ where: hoisted.optionWhere });
    hoisted.optionWhere.mockReturnValue({ returning: hoisted.optionReturning });
    hoisted.optionReturning.mockResolvedValue([]);
    hoisted.batchSet.mockReturnValue({ where: hoisted.batchWhere });
    hoisted.batchWhere.mockReturnValue({ returning: hoisted.batchReturning });
    hoisted.batchReturning.mockResolvedValue([]);
    hoisted.captureWarning.mockResolvedValue(undefined);
  });

  it('fails options pending past the stale threshold with a terminal enrichment_timeout patch', async () => {
    hoisted.optionReturning.mockResolvedValue([
      { id: 'option-1' },
      { id: 'option-2' },
    ]);

    const result = await reconcileMerchGeneration(NOW);

    expect(result).toEqual({
      staleMockupsFailed: 2,
      staleBatchesFailed: 0,
      recoveredAt: NOW.toISOString(),
    });

    // Terminal patch: mockup_failed with the enrichment_timeout reason.
    const setArg = hoisted.optionSet.mock.calls[0][0];
    const setParams = dialect.sqlToQuery(setArg.qualityReview as SQL).params;
    const patchParam = setParams.find(
      param => typeof param === 'string' && param.includes('mockupStatus')
    );
    expect(patchParam).toBeDefined();
    expect(JSON.parse(patchParam as string)).toMatchObject({
      mockupStatus: 'mockup_failed',
      mockupError: 'enrichment_timeout',
      mockupCompletedAt: NOW.toISOString(),
    });
    expect(setArg.updatedAt).toEqual(NOW);

    // Conditional WHERE: only rows still pending, only rows older than the
    // stale threshold, bounded — fresh pending and already-terminal rows are
    // structurally excluded, and a late success is never clobbered.
    const whereQuery = dialect.sqlToQuery(
      hoisted.optionWhere.mock.calls[0][0] as SQL
    );
    expect(whereQuery.sql).toContain("->> 'mockupStatus' = 'pending_mockup'");
    expect(whereQuery.sql).toContain('limit');
    expect(whereQuery.params).toContainEqual(CUTOFF);
    expect(whereQuery.params).toContain(MERCH_RECOVERY_BATCH_SIZE);

    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    expect(hoisted.captureWarning).toHaveBeenCalledWith(
      expect.stringContaining('merch'),
      undefined,
      expect.objectContaining({ staleMockupsFailed: 2, staleBatchesFailed: 0 })
    );
  });

  it('never clobbers a concurrent late success: the conditional update matches zero rows', async () => {
    // The enrichment worker flipped the option to mockup_ready before the
    // tick ran; the pending-only guard means the update returns nothing.
    hoisted.optionReturning.mockResolvedValue([]);

    const result = await reconcileMerchGeneration(NOW);

    expect(result.staleMockupsFailed).toBe(0);
    expect(result.staleBatchesFailed).toBe(0);
    expect(hoisted.captureWarning).not.toHaveBeenCalled();
  });

  it('fails batches stuck in generating past the stale threshold', async () => {
    hoisted.batchReturning.mockResolvedValue([{ id: 'batch-1' }]);

    const result = await reconcileMerchGeneration(NOW);

    expect(result).toEqual({
      staleMockupsFailed: 0,
      staleBatchesFailed: 1,
      recoveredAt: NOW.toISOString(),
    });
    expect(hoisted.batchSet).toHaveBeenCalledWith({
      status: 'failed',
      error: 'generation_timeout',
      completedAt: NOW,
    });
    const whereQuery = dialect.sqlToQuery(
      hoisted.batchWhere.mock.calls[0][0] as SQL
    );
    expect(whereQuery.sql).toContain("'generating'");
    expect(whereQuery.params).toContainEqual(CUTOFF);
    expect(whereQuery.params).toContain(MERCH_RECOVERY_BATCH_SIZE);

    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    expect(hoisted.captureWarning).toHaveBeenCalledWith(
      expect.stringContaining('merch'),
      undefined,
      expect.objectContaining({ staleBatchesFailed: 1 })
    );
  });

  it('is idempotent: a second run matches nothing and repairs nothing', async () => {
    hoisted.optionReturning.mockResolvedValueOnce([{ id: 'option-1' }]);
    hoisted.batchReturning.mockResolvedValueOnce([{ id: 'batch-1' }]);

    const first = await reconcileMerchGeneration(NOW);
    expect(first).toMatchObject({
      staleMockupsFailed: 1,
      staleBatchesFailed: 1,
    });

    // Second run: both conditional updates match zero rows.
    const second = await reconcileMerchGeneration(NOW);
    expect(second).toMatchObject({
      staleMockupsFailed: 0,
      staleBatchesFailed: 0,
    });
    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
  });
});
