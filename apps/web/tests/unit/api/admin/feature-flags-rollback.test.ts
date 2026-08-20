import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockWriteFlagOverride = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getOptionalAuth: mockAuth,
  getCachedSessionTokenAuth: mockAuth,
}));
vi.mock('@/lib/flags/write-override.server', () => ({
  writeFlagOverride: mockWriteFlagOverride,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: mockSelect }),
      }),
    }),
  },
}));
vi.mock('@/lib/db/schema/feature-flags', () => ({
  featureFlagAuditEvents: { id: 'id' },
}));

import { POST } from '@/app/api/admin/feature-flags/rollback/route';

const EVENT_ID = '0e9b2e6e-3f6f-4c1a-9f3c-2f7d0a1b2c3d';

function request(body: unknown) {
  return new Request('http://localhost/api/admin/feature-flags/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/feature-flags/rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null); // authorized
    mockAuth.mockResolvedValue({ userId: 'admin_123' });
    mockWriteFlagOverride.mockResolvedValue({ previousValue: null });
    mockSelect.mockResolvedValue([
      {
        id: EVENT_ID,
        flagKey: 'SPOTIFY_OAUTH',
        envTier: 'prod',
        action: 'disable',
        actor: 'admin_999',
        previousValue: null,
        newValue: false,
        reason: 'incident',
      },
    ]);
  });

  it('blocks non-admins before any write', async () => {
    mockRequireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const res = await POST(request({ auditEventId: EVENT_ID }));

    expect(res.status).toBe(403);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid audit event id', async () => {
    const res = await POST(request({ auditEventId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('returns 404 when the audit event does not exist', async () => {
    mockSelect.mockResolvedValue([]);
    const res = await POST(request({ auditEventId: EVENT_ID }));
    expect(res.status).toBe(404);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('refuses rollback when the flag is no longer registered', async () => {
    mockSelect.mockResolvedValue([
      {
        id: EVENT_ID,
        flagKey: 'REMOVED_FLAG',
        envTier: 'prod',
        previousValue: true,
        newValue: false,
      },
    ]);
    const res = await POST(request({ auditEventId: EVENT_ID }));
    expect(res.status).toBe(409);
    expect(mockWriteFlagOverride).not.toHaveBeenCalled();
  });

  it('re-applies the previous value as an audited rollback', async () => {
    const res = await POST(
      request({ auditEventId: EVENT_ID, reason: 'reverting incident change' })
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      flagKey: 'SPOTIFY_OAUTH',
      envTier: 'prod',
      enabled: null,
    });
    expect(mockWriteFlagOverride).toHaveBeenCalledWith({
      flagKey: 'SPOTIFY_OAUTH',
      envTier: 'prod',
      enabled: null,
      actor: 'admin_123',
      action: 'rollback',
      reason: 'reverting incident change',
    });
  });

  it('returns 500 when the rollback write fails', async () => {
    mockWriteFlagOverride.mockRejectedValue(new Error('db down'));
    const res = await POST(request({ auditEventId: EVENT_ID }));
    expect(res.status).toBe(500);
  });
});
