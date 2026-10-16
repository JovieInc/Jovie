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
  it('exposes every destination and all fields without advertising unverified writes', async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.success).toBe(true);
    expect(body.providers).toEqual([]);
    expect(body.enabledCount).toBe(0);
    expect(body.catalog.schema).toBe('jovie-artist-profile-catalog/v1');
    expect(
      body.catalog.destinations.map((d: { id: string }) => d.id)
    ).toContain('spotify');
    for (const destination of body.catalog.destinations) {
      expect(
        destination.fields.map((field: { name: string }) => field.name)
      ).toEqual(['bio', 'bio_link', 'image', 'website']);
      for (const field of destination.fields) {
        expect(field.write.available).toBe(false);
        expect(field.write.blockingReason).toBeTruthy();
        expect(field.authorization.write.label).toBeTruthy();
      }
    }
    expect(JSON.stringify(body)).not.toMatch(
      /supportEmail|providerAccountId|accessToken|refreshToken|tokenHandler/
    );
  });
});
