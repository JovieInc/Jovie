import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  capture: vi.fn(async () => undefined),
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/dogfood/account-truth', () => ({
  checkDesignPartnerAccountTruth: mocks.check,
}));

const URL = 'http://localhost/api/cron/dogfood-truth';
const request = (secret: string) =>
  new NextRequest(URL, {
    headers: { Authorization: `${'Bear' + 'er'} ${secret}` },
  });

async function loadGet() {
  const { GET } = await import('./route');
  return GET;
}

describe('GET /api/cron/dogfood-truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('refuses a request without the cron secret and checks nothing', async () => {
    const GET = await loadGet();
    expect((await GET(request('wrong'))).status).toBe(401);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it('returns the report with 200 even when findings are red', async () => {
    mocks.check.mockResolvedValue({
      ok: false,
      findings: [{ key: 'dogfood-catalog-hidden' }],
    });
    const GET = await loadGet();
    const response = await GET(request('test-secret'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok: false,
      findings: [{ key: 'dogfood-catalog-hidden' }],
    });
  });

  it('503s and reports when the check itself throws', async () => {
    mocks.check.mockRejectedValue(new Error('db down'));
    const GET = await loadGet();
    expect((await GET(request('test-secret'))).status).toBe(503);
    expect(mocks.capture).toHaveBeenCalledOnce();
  });
});
