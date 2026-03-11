import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const whereMock = vi.fn();
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const doesTableExist = vi.fn();
  const captureError = vi.fn();
  const captureWarning = vi.fn();
  const getAdminStripeOverviewMetrics = vi.fn();

  return {
    whereMock,
    fromMock,
    selectMock,
    doesTableExist,
    captureError,
    captureWarning,
    getAdminStripeOverviewMetrics,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.selectMock,
  },
  doesTableExist: hoisted.doesTableExist,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
  captureWarning: hoisted.captureWarning,
}));

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: hoisted.getAdminStripeOverviewMetrics,
}));

import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

describe('getAdminFunnelMetrics outreach query', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.doesTableExist.mockImplementation((tableName: string) =>
      Promise.resolve(tableName === 'leads')
    );

    hoisted.whereMock.mockResolvedValue([{ count: 0 }]);
    hoisted.getAdminStripeOverviewMetrics.mockResolvedValue({
      mrrUsd: 0,
      isAvailable: false,
    });
  });

  it('casts outreach_status to text before filtering by sent statuses', async () => {
    await getAdminFunnelMetrics();

    expect(hoisted.whereMock).toHaveBeenCalled();

    const dialect = new PgDialect();
    const whereSql = hoisted.whereMock.mock.calls.map(
      ([clause]) => dialect.sqlToQuery(clause).sql
    );

    expect(
      whereSql.some(sql => sql.includes("::text IN ('sent', 'dm_sent')"))
    ).toBe(true);
    expect(hoisted.captureError).not.toHaveBeenCalledWith(
      'Error fetching outreach sent count',
      expect.anything()
    );
  });

  it('returns zero when outreach_status is missing during a schema rollout', async () => {
    hoisted.whereMock.mockRejectedValueOnce(
      new Error('column leads.outreach_status does not exist')
    );

    const result = await getAdminFunnelMetrics();

    expect(result.outreachSent7d).toBe(0);
    expect(hoisted.captureError).not.toHaveBeenCalledWith(
      'Error fetching outreach sent count',
      expect.anything()
    );
  });
});
