import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyCronRequestMock = vi.fn();
const loadMetricsMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/loop-health/billing-health', () => ({
  loadBillingHealthMetrics: loadMetricsMock,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: captureErrorMock }));

describe('GET /api/cron/loop-health/billing-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
  });

  it('rejects unauthenticated callers before touching the database', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import(
      '@/app/api/cron/loop-health/billing-health/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(401);
    expect(loadMetricsMock).not.toHaveBeenCalled();
  });

  it('returns aggregate numbers only, uncached', async () => {
    loadMetricsMock.mockResolvedValue({
      windowDays: 30,
      invoiceAttempts30d: 0,
      failedInvoices30d: 0,
      failureRatePct: null,
      maturedFailed: 0,
      recoveredOfMatured: 0,
      recoveryRatePct: null,
      dunningStalledInvoices: 0,
      truncated: false,
    });
    const { GET } = await import(
      '@/app/api/cron/loop-health/billing-health/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.failureRatePct).toBeNull();
    expect(JSON.stringify(body)).not.toMatch(/in_|cus_|sub_/);
  });

  it('reports a 500 and captures the error when the query fails', async () => {
    loadMetricsMock.mockRejectedValue(new Error('db down'));
    const { GET } = await import(
      '@/app/api/cron/loop-health/billing-health/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalled();
  });
});
