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
  const getDeepErrorMessage = vi.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  );

  return {
    whereMock,
    fromMock,
    selectMock,
    doesTableExist,
    captureError,
    captureWarning,
    getAdminStripeOverviewMetrics,
    getDeepErrorMessage,
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

vi.mock('@/lib/db/errors', () => ({
  getDeepErrorMessage: hoisted.getDeepErrorMessage,
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

  it('casts outreach_status to text before filtering by queued email and sent DM statuses', async () => {
    await getAdminFunnelMetrics();

    expect(hoisted.whereMock).toHaveBeenCalled();

    const dialect = new PgDialect();
    const whereSql = hoisted.whereMock.mock.calls.map(
      ([clause]) => dialect.sqlToQuery(clause).sql
    );

    expect(
      whereSql.some(sql => sql.includes("::text IN ('queued', 'dm_sent')"))
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

  it('returns zero when signup attribution columns are missing during a schema rollout', async () => {
    hoisted.whereMock.mockRejectedValue(
      new Error('column "signup_at" does not exist')
    );

    const result = await getAdminFunnelMetrics();

    expect(result.signups7d).toBe(0);
    expect(
      hoisted.captureWarning.mock.calls.some(
        ([message]) =>
          message ===
          '[admin/funnel-metrics] lead attribution columns missing; returning 0 signups count'
      )
    ).toBe(true);
    expect(hoisted.captureError).not.toHaveBeenCalledWith(
      'Error fetching signups count',
      expect.anything()
    );
  });

  it('returns zero when paid attribution columns are missing during a schema rollout', async () => {
    hoisted.whereMock.mockRejectedValue(
      new Error('column "paid_subscription_id" does not exist')
    );

    const result = await getAdminFunnelMetrics();

    expect(result.paidConversions7d).toBe(0);
    expect(
      hoisted.captureWarning.mock.calls.some(
        ([message]) =>
          message ===
          '[admin/funnel-metrics] lead attribution columns missing; returning 0 paid conversions count'
      )
    ).toBe(true);
    expect(hoisted.captureError).not.toHaveBeenCalledWith(
      'Error fetching paid conversions count',
      expect.anything()
    );
  });
});
