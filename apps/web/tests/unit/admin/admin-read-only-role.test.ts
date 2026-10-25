import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  isAdmin: vi.fn(),
  access: vi.fn(),
  privacy: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ addBreadcrumb: vi.fn() }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: m.auth,
  getFreshAuth: m.auth,
}));
vi.mock('@/lib/admin/roles', () => ({
  isAdmin: m.isAdmin,
  getAdminAccess: m.access,
}));
vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: m.privacy,
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

import { requireAdmin } from '@/lib/admin/middleware';

// A read-only operator is never an admin: isAdmin() is false and getAdminAccess()
// is 'read'. Every gate that does not explicitly opt in to read must refuse it.
describe('requireAdmin with a read-only operator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ userId: 'ro-user', sessionId: 's1' });
    m.isAdmin.mockResolvedValue(false);
    m.access.mockResolvedValue('read');
    m.privacy.mockResolvedValue(undefined);
  });

  it('refuses a write (the default) with 403', async () => {
    const denied = await requireAdmin();
    expect(denied?.status).toBe(403);
    expect((await denied?.json())?.error).toMatch(/Admin privileges required/);
  });

  it('refuses a write even on a fresh session', async () => {
    expect((await requireAdmin({ session: 'fresh' }))?.status).toBe(403);
    expect((await requireAdmin({ access: 'write' }))?.status).toBe(403);
  });

  it('admits an explicit read', async () => {
    expect(await requireAdmin({ access: 'read' })).toBeNull();
  });

  it('never admits a user with no admin access, even for a read', async () => {
    m.access.mockResolvedValue('none');
    expect((await requireAdmin({ access: 'read' }))?.status).toBe(403);
  });

  it('keeps full admins working for both', async () => {
    m.isAdmin.mockResolvedValue(true);
    expect(await requireAdmin()).toBeNull();
    expect(await requireAdmin({ access: 'read' })).toBeNull();
  });
});
