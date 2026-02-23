import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockClerkClient = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockUpdateUserProfileImage = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: (...args: any[]) => mockClerkClient(...args),
}));

describe('syncClerkProfile', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png' },
        })
    );
    vi.stubGlobal('fetch', mockFetch);

    mockClerkClient.mockResolvedValue({
      users: {
        getUser: mockGetUser,
        updateUser: mockUpdateUser,
        updateUserProfileImage: mockUpdateUserProfileImage,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns rollback that restores name and avatar', async () => {
    mockGetUser.mockResolvedValue({
      firstName: 'Old',
      lastName: 'Name',
      imageUrl: 'https://example.com/old.png',
    });

    const { syncClerkProfile } = await import(
      '@/app/api/dashboard/profile/lib/clerk-sync'
    );

    const result = await syncClerkProfile({
      clerkUserId: 'clerk_123',
      clerkUpdates: { firstName: 'New', lastName: 'Name' },
      avatarUrl: 'https://example.com/new.png',
    });

    expect(result.clerkSyncFailed).toBe(false);
    expect(result.rollback).toBeTypeOf('function');

    await result.rollback?.();

    expect(mockUpdateUser).toHaveBeenNthCalledWith(1, 'clerk_123', {
      firstName: 'New',
      lastName: 'Name',
    });
    expect(mockUpdateUser).toHaveBeenNthCalledWith(2, 'clerk_123', {
      firstName: 'Old',
      lastName: 'Name',
    });
    expect(mockUpdateUserProfileImage).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/new.png',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/old.png',
      expect.any(Object)
    );
  });
});
