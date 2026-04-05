import { describe, expect, it, vi } from 'vitest';

const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

describe('POST /api/admin/test-user/set-plan', () => {
  it('returns 403 for authenticated non-admin users', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    const { POST } = await import('@/app/api/admin/test-user/set-plan/route');
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 410 for admins with migration guidance', async () => {
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    const { POST } = await import('@/app/api/admin/test-user/set-plan/route');
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toContain('/api/dev/test-user/set-plan');
  });
});
