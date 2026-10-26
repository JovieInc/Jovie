/**
 * POST /api/admin/set-plan
 *
 * Regression coverage for JOV-4228: the session userId is the app `users.id`
 * UUID post-cutover, so the plan update must be keyed on that id (resolved by
 * the shared billing writer), never on a separate clerk id.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getCachedAuthMock: vi.fn(),
  updateBillingMock: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: hoisted.requireAdminMock,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: hoisted.updateBillingMock,
}));

describe('POST /api/admin/set-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdminMock.mockResolvedValue(null);
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
    hoisted.updateBillingMock.mockResolvedValue({ success: true });
  });

  it('updates the plan keyed on users.id (app UUID), not clerk_id', async () => {
    const { POST } = await import('@/app/api/admin/set-plan/route');
    const response = await POST(
      new Request('http://localhost/api/admin/set-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      })
    );

    expect(hoisted.requireAdminMock).toHaveBeenCalledWith({ session: 'fresh' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      plan: 'pro',
      isPro: true,
    });
    expect(hoisted.updateBillingMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        clerkUserId: 'db-user-1',
        plan: 'pro',
        isPro: true,
        eventType: 'admin_override',
      })
    );
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/admin/set-plan/route');
    const response = await POST(
      new Request('http://localhost/api/admin/set-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'pro' }),
      })
    );

    expect(response.status).toBe(401);
    expect(hoisted.updateBillingMock).not.toHaveBeenCalled();
  });

  it('returns 400 on an invalid plan value', async () => {
    const { POST } = await import('@/app/api/admin/set-plan/route');
    const response = await POST(
      new Request('http://localhost/api/admin/set-plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: 'enterprise' }),
      })
    );

    expect(response.status).toBe(400);
    expect(hoisted.updateBillingMock).not.toHaveBeenCalled();
  });
});
