import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const entitlementsMock = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
  BillingUnavailableError: class BillingUnavailableError extends Error {
    isAdmin: boolean;
    userId: string | null;

    constructor(
      message: string,
      isAdmin = false,
      userId: string | null = null
    ) {
      super(message);
      this.name = 'BillingUnavailableError';
      this.isAdmin = isAdmin;
      this.userId = userId;
    }
  },
}));

const errorTrackingMock = vi.hoisted(() => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
}));

const adminActionsMock = vi.hoisted(() => ({
  toggleCreatorVerifiedAction: vi.fn(),
  toggleCreatorFeaturedAction: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => entitlementsMock);
vi.mock('@/lib/error-tracking', () => errorTrackingMock);
vi.mock('@/app/app/(shell)/admin/actions', () => adminActionsMock);

describe('admin creator toggle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 400 json for invalid verify payload', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockResolvedValue({
      isAdmin: true,
      userId: 'admin_1',
      email: 'admin@jovie.fm',
      isAuthenticated: true,
    });

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-verify/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-verify',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ profileId: 'profile_1', nextVerified: 'yes' }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({
      success: false,
      error: 'profileId and nextVerified are required',
    });
    expect(adminActionsMock.toggleCreatorVerifiedAction).not.toHaveBeenCalled();
  });

  it('returns success json for verify route', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockResolvedValue({
      isAdmin: true,
      userId: 'admin_1',
      email: 'admin@jovie.fm',
      isAuthenticated: true,
    });
    adminActionsMock.toggleCreatorVerifiedAction.mockResolvedValue(undefined);

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-verify/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-verify',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ profileId: 'profile_1', nextVerified: true }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, isVerified: true });

    const calledWith =
      adminActionsMock.toggleCreatorVerifiedAction.mock.calls[0][0];
    expect(calledWith).toBeInstanceOf(FormData);
    expect(calledWith.get('profileId')).toBe('profile_1');
    expect(calledWith.get('nextVerified')).toBe('true');
  });

  it('returns 403 json when non-admin', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockResolvedValue({
      isAdmin: false,
      userId: 'user_1',
      email: 'user@jovie.fm',
      isAuthenticated: true,
    });

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-featured/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-featured',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ profileId: 'profile_1', nextFeatured: true }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data).toEqual({
      success: false,
      error: 'Unauthorized - admin access required',
    });
    expect(errorTrackingMock.captureWarning).toHaveBeenCalledOnce();
  });

  it('allows admin fallback when billing service is unavailable', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockRejectedValue(
      new entitlementsMock.BillingUnavailableError(
        'billing down',
        true,
        'admin_1'
      )
    );
    adminActionsMock.toggleCreatorFeaturedAction.mockResolvedValue(undefined);

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-featured/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-featured',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ profileId: 'profile_1', nextFeatured: false }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, isFeatured: false });
    expect(adminActionsMock.toggleCreatorFeaturedAction).toHaveBeenCalledOnce();
  });

  it('returns 500 json when featured action throws', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockResolvedValue({
      isAdmin: true,
      userId: 'admin_1',
      email: 'admin@jovie.fm',
      isAuthenticated: true,
    });
    adminActionsMock.toggleCreatorFeaturedAction.mockRejectedValue(
      new Error('database write failed')
    );

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-featured/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-featured',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ profileId: 'profile_1', nextFeatured: true }),
      }
    );

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data).toEqual({ success: false, error: 'database write failed' });
    expect(errorTrackingMock.captureCriticalError).toHaveBeenCalledOnce();
  });

  it('redirects non-json clients to admin creators page on success', async () => {
    entitlementsMock.getCurrentUserEntitlements.mockResolvedValue({
      isAdmin: true,
      userId: 'admin_1',
      email: 'admin@jovie.fm',
      isAuthenticated: true,
    });
    adminActionsMock.toggleCreatorVerifiedAction.mockResolvedValue(undefined);

    const { POST } = await import(
      '@/app/app/(shell)/admin/creators/toggle-verify/route'
    );

    const request = new NextRequest(
      'http://localhost/app/admin/creators/toggle-verify',
      {
        method: 'POST',
        body: new URLSearchParams({
          profileId: 'profile_1',
          nextVerified: 'false',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `http://localhost${APP_ROUTES.ADMIN_CREATORS}`
    );
  });
});
