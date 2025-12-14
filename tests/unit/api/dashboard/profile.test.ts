import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from '@/app/api/dashboard/profile/route';

const hoisted = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const from = vi.fn(() => ({ where }));
  const set = vi.fn(() => ({ from }));
  const update = vi.fn(() => ({ set }));
  return { returning, where, from, set, update };
});

const syncHoisted = vi.hoisted(() => {
  class UsernameValidationError extends Error {
    code: string;

    constructor(message: string) {
      super(message);
      this.code = 'USERNAME_TAKEN';
    }
  }

  return {
    syncCanonicalUsernameFromApp: vi.fn().mockResolvedValue(undefined),
    UsernameValidationError,
  };
});

const clerkClientMock = vi.hoisted(() => ({
  users: {
    updateUser: vi.fn(),
    updateUserProfileImage: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => clerkClientMock,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: vi.fn(
    async (callback: (userId: string) => Promise<Response>) =>
      callback('user_123')
  ),
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: hoisted.update,
  },
  creatorProfiles: {},
  users: {},
}));

vi.mock('@/lib/username/sync', () => syncHoisted);

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/validation/username', () => ({
  validateUsername: vi.fn(() => ({ isValid: true })),
}));

describe('PUT /api/dashboard/profile', () => {
  const mockUpdateUser = clerkClientMock.users.updateUser;
  const mockUpdateUserProfileImage =
    clerkClientMock.users.updateUserProfileImage;
  const { returning } = hoisted;
  const { syncCanonicalUsernameFromApp } = syncHoisted;

  beforeEach(() => {
    vi.clearAllMocks();
    returning.mockResolvedValue([
      {
        avatarUrl: 'https://example.com/avatar.png',
        username: 'new-handle',
        displayName: 'Taylor Swift',
      },
    ]);
  });

  it('syncs username and display name to Clerk before updating the database', async () => {
    const request = new NextRequest('http://localhost/api/dashboard/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updates: {
          username: 'new-handle',
          displayName: 'Taylor Swift',
        },
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(syncCanonicalUsernameFromApp).toHaveBeenCalledWith(
      'user_123',
      'new-handle'
    );
    expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
      firstName: 'Taylor',
      lastName: 'Swift',
    });
    expect(mockUpdateUserProfileImage).not.toHaveBeenCalled();
    expect(returning).toHaveBeenCalled();
  });

  it('downloads the uploaded avatar and forwards it to Clerk', async () => {
    const arrayBuffer = new TextEncoder().encode('avatar-data').buffer;
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(arrayBuffer, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );

    const request = new NextRequest('http://localhost/api/dashboard/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updates: {
          avatarUrl: 'https://example.com/upload.png',
        },
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockUpdateUserProfileImage).toHaveBeenCalledTimes(1);
    const payload = mockUpdateUserProfileImage.mock.calls[0]?.[1];
    expect(payload?.file).toBeInstanceOf(Blob);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/upload.png', {
      signal: expect.any(AbortSignal),
    });

    fetchMock.mockRestore();
  });

  it('rejects unsupported updates', async () => {
    const request = new NextRequest('http://localhost/api/dashboard/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ updates: { unsupported: 'value' } }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(400);
  });
});
