import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ withDbSession: vi.fn() }));
vi.mock('@/lib/auth/profile-access', () => ({
  getExactProfileAccess: vi.fn(),
  isCanonicalUuid: (value: unknown) =>
    typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
}));
vi.mock('@/lib/cache/profile', () => ({ invalidateProfileCache: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import {
  deferredLaunchRefusal,
  isDeferredLaunchRoute,
} from '@/lib/launch/launch-enforcement';

describe('isDeferredLaunchRoute', () => {
  it('classifies manifest-driven deferred handler routes', () => {
    expect(isDeferredLaunchRoute('/api/dashboard/shop')).toBe(true);
    expect(isDeferredLaunchRoute('/api/dashboard/rider')).toBe(true);
    expect(isDeferredLaunchRoute('/api/artist-rules')).toBe(true);
  });

  it('keeps launch-scope and unknown routes executable', () => {
    expect(isDeferredLaunchRoute('/api/dashboard/social-links')).toBe(false);
    expect(isDeferredLaunchRoute('/api/billing/checkout-session')).toBe(false);
    expect(isDeferredLaunchRoute('/api/not/in/manifest')).toBe(false);
  });
});

describe('deferredLaunchRefusal', () => {
  it('returns a bounded no-store 404 for deferred routes', async () => {
    const refusal = deferredLaunchRefusal('/api/dashboard/shop');
    expect(refusal).not.toBeNull();
    expect(refusal!.status).toBe(404);
    expect(refusal!.headers.get('cache-control')).toContain('no-store');
    await expect(refusal!.json()).resolves.toEqual({ error: 'Not found' });
  });

  it('returns null for non-deferred routes', () => {
    expect(deferredLaunchRefusal('/api/dashboard/social-links')).toBeNull();
    expect(deferredLaunchRefusal('/api/billing/status')).toBeNull();
  });
});

describe('deferred artist launch entry points refuse execution', () => {
  it('refuses every enforced method of each deferred route before auth or db work', async () => {
    const enforced = [
      ['api/dashboard/shop', ['GET', 'PUT']],
      ['api/dashboard/rider', ['GET', 'PUT']],
      ['api/artist-rules', ['DELETE', 'GET', 'PATCH', 'POST']],
    ] as const;
    for (const [routePath, methods] of enforced) {
      const mod = (await import(`@/app/${routePath}/route`)) as Record<
        string,
        (request: Request) => Promise<Response>
      >;
      for (const method of methods) {
        const handler = mod[method];
        expect(handler, `${method} ${routePath}`).toBeTypeOf('function');
        const response = await handler(
          new Request(`https://jov.ie/${routePath}`, { method })
        );
        expect(response.status, `${method} /${routePath}`).toBe(404);
        await expect(response.json()).resolves.toEqual({ error: 'Not found' });
      }
    }
  });
});
