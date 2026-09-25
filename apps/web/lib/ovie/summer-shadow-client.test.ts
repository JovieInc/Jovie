import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSummerEveCallerOrigin: vi.fn(async () => ({
    origin: 'https://summer.jov.ie',
    deploymentId: 'dpl_live',
  })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@vercel/oidc', () => ({
  getVercelOidcToken: vi.fn(async () => 'test-oidc'),
}));
vi.mock('@/lib/http/bounded-fetch', () => ({
  boundedFetch: vi.fn(async () => Response.json({ ok: true })),
}));
vi.mock('./summer-production-pin', () => ({
  resolveSummerEveCallerOrigin: mocks.resolveSummerEveCallerOrigin,
  SummerPinInvalidError: class SummerPinInvalidError extends Error {
    readonly code = 'summer_pin_invalid';
  },
}));

import { getVercelOidcToken } from '@vercel/oidc';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import {
  resolveSummerEveCallerOrigin,
  SummerPinInvalidError,
} from './summer-production-pin';
import { fetchSummerShadow } from './summer-shadow-client';

const PINNED_ORIGIN = 'https://jovie-eve-shadow-abc123-jovie.vercel.app';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.resolveSummerEveCallerOrigin.mockResolvedValue({
    origin: 'https://summer.jov.ie',
    deploymentId: 'dpl_live',
  });
});

describe('Summer production OIDC transport', () => {
  it('rejects non-production callers and paths outside the shadow channel', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(
      fetchSummerShadow('/ovie/v1/summer-shadow/events')
    ).rejects.toThrow('production_origin_required');
    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(fetchSummerShadow('https://other.test')).rejects.toThrow(
      'invalid_shadow_path'
    );
    expect(boundedFetch).not.toHaveBeenCalled();
  });

  it('uses the production alias, short-lived OIDC, no redirects and no mutation retries', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', '');
    vi.stubEnv('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID', '');
    await fetchSummerShadow('/ovie/v1/summer-shadow/events');
    expect(resolveSummerEveCallerOrigin).toHaveBeenCalledWith({
      pinnedOrigin: '',
      pinnedDeploymentId: '',
    });
    vi.mocked(boundedFetch).mockClear();
    vi.mocked(getVercelOidcToken).mockClear();
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', PINNED_ORIGIN);
    await fetchSummerShadow('/ovie/v1/summer-shadow/events', {
      method: 'POST',
      body: '{}',
    });
    expect(getVercelOidcToken).toHaveBeenCalledOnce();
    expect(boundedFetch).toHaveBeenCalledWith(
      new URL('https://summer.jov.ie/ovie/v1/summer-shadow/events'),
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        retry: { maxRetries: 0, baseDelayMs: 0 },
        headers: expect.objectContaining({
          authorization: 'Bearer test-oidc',
          'x-vercel-trusted-oidc-idp-token': 'test-oidc',
        }),
      })
    );
    const headers = vi.mocked(boundedFetch).mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(headers).not.toHaveProperty('x-vercel-protection-bypass');
    expect(headers).not.toHaveProperty('x-vercel-set-bypass-cookie');
  });

  it('sends the eve-shadow automation bypass secret only as a header', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', PINNED_ORIGIN);
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'jovie-project-secret');
    vi.stubEnv('OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET', 'eve-shadow-secret');
    await fetchSummerShadow('/ovie/v1/summer-shadow/events', {
      method: 'POST',
      headers: { 'x-vercel-set-bypass-cookie': 'true' },
      body: '{}',
    });
    const [url, init] = vi.mocked(boundedFetch).mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://summer.jov.ie/ovie/v1/summer-shadow/events'
    );
    expect(String(url)).not.toContain('eve-shadow-secret');
    expect(String(url)).not.toContain('jovie-project-secret');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-vercel-protection-bypass']).toBe('eve-shadow-secret');
    expect(headers['x-vercel-protection-bypass']).not.toBe(
      'jovie-project-secret'
    );
    expect(headers).not.toHaveProperty('x-vercel-set-bypass-cookie');
  });

  it('ignores a blank bypass secret and rejects a header-unsafe one before fetch', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN', PINNED_ORIGIN);
    vi.stubEnv('OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET', '   ');
    await fetchSummerShadow('/ovie/v1/summer-shadow/events');
    const blankHeaders = vi.mocked(boundedFetch).mock.calls[0]?.[1]?.headers as
      | Record<string, string>
      | undefined;
    expect(blankHeaders).not.toHaveProperty('x-vercel-protection-bypass');

    vi.stubEnv('OVIE_SUMMER_EVE_PROTECTION_BYPASS_SECRET', 'bad\nsecret');
    await expect(
      fetchSummerShadow('/ovie/v1/summer-shadow/events')
    ).rejects.toThrow('invalid_eve_protection_bypass_secret');
    expect(boundedFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 503 and rethrows unexpected pin failures before OIDC', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.resolveSummerEveCallerOrigin.mockRejectedValueOnce(
      new SummerPinInvalidError(
        {
          projectId: 'prj_test',
          environment: 'production',
          deploymentId: null,
        },
        { status: 404 }
      )
    );
    const response = await fetchSummerShadow('/ovie/v1/summer-shadow/events');
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'summer_pin_invalid',
    });
    const failure = new Error('pin checker crashed');
    mocks.resolveSummerEveCallerOrigin.mockRejectedValueOnce(failure);
    await expect(
      fetchSummerShadow('/ovie/v1/summer-shadow/events')
    ).rejects.toBe(failure);
    expect(boundedFetch).not.toHaveBeenCalled();
    expect(getVercelOidcToken).not.toHaveBeenCalled();
  });
});
