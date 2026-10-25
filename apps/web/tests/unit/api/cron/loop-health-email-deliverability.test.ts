import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyCronRequestMock = vi.fn();
const loadMetricsMock = vi.fn();
const captureErrorMock = vi.fn();

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: verifyCronRequestMock,
}));
vi.mock('@/lib/loop-health/email-deliverability', () => ({
  loadEmailDeliverabilityMetrics: loadMetricsMock,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: captureErrorMock }));

describe('GET /api/cron/loop-health/email-deliverability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCronRequestMock.mockReturnValue(null);
  });

  it('rejects unauthenticated callers before touching the database', async () => {
    verifyCronRequestMock.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
    const { GET } = await import(
      '@/app/api/cron/loop-health/email-deliverability/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(401);
    expect(loadMetricsMock).not.toHaveBeenCalled();
  });

  it('returns aggregate numbers only, uncached', async () => {
    loadMetricsMock.mockResolvedValue({
      windowDays: 7,
      attempts7d: 10,
      bounced7d: 0,
      complaints7d: 0,
      bounceRatePct: 0,
      complaintRatePct: 0,
      deliveryLatencyP95Sec: 4.1,
      latencySamples7d: 3,
    });
    const { GET } = await import(
      '@/app/api/cron/loop-health/email-deliverability/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.attempts7d).toBe(10);
    expect(Object.keys(body).sort()).toEqual(
      [
        'attempts7d',
        'bounceRatePct',
        'bounced7d',
        'checkedAt',
        'complaintRatePct',
        'complaints7d',
        'deliveryLatencyP95Sec',
        'latencySamples7d',
        'windowDays',
      ].sort()
    );
  });

  it('reports a 500 and captures the error when the query fails', async () => {
    loadMetricsMock.mockRejectedValue(new Error('db down'));
    const { GET } = await import(
      '@/app/api/cron/loop-health/email-deliverability/route'
    );
    const response = await GET(new Request('https://jov.ie/x'));
    expect(response.status).toBe(500);
    expect(captureErrorMock).toHaveBeenCalled();
  });
});
