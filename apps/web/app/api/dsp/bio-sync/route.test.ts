import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: vi.fn() }));
vi.mock('@/lib/copy/outbound-floor', () => ({
  CopyFloorViolationError: class CopyFloorViolationError extends Error {},
}));
vi.mock('@/lib/dsp-bio-sync/ownership', () => ({ getOwnedProfile: vi.fn() }));
vi.mock('@/lib/dsp-bio-sync/service', () => ({ syncBioToDsps: vi.fn() }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

import { GET } from './route';

describe('GET /api/dsp/bio-sync', () => {
  it('lists enabled providers only', async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.providers.length).toBeGreaterThan(0);
    expect(body.enabledCount).toBe(body.providers.length);
    for (const provider of body.providers) {
      expect(provider.enabled).toBe(true);
      expect(provider.method).not.toBe('api');
    }
  });
});
