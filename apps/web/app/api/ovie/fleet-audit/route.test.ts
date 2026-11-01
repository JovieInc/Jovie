import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  resolvePrincipal: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.resolvePrincipal,
}));

const { GET } = await import('./route');
const admin = { authenticated: true, isAdmin: true, scopes: [] };
const url = 'https://jov.ie/api/ovie/fleet-audit';
const SECRET = 'audit-read-secret';

const SUMMARY = {
  ok: true,
  budget: { bytes_month: 1, limit_bytes: 10, pct: 10 },
  dangerous: [],
  unattributed: [],
  counts: { events_24h: 1, events_7d: 2 },
};
const WHO = { ok: true, events: [], correlations: [] };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('FLEET_AUDIT_READ_TOKEN', SECRET);
  vi.stubEnv('FLEET_AUDIT_URL', '');
  mocks.resolvePrincipal.mockResolvedValue(admin);
  fetchMock.mockImplementation(
    async input =>
      new Response(
        JSON.stringify(String(input).includes('/v1/who') ? WHO : SUMMARY)
      )
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/api/ovie/fleet-audit', () => {
  it('rejects unauthenticated callers without calling the Worker', async () => {
    mocks.resolvePrincipal.mockResolvedValue({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });
    const response = await GET(new Request(url));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-admins without calling the Worker', async () => {
    mocks.resolvePrincipal.mockResolvedValue({ ...admin, isAdmin: false });
    const response = await GET(new Request(url));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies the summary with the server-side bearer and never leaks it', async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(calledUrl)).toBe(
      'https://jovie-fleet-audit.tim-fd8.workers.dev/v1/summary'
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SECRET}`
    );
    const text = await response.text();
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toMatchObject({
      state: 'ok',
      counts: { events_24h: 1 },
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('proxies a target search with since and limit', async () => {
    const response = await GET(
      new Request(
        `${url}?target=Jovie%23123&since=2026-10-01T00:00:00Z&limit=20`
      )
    );
    expect(response.status).toBe(200);
    const called = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(called.pathname).toBe('/v1/who');
    expect(called.searchParams.get('target')).toBe('Jovie#123');
    expect(called.searchParams.get('since')).toBe('2026-10-01T00:00:00.000Z');
    expect(called.searchParams.get('limit')).toBe('20');
  });

  it('returns a not_configured state, not an error, when the token is missing', async () => {
    vi.stubEnv('FLEET_AUDIT_READ_TOKEN', '');
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed queries before calling the Worker', async () => {
    for (const query of [
      '?target=x&limit=500',
      '?target=x&limit=abc',
      '?target=x&since=nope',
    ]) {
      const response = await GET(new Request(`${url}${query}`));
      expect(response.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps Worker failures to 503 without leaking upstream detail', async () => {
    fetchMock.mockResolvedValue(
      new Response('boom ' + SECRET, { status: 500 })
    );
    const response = await GET(new Request(url));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(SECRET);
  });

  it('maps a network error to 503', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    const response = await GET(new Request(url));
    expect(response.status).toBe(503);
  });
});
