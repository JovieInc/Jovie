import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockGetUserByClerkId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockAuth,
  getOptionalAuth: mockAuth,
  getCachedSessionTokenAuth: mockAuth,
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

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
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
      expect(mockRequireAdmin).toHaveBeenCalledWith({ session: 'fresh' });
    });

    it('grants admin role successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockGetUserByClerkId.mockResolvedValue({
        id: 'user_1',
        clerkId: 'user_123',
        email: 'user@example.com',
        isAdmin: false,
      });
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: 'user_1', clerkId: 'user_123' }]),
        }),
      });
      mockDbUpdate.mockReturnValue({
        set: setMock,
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
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isAdmin: true,
          isPro: true,
          plan: 'max',
          billingUpdatedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        })
      );
    });
  });

  describe('read-only operator role', () => {
    const grantRequest = (role: string) =>
      new Request('http://localhost/api/admin/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role }),
      });

    function arrange() {
      mockRequireAdmin.mockResolvedValue(null);
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockGetUserByClerkId.mockResolvedValue({
        id: 'user_1',
        clerkId: 'user_123',
      });
      const setMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDbUpdate.mockReturnValue({ set: setMock });
      return setMock;
    }

    it('grants read-only without admin, plan or billing changes (and demotes a full admin)', async () => {
      const setMock = arrange();
      const { POST } = await import('@/app/api/admin/roles/route');
      const response = await POST(grantRequest('admin_read_only'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toMatchObject({
        isAdmin: false,
        adminRole: 'read_only',
      });
      const written = setMock.mock.calls[0][0];
      expect(written).toMatchObject({ isAdmin: false, adminRole: 'read_only' });
      expect(written).not.toHaveProperty('isPro');
      expect(written).not.toHaveProperty('plan');
      expect(written).not.toHaveProperty('billingUpdatedAt');
    });

    it('granting full admin clears any read-only role (the two are exclusive)', async () => {
      const setMock = arrange();
      const { POST } = await import('@/app/api/admin/roles/route');
      await POST(grantRequest('admin'));
      expect(setMock.mock.calls[0][0]).toMatchObject({
        isAdmin: true,
        adminRole: null,
      });
    });

    it('is a write: only a full admin session can grant it', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireAdmin.mockResolvedValue(
        NextResponse.json(
          { error: 'Forbidden. Admin privileges required.' },
          { status: 403 }
        )
      );
      const { POST } = await import('@/app/api/admin/roles/route');
      const response = await POST(grantRequest('admin_read_only'));
      expect(response.status).toBe(403);
      expect(mockRequireAdmin).toHaveBeenCalledWith({ session: 'fresh' });
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('revokes read-only by clearing the role only', async () => {
      const setMock = arrange();
      const { DELETE } = await import('@/app/api/admin/roles/route');
      const response = await DELETE(
        new Request('http://localhost/api/admin/roles', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'target_user',
            role: 'admin_read_only',
          }),
        })
      );
      expect(response.status).toBe(200);
      const written = setMock.mock.calls[0][0];
      expect(written).toMatchObject({ adminRole: null });
      expect(written).not.toHaveProperty('isAdmin');
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
      expect(mockRequireAdmin).toHaveBeenCalledWith({ session: 'fresh' });
    });

    it('revokes admin role successfully', async () => {
      mockRequireAdmin.mockResolvedValue(null);
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockGetUserByClerkId.mockResolvedValue({
        id: 'user_1',
        clerkId: 'target_user',
        email: 'target@example.com',
        isAdmin: true,
      });
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
