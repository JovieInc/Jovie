import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'profile_123' }]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {},
  ingestionJobs: {},
}));

describe('Admin Creator Ingest API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('POST /api/admin/creator-ingest', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/admin/creator-ingest/route');
      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: 'profile_123' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockIsAdmin.mockResolvedValue(false);

      const { POST } = await import('@/app/api/admin/creator-ingest/route');
      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: 'profile_123' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('triggers ingestion for admins', async () => {
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockIsAdmin.mockResolvedValue(true);

      const { POST } = await import('@/app/api/admin/creator-ingest/route');
      const request = new NextRequest(
        'http://localhost/api/admin/creator-ingest',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: 'profile_123' }),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
