import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '@/lib/admin/middleware';

const {
  mockAuth,
  mockHeaders,
  mockCookies,
  mockIsAdmin,
  mockIsTestAuthBypassEnabled,
  mockResolveTestBypassUserId,
  mockCaptureWarning,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockHeaders: vi.fn(),
  mockCookies: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockIsTestAuthBypassEnabled: vi.fn(),
  mockResolveTestBypassUserId: vi.fn(),
  mockCaptureWarning: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
  cookies: mockCookies,
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/auth/test-mode', () => ({
  isTestAuthBypassEnabled: mockIsTestAuthBypassEnabled,
  resolveTestBypassUserId: mockResolveTestBypassUserId,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTestAuthBypassEnabled.mockReturnValue(false);
    mockHeaders.mockResolvedValue(new Headers());
    mockCookies.mockResolvedValue({ get: vi.fn() });
  });

  it('denies admin role when MFA reverification is stale', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_admin',
      has: vi.fn().mockReturnValue(false),
    });
    mockIsAdmin.mockResolvedValue(true);

    const response = await requireAdmin();

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: 'Forbidden. Admin privileges required.',
    });
  });

  it('allows admin role with fresh MFA reverification', async () => {
    mockAuth.mockResolvedValue({
      userId: 'user_admin',
      has: vi.fn().mockReturnValue(true),
    });
    mockIsAdmin.mockResolvedValue(true);

    const response = await requireAdmin();

    expect(response).toBeNull();
  });
});
