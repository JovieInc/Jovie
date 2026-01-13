import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mocks before module resolution
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock schema (just provide empty objects for the table references)
vi.mock('@/lib/db/schema', () => ({
  users: {},
  creatorProfiles: {},
}));

describe('proxy-state.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('getUserState', () => {
    it('returns needsWaitlist when no DB user exists', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      });
    });

    it('returns needsWaitlist when dbUserId is null', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ dbUserId: null }]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      });
    });

    it('returns needsWaitlist when userStatus is waitlist_pending', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'waitlist_pending',
                  profileId: null,
                  profileComplete: null,
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      });
    });

    it('returns needsOnboarding when approved but no profile', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'waitlist_approved',
                  profileId: null,
                  profileComplete: null,
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
      });
    });

    it('returns needsOnboarding when profile exists but onboarding incomplete', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'profile_claimed',
                  profileId: 'profile-123',
                  profileComplete: null, // onboardingCompletedAt is null
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: true,
        isActive: false,
      });
    });

    it('returns isActive for fully onboarded user', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'active',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: false,
        needsOnboarding: false,
        isActive: true,
      });
    });

    it('handles waitlist_approved status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'waitlist_approved',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('handles profile_claimed status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'profile_claimed',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('handles onboarding_incomplete status as approved', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'onboarding_incomplete',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result.isActive).toBe(true);
    });

    it('returns safe fallback on database error', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('Database error')),
            }),
          }),
        }),
      });

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      // Should return safe fallback (require waitlist)
      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      });

      consoleSpy.mockRestore();
    });

    it('logs error with context on database failure', async () => {
      const dbError = new Error('Connection timeout');
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(dbError),
            }),
          }),
        }),
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { getUserState } = await import('@/lib/auth/proxy-state');
      await getUserState('clerk_test_user');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ERROR] Database query failed in proxy state check',
        expect.objectContaining({
          clerkUserId: 'clerk_test_user',
          message: 'Connection timeout',
          operation: 'getProxyUserState',
        })
      );

      consoleSpy.mockRestore();
    });

    it('handles non-Error objects in catch block', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue('String error'),
            }),
          }),
        }),
      });

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      expect(result).toEqual({
        needsWaitlist: true,
        needsOnboarding: false,
        isActive: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ERROR] Database query failed in proxy state check',
        expect.objectContaining({
          clerkUserId: 'clerk_123',
          message: 'String error',
          operation: 'getProxyUserState',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('ProxyUserState interface', () => {
    it('returns correctly typed object', async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  dbUserId: 'db-user-123',
                  userStatus: 'active',
                  profileId: 'profile-123',
                  profileComplete: new Date(),
                },
              ]),
            }),
          }),
        }),
      });

      const { getUserState } = await import('@/lib/auth/proxy-state');
      const result = await getUserState('clerk_123');

      // Type checks
      expect(typeof result.needsWaitlist).toBe('boolean');
      expect(typeof result.needsOnboarding).toBe('boolean');
      expect(typeof result.isActive).toBe('boolean');
    });
  });
});
