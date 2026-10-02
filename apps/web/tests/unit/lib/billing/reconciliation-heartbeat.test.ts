import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockInsertValues = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: mockInsertValues,
    })),
  },
}));

import { recordReconciliationHeartbeat } from '@/lib/billing/reconciliation-heartbeat';

describe('recordReconciliationHeartbeat', () => {
  beforeEach(() => {
    mockInsertValues.mockReset();
    mockInsertValues.mockResolvedValue(undefined);
  });

  it('writes a system reconciliation row with no user id', async () => {
    await recordReconciliationHeartbeat({
      stats: {
        usersChecked: 4,
        mismatches: 0,
        fixed: 0,
        errors: 0,
        orphanedSubscriptions: 0,
        staleCustomers: 0,
      },
      durationMs: 1200,
      replay: { processed: 1, blocked: 0, failed: 0 },
    });

    expect(mockInsertValues).toHaveBeenCalledWith({
      userId: null,
      eventType: 'reconciliation_run',
      previousState: {},
      newState: {
        usersChecked: 4,
        mismatches: 0,
        fixed: 0,
        errors: 0,
      },
      source: 'reconciliation',
      metadata: {
        heartbeat: true,
        durationMs: 1200,
        replay: { processed: 1, blocked: 0, failed: 0 },
      },
    });
  });
});
