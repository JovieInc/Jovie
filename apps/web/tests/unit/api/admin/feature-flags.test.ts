import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockWriteFlagOverride = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getOptionalAuth: mockAuth,
  getCachedSessionTokenAuth: mockAuth,
}));
vi.mock('@/lib/flags/write-override.server', () => ({
  writeFlagOverride: mockWriteFlagOverride,
}));

import { POST } from '@/app/api/admin/feature-flags/route';

function request(body: unknown) {
  return new Request('http://localhost/api/admin/feature-flags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/feature-flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null); // authorized
    mockAuth.mockResolvedValue({ userId: 'admin_123' });
    mockWriteFlagOverride.mockResolvedValue({ previousValue: null });
  });

  it('blocks non-admins before any write', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'prod', enabled: true })
    );

    expect(res.status).toBe(403);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects an unknown flag key', async () => {
    const res = await POST(
      request({ flagKey: 'NOT_A_FLAG', envTier: 'prod', enabled: true })
    );
    expect(res.status).toBe(400);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects an invalid env tier', async () => {
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'qa', enabled: true })
    );
    expect(res.status).toBe(400);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects an over-long reason', async () => {
    const res = await POST(
      request({
        flagKey: 'SPOTIFY_OAUTH',
        envTier: 'prod',
        enabled: true,
        reason: 'x'.repeat(501),
      })
    );
    expect(res.status).toBe(400);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('writes the override with actor and reason on a valid write', async () => {
    const res = await POST(
      request({
        flagKey: 'SPOTIFY_OAUTH',
        envTier: 'prod',
        enabled: false,
        reason: 'Investigating elevated Spotify errors',
      })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      flagKey: 'SPOTIFY_OAUTH',
      envTier: 'prod',
      enabled: false,
    });
    expect(mockWriteFlagOverride).toHaveBeenCalledWith({
      flagKey: 'SPOTIFY_OAUTH',
      envTier: 'prod',
      enabled: false,
      actor: 'admin_123',
      reason: 'Investigating elevated Spotify errors',
    });
  });

  it('accepts null to clear a cell back to the code default', async () => {
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'dev', enabled: null })
    );
    expect(res.status).toBe(200);
    expect(mockWriteFlagOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        flagKey: 'SPOTIFY_OAUTH',
        envTier: 'dev',
        enabled: null,
        reason: undefined,
      })
    );
  });

  it('returns 500 when the write fails so the UI can revert', async () => {
    mockWriteFlagOverride.mockRejectedValue(new Error('db down'));
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'prod', enabled: true })
    );
    expect(res.status).toBe(500);
  });
});
