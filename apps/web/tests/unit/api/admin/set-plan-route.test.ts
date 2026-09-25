/**
 * POST /api/admin/set-plan
 *
 * Regression coverage for JOV-4228: the session userId is the app `users.id`
 * UUID post-cutover, so the plan update must key on `users.id`, never
 * `users.clerkId`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  getCachedAuthMock: vi.fn(),
  updateWhereMock: vi.fn(),
  updateSetMock: vi.fn(),
  dbUpdateMock: vi.fn(),
  eqMock: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: hoisted.requireAdminMock,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuthMock,
}));

vi.mock('@/lib/db', () => ({
  db: { update: hoisted.dbUpdateMock },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', clerkId: 'users.clerk_id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: hoisted.eqMock,
}));

function mockUpdateChain() {
  hoisted.updateWhereMock.mockResolvedValue(undefined);
  hoisted.updateSetMock.mockReturnValue({ where: hoisted.updateWhereMock });
  hoisted.dbUpdateMock.mockReturnValue({ set: hoisted.updateSetMock });
}

describe('POST /api/admin/set-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAdminMock.mockResolvedValue(null);
    hoisted.getCachedAuthMock.mockResolvedValue({ userId: 'db-user-1' });
    mockUpdateChain();
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
    expect(hoisted.eqMock).toHaveBeenCalledWith('users.id', 'db-user-1');
    expect(hoisted.eqMock).not.toHaveBeenCalledWith(
      'users.clerk_id',
      expect.anything()
    );
    expect(hoisted.updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'pro', isPro: true })
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
    expect(hoisted.dbUpdateMock).not.toHaveBeenCalled();
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
    expect(hoisted.dbUpdateMock).not.toHaveBeenCalled();
  });
});
