import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bearer: null as string | null,
  entitlements: vi.fn(),
  isAdmin: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mocks.isAdmin,
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));

vi.mock('@/lib/ovie/mcp/oauth', () => ({
  extractBearer: () => mocks.bearer,
  getOvieOAuthIssuer: () => ({
    verifyAccessToken: mocks.verifyAccessToken,
  }),
  OVIE_OAUTH_SCOPES: ['ovie:read', 'ovie:write'],
  ovieIssuerSecret: () => 'test-secret',
}));

describe('resolveOviePrincipal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bearer = null;
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
      userId: null,
      email: null,
    });
    mocks.isAdmin.mockResolvedValue(false);
  });

  it('uses the raw admin role for the authenticated Ovie session gate', async () => {
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'admin_123',
      email: 'admin@example.com',
    });
    mocks.isAdmin.mockResolvedValue(true);

    const { resolveOviePrincipal } = await import('./principal');
    const principal = await resolveOviePrincipal(new Request('https://jov.ie'));

    expect(principal).toEqual({
      authenticated: true,
      isAdmin: true,
      subject: 'admin_123',
      email: 'admin@example.com',
      scopes: ['ovie:read', 'ovie:write'],
    });
    expect(mocks.isAdmin).toHaveBeenCalledWith('admin_123');
  });

  it('fails closed for an authenticated non-admin', async () => {
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
      userId: 'user_123',
      email: 'user@example.com',
    });

    const { resolveOviePrincipal } = await import('./principal');
    const principal = await resolveOviePrincipal(new Request('https://jov.ie'));

    expect(principal).toMatchObject({
      authenticated: true,
      isAdmin: false,
      scopes: [],
    });
  });

  it('does not query the admin role for an unauthenticated request', async () => {
    const { resolveOviePrincipal } = await import('./principal');

    await expect(
      resolveOviePrincipal(new Request('https://jov.ie'))
    ).resolves.toMatchObject({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });
    expect(mocks.isAdmin).not.toHaveBeenCalled();
  });
});
