import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin', () => ({
  requireAdmin: mockRequireAdmin,
  invalidateAdminCache: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

describe('Admin Roles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('POST /api/admin/roles', () => {
    it('returns 401 when not admin', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { POST } = await import('@/app/api/admin/roles/route');
      const request = new Request('http://localhost/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role: 'admin' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('grants admin role successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: 'user_1', clerkId: 'user_123' }]),
          }),
        }),
      });

      const { POST } = await import('@/app/api/admin/roles/route');
      const request = new Request('http://localhost/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role: 'admin' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('DELETE /api/admin/roles', () => {
    it('returns 401 when not admin', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );

      const { DELETE } = await import('@/app/api/admin/roles/route');
      const request = new Request('http://localhost/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role: 'admin' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('revokes admin role successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: 'user_1', clerkId: 'target_user' }]),
          }),
        }),
      });

      const { DELETE } = await import('@/app/api/admin/roles/route');
      const request = new Request('http://localhost/api/admin/roles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'target_user', role: 'admin' }),
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
