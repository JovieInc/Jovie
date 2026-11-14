import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEntitlements } = vi.hoisted(() => ({
  mockEntitlements: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mockEntitlements,
}));

import { operatorAccess } from './route-access';

const request = new NextRequest('https://jov.ie/api/admin/test');

describe('operatorAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies a signed-out caller with the 401 body every admin route used', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    expect(await operatorAccess().authorize(request)).toEqual({
      ok: false,
      status: 401,
      body: { error: 'Unauthorized' },
    });
  });

  it('denies a signed-in non-admin with 403', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    expect(await operatorAccess().authorize(request)).toEqual({
      ok: false,
      status: 403,
      body: { error: 'Forbidden' },
    });
  });

  it('allows an admin and exposes the entitlements as the caller', async () => {
    const entitlements = {
      isAuthenticated: true,
      isAdmin: true,
      userId: 'admin_1',
    };
    mockEntitlements.mockResolvedValue(entitlements);

    expect(await operatorAccess().authorize(request)).toEqual({
      ok: true,
      auth: entitlements,
    });
  });

  it.each([[{ purpose: 'read' as const }], [{ session: 'fresh' as const }]])(
    'forwards %j to the entitlement check unchanged',
    async options => {
      mockEntitlements.mockResolvedValue({
        isAuthenticated: true,
        isAdmin: true,
      });

      await operatorAccess(options).authorize(request);

      expect(mockEntitlements).toHaveBeenCalledTimes(1);
      expect(mockEntitlements).toHaveBeenCalledWith(options);
    }
  );

  it('calls the entitlement check with no argument when given no options', async () => {
    mockEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });

    await operatorAccess().authorize(request);

    expect(mockEntitlements).toHaveBeenCalledWith();
  });

  it('propagates a privacy-lock failure instead of allowing', async () => {
    mockEntitlements.mockRejectedValue(new Error('privacy locked'));

    await expect(operatorAccess().authorize(request)).rejects.toThrow(
      'privacy locked'
    );
  });
});
