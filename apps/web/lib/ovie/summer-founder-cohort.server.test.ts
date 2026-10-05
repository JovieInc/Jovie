import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelStageRows: read,
}));
const { getSummerFounderAccounts } = await import(
  './summer-founder-cohort.server'
);

describe('Summer founder account diagnosis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the canonical 30d population and exposes bounded diagnosis without contact data', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 4,
      errors: [],
      rows: [
        {
          id: 'u1',
          displayName: 'Ada',
          email: 'private@example.com',
          enteredAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    });
    const result = await getSummerFounderAccounts(1);
    expect(read).toHaveBeenCalledExactlyOnceWith('accounts_created', '30d', 1);
    expect(result).toEqual({
      metricScope: 'customer_only',
      total: 4,
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      purpose: 'activation_diagnosis',
      hasMore: true,
      rows: [
        { id: 'u1', displayName: 'Ada', enteredAt: '2026-10-01T00:00:00.000Z' },
      ],
    });
  });

  it('preserves an observed empty cohort and missing identity fields', async () => {
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 0,
      errors: [],
      rows: [],
    });
    expect(await getSummerFounderAccounts(50)).toMatchObject({
      total: 0,
      rows: [],
      hasMore: false,
    });
    read.mockResolvedValue({
      timeRange: '30d',
      definitionVersion: 'founder-funnel.v2',
      total: 1,
      errors: [],
      rows: [{ id: 'u2', displayName: null, enteredAt: null }],
    });
    expect(await getSummerFounderAccounts(50)).toMatchObject({
      rows: [{ id: 'u2', displayName: 'Account' }],
      hasMore: false,
    });
  });

  it('reports unavailable when the canonical reader returns its error sentinel', async () => {
    read.mockResolvedValue({
      total: 0,
      rows: [],
      errors: ['database private details'],
    });
    expect(await getSummerFounderAccounts(50)).toEqual({
      status: 'unavailable',
      reason: 'founder_cohort_read_failed',
    });
  });

  it('propagates unexpected failures for the authenticated route to return 503', async () => {
    read.mockRejectedValue(new Error('database unavailable'));
    await expect(getSummerFounderAccounts(50)).rejects.toThrow(
      'database unavailable'
    );
  });
});
