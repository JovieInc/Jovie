import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateBilling = vi.hoisted(() => vi.fn());
const mockRequireAdmin = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());
const mockDbSet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateBilling,
}));
vi.mock('@/lib/admin/middleware', () => ({ requireAdmin: mockRequireAdmin }));
vi.mock('@/lib/admin', () => ({
  requireAdmin: mockRequireAdmin,
  invalidateAdminCache: vi.fn(),
}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mockAuth }));
vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({ set: mockDbSet.mockReturnValue({ where: vi.fn() }) }),
  },
}));
vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: vi
    .fn()
    .mockResolvedValue({ id: 'app-user', clerkId: 'c1' }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureCriticalError: vi.fn() }));

const post = (body: unknown) =>
  new Request('http://localhost/api/admin', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('admin plan writers use the shared billing writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(null);
    mockAuth.mockResolvedValue({ userId: 'admin-user' });
    mockUpdateBilling.mockResolvedValue({ success: true });
  });

  it('set-plan grants the requested plan with an admin_override audit', async () => {
    const { POST } = await import('@/app/api/admin/set-plan/route');
    const res = await POST(post({ plan: 'max' }));
    expect(res.status).toBe(200);
    expect(mockUpdateBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'admin-user',
        isPro: true,
        plan: 'max',
        eventType: 'admin_override',
        source: 'manual',
      })
    );
  });

  it('set-plan free revokes through the same writer', async () => {
    const { POST } = await import('@/app/api/admin/set-plan/route');
    await POST(post({ plan: 'free' }));
    expect(mockUpdateBilling).toHaveBeenCalledWith(
      expect.objectContaining({ isPro: false, plan: 'free' })
    );
  });

  it('set-plan surfaces a failed billing write', async () => {
    mockUpdateBilling.mockResolvedValue({ success: false, error: 'boom' });
    const { POST } = await import('@/app/api/admin/set-plan/route');
    expect((await POST(post({ plan: 'pro' }))).status).toBe(500);
  });

  it('granting the admin role no longer writes plan or isPro directly', async () => {
    const { POST } = await import('@/app/api/admin/roles/route');
    await POST(post({ userId: 'c1', role: 'admin' }));
    const direct = mockDbSet.mock.calls[0]?.[0] ?? {};
    expect(direct).not.toHaveProperty('plan');
    expect(direct).not.toHaveProperty('isPro');
    expect(mockUpdateBilling).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'app-user',
        isPro: true,
        plan: 'max',
        eventType: 'admin_override',
      })
    );
  });
});
