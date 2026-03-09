import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetCachedAuth,
  mockWithDbSession,
  mockCaptureError,
  mockNoStore,
  mockIsContentClean,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockWithDbSession: vi.fn(),
  mockCaptureError: vi.fn(),
  mockNoStore: vi.fn(),
  mockIsContentClean: vi.fn(() => true),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSession: mockWithDbSession,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('next/cache', () => ({
  unstable_noStore: mockNoStore,
}));

vi.mock('@/lib/validation/content-filter', () => ({
  isContentClean: mockIsContentClean,
}));

vi.mock('@/lib/cache/profile', () => ({
  invalidateProfileCache: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    clerkId: 'clerkId',
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'userId',
    settings: 'settings',
    usernameNormalized: 'usernameNormalized',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...values: unknown[]) => values),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
}));

describe('creator-profile actions auth errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsContentClean.mockReturnValue(true);
  });

  it('does not report expected Unauthorized from updateCreatorProfile', async () => {
    const { updateCreatorProfile } = await import(
      '@/app/app/(shell)/dashboard/actions/creator-profile'
    );

    mockGetCachedAuth.mockResolvedValue({ userId: null });

    await expect(
      updateCreatorProfile('profile_1', { displayName: 'Artist' })
    ).rejects.toThrow('Unauthorized');

    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('does not double-report expected Unauthorized from publishProfileBasics', async () => {
    const { publishProfileBasics } = await import(
      '@/app/app/(shell)/dashboard/actions/creator-profile'
    );

    mockGetCachedAuth.mockResolvedValue({ userId: null });

    const formData = new FormData();
    formData.set('profileId', 'profile_1');
    formData.set('displayName', 'Artist');

    await expect(publishProfileBasics(formData)).rejects.toThrow(
      'Unauthorized'
    );

    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('still reports unexpected errors from publishProfileBasics validation', async () => {
    const { publishProfileBasics } = await import(
      '@/app/app/(shell)/dashboard/actions/creator-profile'
    );

    const formData = new FormData();
    formData.set('profileId', 'profile_1');
    formData.set('displayName', '');

    await expect(publishProfileBasics(formData)).rejects.toThrow(
      'Display name is required'
    );

    expect(mockCaptureError).toHaveBeenCalledWith(
      'publishProfileBasics failed',
      expect.any(TypeError),
      expect.objectContaining({ route: 'dashboard/actions/creator-profile' })
    );
  });
});
