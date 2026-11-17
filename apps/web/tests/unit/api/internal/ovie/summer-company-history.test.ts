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
vi.mock('@/lib/ovie/company-history/store.server', () => ({
  readCompanyHistory: hoisted.read,
}));
vi.mock('@/lib/ovie/company-history/render.server', () => ({
  renderShippingChart: hoisted.render,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const historyRoute = await import(
  '@/app/api/internal/ovie/summer-company/history/route'
);
const chartRoute = await import(
  '@/app/api/internal/ovie/summer-company/charts/shipping/route'
);

const BASE = 'https://jov.ie/api/internal/ovie/summer-company';

function windowSummary(days: number, total: number | null) {
  return {
    days,
    from: '2026-11-02',
    to: '2026-11-08',
    points: [{ date: '2026-11-08', count: 97, final: false }],
    total,
    priorTotal: 900,
    changePercent: total === null ? null : -31,
    averagePerFullDay: 70,
    best: { date: '2026-11-03', count: 140 },
    complete: total !== null,
    includesPartialToday: true,
  };
}

function history(days: number, total: number | null = 618) {
  const summary = windowSummary(days, total);
  return {
    schema: 'jovie.company-history/v1',
    metric: 'merged_prs',
    observedAt: '2026-11-08T20:04:00.000Z',
    windows: {
      [String(days)]: {
        org: summary,
        Jovie: summary,
        LogYourBody: summary,
        'summer-config': summary,
      },
    },
    cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.verify.mockResolvedValue(true);
});

describe('GET /api/internal/ovie/summer-company/history', () => {
  it('returns 401 without reading the cache when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await historyRoute.GET(new Request(`${BASE}/history`));
    expect(response.status).toBe(401);
    expect(hoisted.read).not.toHaveBeenCalled();
  });

  it('reads the requested windows from the cache', async () => {
    hoisted.read.mockResolvedValue(history(30));
    const response = await historyRoute.GET(
      new Request(`${BASE}/history?days=30,7,30,9`)
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(hoisted.read).toHaveBeenCalledWith([30, 7]);
    await expect(response.json()).resolves.toMatchObject({
      cache: { readPathUpstreamCalls: 0, modelCalls: 0 },
    });
  });

  it('defaults to 7 and 30 days and says unavailable on a cold cache', async () => {
    hoisted.read.mockResolvedValue(null);
    const response = await historyRoute.GET(new Request(`${BASE}/history`));
    expect(hoisted.read).toHaveBeenCalledWith([7, 30]);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'company_history_unavailable',
    });
  });

  it('reports a failed read', async () => {
    hoisted.read.mockRejectedValue(new Error('redis down'));
    const response = await historyRoute.GET(new Request(`${BASE}/history`));
    expect(response.status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalledOnce();
  });
});

describe('GET /api/internal/ovie/summer-company/charts/shipping', () => {
  it('returns 401 without rendering when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await chartRoute.GET(
      new Request(`${BASE}/charts/shipping?days=7`)
    );
    expect(response.status).toBe(401);
    expect(hoisted.render).not.toHaveBeenCalled();
  });

  it('returns the PNG with the numbers it shows as headers', async () => {
    hoisted.read.mockResolvedValue(history(30));
    hoisted.render.mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]))
    );
    const response = await chartRoute.GET(
      new Request(`${BASE}/charts/shipping?days=30`)
    );
    expect(response.status).toBe(200);
    expect(hoisted.read).toHaveBeenCalledWith([30]);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-company-history-total')).toBe('618');
    expect(response.headers.get('x-company-history-prior-total')).toBe('900');
    expect(response.headers.get('x-company-history-change-percent')).toBe(
      '-31'
    );
    expect(response.headers.get('x-company-history-today')).toBe('97');
    expect(response.headers.get('x-company-history-complete')).toBe('true');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([137, 80, 78, 71])
    );
    expect(hoisted.render).toHaveBeenCalledWith({
      windows: history(30).windows['30'],
      observedAt: '2026-11-08T20:04:00.000Z',
    });
  });

  it('marks unknown totals and defaults to 7 days', async () => {
    hoisted.read.mockResolvedValue(history(7, null));
    hoisted.render.mockResolvedValue(new Response(new Uint8Array([1])));
    const response = await chartRoute.GET(
      new Request(`${BASE}/charts/shipping?days=abc`)
    );
    expect(hoisted.read).toHaveBeenCalledWith([7]);
    expect(response.headers.get('x-company-history-total')).toBe('unknown');
    expect(response.headers.get('x-company-history-complete')).toBe('false');
  });

  it('says unavailable on a cold cache or a render failure', async () => {
    hoisted.read.mockResolvedValue(null);
    expect(
      (await chartRoute.GET(new Request(`${BASE}/charts/shipping`))).status
    ).toBe(503);
    hoisted.read.mockResolvedValue(history(7));
    hoisted.render.mockRejectedValue(new Error('font missing'));
    const failed = await chartRoute.GET(new Request(`${BASE}/charts/shipping`));
    expect(failed.status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalledOnce();
  });
});
