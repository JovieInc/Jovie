import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockOnConflictDoUpdate = vi.hoisted(() => vi.fn());
const mockRevalidate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getOptionalAuth: mockAuth,
  getCachedSessionTokenAuth: mockAuth,
}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: () => ({ onConflictDoUpdate: mockOnConflictDoUpdate }),
    }),
  },
}));
vi.mock('@/lib/db/schema/feature-flags', () => ({
  featureFlagOverrides: { flagKey: 'flag_key' },
}));
vi.mock('@/lib/flags/overrides-store.server', () => ({
  revalidateFeatureFlags: mockRevalidate,
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
    mockOnConflictDoUpdate.mockResolvedValue(undefined);
  });

  it('blocks non-admins before any write', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'prod', enabled: true })
    );

    expect(res.status).toBe(403);
    expect(mockOnConflictDoUpdate).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('rejects an unknown flag key', async () => {
    const res = await POST(
      request({ flagKey: 'NOT_A_FLAG', envTier: 'prod', enabled: true })
    );
    expect(res.status).toBe(400);
    expect(mockOnConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('rejects an invalid env tier', async () => {
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'qa', enabled: true })
    );
    expect(res.status).toBe(400);
  });

  it('upserts the cell and revalidates on a valid write', async () => {
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'staging', enabled: false })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      flagKey: 'SPOTIFY_OAUTH',
      envTier: 'staging',
      enabled: false,
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it('accepts null to clear a cell back to the code default', async () => {
    const res = await POST(
      request({ flagKey: 'SPOTIFY_OAUTH', envTier: 'dev', enabled: null })
    );
    expect(res.status).toBe(200);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
  });
});
