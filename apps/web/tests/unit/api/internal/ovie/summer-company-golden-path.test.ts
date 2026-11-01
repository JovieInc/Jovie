import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  verify: vi.fn(),
  read: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-oidc.server', () => ({
  verifySummerOidcRequest: hoisted.verify,
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({}),
}));
vi.mock(
  '@/lib/ovie/certifications/prod-golden-path-ledger',
  async importOriginal => ({
    ...(await importOriginal<
      typeof import('@/lib/ovie/certifications/prod-golden-path-ledger')
    >()),
    readProdGoldenPathLedger: hoisted.read,
  })
);
vi.mock('@/lib/error-tracking', () => ({ captureError: hoisted.captureError }));

const route = await import(
  '@/app/api/internal/ovie/summer-company/golden-path/route'
);
const URL = 'https://jov.ie/api/internal/ovie/summer-company/golden-path';

describe('GET /api/internal/ovie/summer-company/golden-path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.verify.mockResolvedValue(true);
  });

  it('returns 401 without reading the ledger when OIDC fails', async () => {
    hoisted.verify.mockResolvedValue(false);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(401);
    expect(hoisted.read).not.toHaveBeenCalled();
  });
  it('returns the per-surface status, missing when no ledger exists', async () => {
    hoisted.read.mockResolvedValue(null);
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      schema: 'jovie.summer-golden-path-status/v1',
      ledger: 'missing',
      total: 8,
      certified: 0,
    });
  });
  it('returns 503 when the ledger read fails', async () => {
    hoisted.read.mockRejectedValue(new Error('db'));
    const response = await route.GET(new Request(URL));
    expect(response.status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
