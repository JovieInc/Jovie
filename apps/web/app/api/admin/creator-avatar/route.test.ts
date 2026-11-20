import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  entitlements: vi.fn(),
  updateAvatar: vi.fn(),
}));

vi.mock('@/app/app/(shell)/admin/actions', () => ({
  updateCreatorAvatarAsAdmin: hoisted.updateAvatar,
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: hoisted.entitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

const { POST } = await import('./route');

const url = 'https://jov.ie/api/admin/creator-avatar';

function post(body: unknown) {
  return POST(
    new NextRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/admin/creator-avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    hoisted.updateAvatar.mockResolvedValue(undefined);
  });

  it('updates the avatar with a valid payload', async () => {
    const response = await post({
      profileId: 'profile_1',
      avatarUrl: 'https://cdn.example.test/a.png',
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      avatarUrl: 'https://cdn.example.test/a.png',
    });
    expect(hoisted.updateAvatar).toHaveBeenCalledWith(
      'profile_1',
      'https://cdn.example.test/a.png'
    );
  });

  it('returns 400 for malformed payloads', async () => {
    for (const body of [
      { profileId: 123, avatarUrl: 'https://cdn.example.test/a.png' },
      { profileId: 'profile_1' },
      {},
      'not-an-object',
    ]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'profileId and avatarUrl are required',
      });
    }
    expect(hoisted.updateAvatar).not.toHaveBeenCalled();
  });
});
