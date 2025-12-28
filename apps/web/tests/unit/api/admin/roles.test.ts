import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
  ADMIN_ROLES: ['super_admin', 'admin'],
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
}));

describe('Admin Roles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('GET /api/admin/roles', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/admin/roles/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({ userId: 'user_123' });
      mockIsAdmin.mockResolvedValue(false);

      const { GET } = await import('@/app/api/admin/roles/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('returns admin users for admins', async () => {
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockIsAdmin.mockResolvedValue(true);
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: 'user_1', role: 'admin', email: 'admin@example.com' },
            ]),
        }),
      });

      const { GET } = await import('@/app/api/admin/roles/route');
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.users).toBeDefined();
    });
  });

  describe('PUT /api/admin/roles', () => {
    it('returns 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { PUT } = await import('@/app/api/admin/roles/route');
      const request = new NextRequest('http://localhost/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role: 'admin' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });

    it('returns 403 when user is not super admin', async () => {
      mockAuth.mockResolvedValue({ userId: 'admin_123' });
      mockIsAdmin.mockResolvedValue(true);
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ role: 'admin' }]),
          }),
        }),
      });

      const { PUT } = await import('@/app/api/admin/roles/route');
      const request = new NextRequest('http://localhost/api/admin/roles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_123', role: 'admin' }),
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBeDefined();
    });
  });
});
