import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOptionalAuth = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth/cached', () => ({
  getOptionalAuth: mockGetOptionalAuth,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

const { shouldExcludeSelfByHandle, shouldExcludeSelfByProfileId } =
  await import('@/lib/analytics/self-exclusion');

const OWNER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174000';

function mockAuthenticatedProfile(
  profileId = OWNER_PROFILE_ID,
  usernameNormalized = 'tim'
) {
  mockGetOptionalAuth.mockResolvedValue({ userId: 'user_owner' });
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ profileId, usernameNormalized }]),
        }),
      }),
    }),
  });
}

describe('analytics self-exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalAuth.mockResolvedValue({ userId: null });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
  });

  it('excludes authenticated owners viewing their own profile by id', async () => {
    mockAuthenticatedProfile();

    await expect(shouldExcludeSelfByProfileId(OWNER_PROFILE_ID)).resolves.toBe(
      true
    );
  });

  it('excludes authenticated owners viewing their own profile by handle', async () => {
    mockAuthenticatedProfile(OWNER_PROFILE_ID, 'tim');

    await expect(shouldExcludeSelfByHandle('tim')).resolves.toBe(true);
    await expect(shouldExcludeSelfByHandle('TIM')).resolves.toBe(true);
  });

  it('does not exclude anonymous visitors', async () => {
    mockGetOptionalAuth.mockResolvedValue({ userId: null });

    await expect(shouldExcludeSelfByProfileId(OWNER_PROFILE_ID)).resolves.toBe(
      false
    );
    await expect(shouldExcludeSelfByHandle('tim')).resolves.toBe(false);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('does not exclude authenticated visitors on another profile', async () => {
    mockAuthenticatedProfile(OWNER_PROFILE_ID, 'tim');

    await expect(
      shouldExcludeSelfByProfileId('223e4567-e89b-12d3-a456-426614174001')
    ).resolves.toBe(false);
    await expect(shouldExcludeSelfByHandle('dualipa')).resolves.toBe(false);
  });

  it('fails open when auth lookup throws', async () => {
    mockGetOptionalAuth.mockRejectedValue(new Error('auth unavailable'));

    await expect(shouldExcludeSelfByProfileId(OWNER_PROFILE_ID)).resolves.toBe(
      false
    );
  });
});
