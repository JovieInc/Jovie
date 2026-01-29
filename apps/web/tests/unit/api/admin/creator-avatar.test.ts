import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/admin/creator-avatar/route';

const entitlementsMock = vi.hoisted(() => ({
  getCurrentUserEntitlements: vi.fn(),
}));

const adminActionsMock = vi.hoisted(() => ({
  updateCreatorAvatarAsAdmin: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => entitlementsMock);
vi.mock('@/app/app/(shell)/admin/actions', () => adminActionsMock);

describe('POST /api/admin/creator-avatar', () => {
  const { getCurrentUserEntitlements } = entitlementsMock;
  const { updateCreatorAvatarAsAdmin } = adminActionsMock;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });

    const request = new NextRequest(
      'http://localhost/api/admin/creator-avatar',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(updateCreatorAvatarAsAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 when non-admin', async () => {
    getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
    });

    const request = new NextRequest(
      'http://localhost/api/admin/creator-avatar',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(updateCreatorAvatarAsAdmin).not.toHaveBeenCalled();
  });

  it('updates the avatar for admin users', async () => {
    getCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    updateCreatorAvatarAsAdmin.mockResolvedValue(undefined);

    const request = new NextRequest(
      'http://localhost/api/admin/creator-avatar',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profileId: 'profile_123',
          avatarUrl: 'https://cdn.example.com/avatar.png',
        }),
      }
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(updateCreatorAvatarAsAdmin).toHaveBeenCalledWith(
      'profile_123',
      'https://cdn.example.com/avatar.png'
    );
  });
});
