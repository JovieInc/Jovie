import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockIsAdmin = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
  socialLinks: {},
}));

describe('GET /api/admin/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 403 when user is not admin', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockIsAdmin.mockResolvedValue(false);

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Forbidden');
  });

  it('returns overview stats for admins', async () => {
    mockAuth.mockResolvedValue({ userId: 'admin_123' });
    mockIsAdmin.mockResolvedValue(true);
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 100 }]),
      }),
    });

    const { GET } = await import('@/app/api/admin/overview/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('stats');
  });
});
