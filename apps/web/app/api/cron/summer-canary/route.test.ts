import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  run: vi.fn(),
  summary: vi.fn(),
  capture: vi.fn(async () => undefined),
  env: {
    OVIE_SUMMER_FOUNDER_APP_USER_ID: '00000000-0000-4000-8000-000000000001',
  } as Record<string, string | undefined>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/cron/auth', () => ({ verifyCronRequest: mocks.verify }));
vi.mock('@/lib/env-server', () => ({ env: mocks.env }));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/ovie/summer-shadow-client', () => ({
  fetchSummerShadow: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-canary', () => ({
  runSummerCanary: mocks.run,
  readSummerTtftSummary: mocks.summary,
  SUMMER_TTFT_TARGET_MS: { p50: 1500, p95: 3000 },
}));

import { GET } from './route';

const request = () => new Request('http://x/api/cron/summer-canary');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockReturnValue(null);
  mocks.env.OVIE_SUMMER_FOUNDER_APP_USER_ID =
    '00000000-0000-4000-8000-000000000001';
});

describe('summer canary cron route', () => {
  it('rejects requests without the cron secret before probing', async () => {
    mocks.verify.mockReturnValue(new Response('no', { status: 401 }));
    expect((await GET(request())).status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('503s when the founder is unconfigured', async () => {
    mocks.env.OVIE_SUMMER_FOUNDER_APP_USER_ID = undefined;
    expect((await GET(request())).status).toBe(503);
  });

  it('returns the probe, the targets and the published percentiles', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      ttftMs: 900,
      headersMs: 300,
      totalMs: 1200,
    });
    mocks.summary.mockResolvedValue([{ route: 'chat', p50: 900 }]);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      ttftMs: 900,
      targets: { p50: 1500, p95: 3000 },
      ttftSummary: [{ route: 'chat', p50: 900 }],
    });
  });

  it('reports a failed probe to error tracking and returns 503', async () => {
    mocks.run.mockResolvedValue({ ok: false, code: 'http_404' });
    expect((await GET(request())).status).toBe(503);
    expect(mocks.capture).toHaveBeenCalledWith(
      'Summer canary failed',
      expect.objectContaining({ message: 'summer_canary_failed:http_404' }),
      expect.objectContaining({ code: 'http_404' })
    );
  });
});
