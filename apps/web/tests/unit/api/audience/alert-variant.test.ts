/**
 * Unit tests for /api/audience/alert-variant
 *
 * This route resolves the alert opt-in CTA variant (button | toggle) for a
 * given anonymous stable ID. It exists so the /{username} page can be
 * ISR-cached without reading the jv_aid cookie during server rendering.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetProfileAlertOptInVariant = vi.hoisted(() => vi.fn());

vi.mock('@/lib/flags/server', () => ({
  getProfileAlertOptInVariant: mockGetProfileAlertOptInVariant,
}));

async function importRoute() {
  const mod = await import('@/app/api/audience/alert-variant/route');
  return mod;
}

// Fresh module for each test — avoids state leakage between variant scenarios
beforeEach(() => {
  vi.resetModules();
});

describe('GET /api/audience/alert-variant', () => {
  it('returns the resolved variant for a known stableId', async () => {
    mockGetProfileAlertOptInVariant.mockResolvedValueOnce('toggle');

    const { GET } = await importRoute();
    const req = new NextRequest(
      'http://localhost/api/audience/alert-variant?stableId=abc123'
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variant).toBe('toggle');
    expect(mockGetProfileAlertOptInVariant).toHaveBeenCalledWith('abc123');
  });

  it('returns button variant when stableId is absent', async () => {
    mockGetProfileAlertOptInVariant.mockResolvedValueOnce('button');

    const { GET } = await importRoute();
    const req = new NextRequest('http://localhost/api/audience/alert-variant');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variant).toBe('button');
    expect(mockGetProfileAlertOptInVariant).toHaveBeenCalledWith(null);
  });

  it('defaults to button variant when flag resolution throws', async () => {
    mockGetProfileAlertOptInVariant.mockRejectedValueOnce(
      new Error('Statsig unavailable')
    );

    const { GET } = await importRoute();
    const req = new NextRequest(
      'http://localhost/api/audience/alert-variant?stableId=xyz'
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.variant).toBe('button');
  });

  it('sets no-store cache control header', async () => {
    mockGetProfileAlertOptInVariant.mockResolvedValueOnce('button');

    const { GET } = await importRoute();
    const req = new NextRequest('http://localhost/api/audience/alert-variant');
    const res = await GET(req);

    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
