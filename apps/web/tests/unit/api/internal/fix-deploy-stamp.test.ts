import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerifyCronRequest = vi.hoisted(() => vi.fn());
const mockRecordShippedFixDeploys = vi.hoisted(() =>
  vi.fn(() => Promise.resolve())
);

vi.mock('@/lib/cron/auth', () => ({
  verifyCronRequest: mockVerifyCronRequest,
}));
vi.mock('@/lib/recovery/probes.server', () => ({
  recordShippedFixDeploys: mockRecordShippedFixDeploys,
}));

/**
 * JOV-12766: /api/internal/ovie/fix-deploy-stamp owns the shipped-fix
 * deploy-time stamp for the server boot hook. instrumentation.ts fires it
 * once per production lambda boot (boot is the release event on Vercel) with
 * the cron bearer, so the database dependency graph stays in this route's
 * function instead of being traced into every serverless function.
 */
describe('POST /api/internal/ovie/fix-deploy-stamp (JOV-12766)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockVerifyCronRequest.mockReset();
    mockRecordShippedFixDeploys.mockReset();
    mockRecordShippedFixDeploys.mockImplementation(() => Promise.resolve());
  });

  it('rejects a call without the cron bearer and stamps nothing', async () => {
    mockVerifyCronRequest.mockReturnValueOnce(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const { POST } = await import(
      '@/app/api/internal/ovie/fix-deploy-stamp/route'
    );
    const response = await POST(
      new NextRequest('https://jov.ie/', {
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(mockVerifyCronRequest).toHaveBeenCalledTimes(1);
    expect(mockRecordShippedFixDeploys).not.toHaveBeenCalled();
  });

  it('stamps shipped fixes once for an authorized boot call', async () => {
    mockVerifyCronRequest.mockReturnValueOnce(null);

    const { POST } = await import(
      '@/app/api/internal/ovie/fix-deploy-stamp/route'
    );
    const response = await POST(
      new NextRequest('https://jov.ie/', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      contract: 'fix-deploy-stamp/v1',
      stamped: true,
    });
    expect(mockRecordShippedFixDeploys).toHaveBeenCalledTimes(1);
  });

  it('checks the trusted-origin flag so only Jovie-owned hosts may call it', async () => {
    mockVerifyCronRequest.mockReturnValueOnce(null);

    const { POST } = await import(
      '@/app/api/internal/ovie/fix-deploy-stamp/route'
    );
    await POST(new NextRequest('https://jov.ie/', { method: 'POST' }));

    expect(mockVerifyCronRequest).toHaveBeenCalledWith(expect.any(Request), {
      route: '/api/internal/ovie/fix-deploy-stamp',
      requireTrustedOrigin: true,
    });
  });
});
