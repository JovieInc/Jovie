import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  read: vi.fn(),
  render: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/company-history/daily-metrics.server', () => ({
  readCompanyMetrics: hoisted.read,
}));
vi.mock('@/lib/ovie/company-history/render.server', () => ({
  renderMetricChart: hoisted.render,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));

const metricsRoute = await import(
  '@/app/api/internal/ovie/summer-company/metrics/route'
);
const chartRoute = await import(
  '@/app/api/internal/ovie/summer-company/charts/metric/route'
);

const BASE = 'https://jov.ie/api/internal/ovie/summer-company';

function readback(total: number | null = 1234) {
  const summary = {
    days: 30,
    from: '2026-10-10',
    to: '2026-11-08',
    points: [{ date: '2026-11-08', count: 2083, final: false }],
    total,
    priorTotal: 1000,
    changePercent: total === null ? null : 23,
    averagePerFullDay: 41,
    best: null,
    complete: total !== null,
    includesPartialToday: true,
  };
  return {
    schema: 'jovie.company-metrics/v1',
    timezone: 'America/Los_Angeles',
    observedAt: '2026-11-08T20:04:00.000Z',
    metrics: {
      ai_spend: {
        title: 'AI spend',
        unit: 'AI Gateway spend',
        format: 'usd_cents',
        higherIsBetter: false,
        definition: 'x',
        observedAt: '2026-11-08T20:04:00.000Z',
        lastSync: null,
        windows: { '30': summary },
      },
    },
    cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.verify.mockResolvedValue(true);
});

describe('GET /api/internal/ovie/summer-company/metrics', () => {
  it('returns 401 without reading when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await metricsRoute.GET(new NextRequest(`${BASE}/metrics`));
    expect(response.status).toBe(401);
    expect(hoisted.read).not.toHaveBeenCalled();
  });

  it('reads the asked metrics and windows from the cache', async () => {
    hoisted.read.mockResolvedValue(readback());
    const response = await metricsRoute.GET(
      new NextRequest(`${BASE}/metrics?metric=ai_spend,nope&days=30`)
    );
    expect(response.status).toBe(200);
    expect(hoisted.read).toHaveBeenCalledWith(['ai_spend'], [30]);
    await expect(response.json()).resolves.toMatchObject({
      cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
    });
  });

  it('says unavailable on a cold cache or a failed read', async () => {
    hoisted.read.mockResolvedValue(null);
    expect(
      (await metricsRoute.GET(new NextRequest(`${BASE}/metrics`))).status
    ).toBe(503);
    hoisted.read.mockRejectedValue(new Error('redis down'));
    expect(
      (await metricsRoute.GET(new NextRequest(`${BASE}/metrics`))).status
    ).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalledOnce();
  });
});

describe('GET /api/internal/ovie/summer-company/charts/metric', () => {
  it('rejects an unknown metric before reading', async () => {
    const response = await chartRoute.GET(
      new NextRequest(`${BASE}/charts/metric?metric=__proto__`)
    );
    expect(response.status).toBe(400);
    expect(hoisted.read).not.toHaveBeenCalled();
  });

  it('returns the PNG with the numbers it shows as headers', async () => {
    hoisted.read.mockResolvedValue(readback());
    hoisted.render.mockResolvedValue(new Response(new Uint8Array([137, 80])));
    const response = await chartRoute.GET(
      new NextRequest(`${BASE}/charts/metric?metric=ai_spend&days=30`)
    );
    expect(response.status).toBe(200);
    expect(hoisted.read).toHaveBeenCalledWith(['ai_spend'], [30]);
    expect(response.headers.get('x-company-history-metric')).toBe('ai_spend');
    expect(response.headers.get('x-company-history-format')).toBe('usd_cents');
    expect(response.headers.get('x-company-history-total')).toBe('1234');
    expect(response.headers.get('x-company-history-today')).toBe('2083');
    expect(hoisted.render).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'AI spend', format: 'usd_cents' })
    );
  });

  it('says unavailable when the metric has no cached days or render fails', async () => {
    hoisted.read.mockResolvedValue({ ...readback(), metrics: {} });
    expect(
      (
        await chartRoute.GET(
          new NextRequest(`${BASE}/charts/metric?metric=signups`)
        )
      ).status
    ).toBe(503);
    hoisted.read.mockResolvedValue(readback());
    hoisted.render.mockRejectedValue(new Error('font'));
    expect(
      (
        await chartRoute.GET(
          new NextRequest(`${BASE}/charts/metric?metric=ai_spend&days=30`)
        )
      ).status
    ).toBe(503);
  });
});
