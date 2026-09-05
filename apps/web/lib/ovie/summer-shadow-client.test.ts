import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(async () => 'test-oidc'),
}));
vi.mock('@/lib/http/bounded-fetch', () => ({
  boundedFetch: vi.fn(async () => Response.json({ ok: true })),
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { fetchSummerShadow } from './summer-shadow-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('Summer production OIDC transport', () => {
  it('rejects non-production callers and paths outside the shadow channel', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(
      fetchSummerShadow('/ovie/v1/summer-shadow/events')
    ).rejects.toThrow('production_origin_required');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', '');
    await expect(
      fetchSummerShadow('/ovie/v1/summer-shadow/events')
    ).rejects.toThrow('exact_eve_deployment_required');
    vi.stubEnv(
      'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
      'https://jovie-eve-shadow-abc123-jovie.vercel.app'
    );
    await expect(fetchSummerShadow('https://other.test')).rejects.toThrow(
      'invalid_shadow_path'
    );
    expect(boundedFetch).not.toHaveBeenCalled();
  });
  it('uses the fixed origin, short-lived OIDC, no redirects and no mutation retries', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv(
      'OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN',
      'https://jovie-eve-shadow-abc123-jovie.vercel.app'
    );
    await fetchSummerShadow('/ovie/v1/summer-shadow/events', {
      method: 'POST',
      body: '{}',
    });
    expect(getVercelOidcToken).toHaveBeenCalledOnce();
    expect(boundedFetch).toHaveBeenCalledWith(
      new URL(
        'https://jovie-eve-shadow-abc123-jovie.vercel.app/ovie/v1/summer-shadow/events'
      ),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        retry: { maxRetries: 0, baseDelayMs: 0 },
        headers: expect.objectContaining({ authorization: 'Bearer test-oidc' }),
      })
    );
  });
});
