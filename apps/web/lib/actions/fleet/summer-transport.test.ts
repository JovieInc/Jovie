import { afterEach, describe, expect, it, vi } from 'vitest';

const { refreshToken, defaultFetch } = vi.hoisted(() => ({
  refreshToken: vi.fn(() => {
    throw new Error('developer_refresh_forbidden');
  }),
  defaultFetch: vi.fn(async () => new Response(null, { status: 202 })),
}));
vi.mock('@vercel/oidc', async importOriginal => ({
  ...(await importOriginal<typeof import('@vercel/oidc')>()),
  getVercelOidcToken: refreshToken,
}));
vi.mock('@/lib/ovie/summer-production-pin', () => ({
  resolveSummerEveCallerOrigin: async () => ({
    origin: 'https://summer.jov.ie',
  }),
}));
vi.mock('@/lib/http/bounded-fetch', () => ({ boundedFetch: defaultFetch }));
afterEach(() => {
  vi.unstubAllEnvs();
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env-server', () => ({ env: { VERCEL_ENV: 'production' } }));
const { sendSummerFleetWake } = await import('./summer-transport');
const profileId = '11111111-1111-4111-a111-111111111111';
const eventId = '22222222-2222-4222-a222-222222222222';
function dependencies() {
  return {
    production: true,
    origin: vi.fn(async () => ({
      origin: 'https://summer.jov.ie' as const,
      deploymentId: 'dpl_test',
    })),
    token: vi.fn(async () => 'unit-oidc'),
    headers: vi.fn((token: string) => ({ authorization: `Bearer ${token}` })),
    fetch: vi.fn(async () => new Response(null, { status: 202 })),
  };
}
describe('fixed Summer fleet wake transport', () => {
  it('sends only durable IDs after source-bound origin resolution, with no redirects or retries', async () => {
    const deps = dependencies();
    await sendSummerFleetWake(profileId, eventId, deps);
    expect(deps.fetch).toHaveBeenCalledWith(
      new URL('https://summer.jov.ie/ovie/v1/summer-fleet/events'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({ profileId, eventId }),
        headers: {
          authorization: 'Bearer unit-oidc',
          'content-type': 'application/json',
        },
        timeoutMs: 25000,
        retry: { maxRetries: 0, baseDelayMs: 0 },
      })
    );
  });
  it('does not obtain a credential or transmit when production identity cannot be established', async () => {
    const deps = dependencies();
    await expect(
      sendSummerFleetWake(profileId, eventId, { ...deps, production: false })
    ).rejects.toThrow('production_origin_required');
    deps.origin.mockRejectedValue(new Error('summer_pin_invalid'));
    await expect(sendSummerFleetWake(profileId, eventId, deps)).rejects.toThrow(
      'summer_pin_invalid'
    );
    expect(deps.token).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it('requires a current production token without developer refresh', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', undefined);
    await expect(sendSummerFleetWake(profileId, eventId)).rejects.toThrow(
      "The 'x-vercel-oidc-token' header is missing"
    );
    expect(defaultFetch).not.toHaveBeenCalled();
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'production-context-token');
    await sendSummerFleetWake(profileId, eventId);
    expect(defaultFetch).toHaveBeenCalledExactlyOnceWith(
      new URL('https://summer.jov.ie/ovie/v1/summer-fleet/events'),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer production-context-token',
        }),
      })
    );
    expect(refreshToken).not.toHaveBeenCalled();
  });

  it('fails on delivery denial so durable reconciliation retains responsibility', async () => {
    const deps = dependencies();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    deps.fetch.mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 503 })
    );
    await expect(sendSummerFleetWake(profileId, eventId, deps)).rejects.toThrow(
      'summer_fleet_wake_unavailable'
    );
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
