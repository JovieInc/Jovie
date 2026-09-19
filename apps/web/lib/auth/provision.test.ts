import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindLimit,
  mockInsertReturning,
  mockIsWaitlistGateEnabled,
  mockGetWaitlistAccess,
  mockCaptureError,
} = vi.hoisted(() => ({
  mockFindLimit: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockIsWaitlistGateEnabled: vi.fn(),
  mockGetWaitlistAccess: vi.fn(),
  mockCaptureError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mockFindLimit,
        }),
      }),
    }),
    insert: () => ({
      values: (row: { userStatus?: string }) => {
        mockInsertReturning.mockImplementation(async () => [
          { id: 'user-new', userStatus: row.userStatus },
        ]);
        return {
          onConflictDoNothing: () => ({
            returning: mockInsertReturning,
          }),
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'users.id',
    betterAuthUserId: 'users.betterAuthUserId',
    email: 'users.email',
    clerkId: 'users.clerkId',
    name: 'users.name',
    userStatus: 'users.userStatus',
    waitlistEntryId: 'users.waitlistEntryId',
    updatedAt: 'users.updatedAt',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('@/lib/waitlist/settings', () => ({
  isWaitlistGateEnabled: mockIsWaitlistGateEnabled,
}));

vi.mock('./waitlist-access', () => ({
  getWaitlistAccess: mockGetWaitlistAccess,
}));

import { provisionAppUser } from './provision';

describe('provisionAppUser waitlist gate (JOV-6449)', () => {
  beforeEach(() => {
    mockFindLimit.mockReset().mockResolvedValue([]);
    mockInsertReturning.mockReset();
    mockIsWaitlistGateEnabled.mockReset();
    mockGetWaitlistAccess.mockReset();
    mockCaptureError.mockClear();
  });

  it('does not read waitlist when the launch gate is off', async () => {
    mockIsWaitlistGateEnabled.mockResolvedValue(false);
    mockGetWaitlistAccess.mockRejectedValue(
      new Error('waitlist table unavailable')
    );

    await expect(
      provisionAppUser({
        betterAuthUserId: 'ba-user-1',
        email: 'artist@example.com',
        emailVerified: false,
        name: 'Artist',
      })
    ).resolves.toBe('user-new');

    expect(mockIsWaitlistGateEnabled).toHaveBeenCalledOnce();
    expect(mockGetWaitlistAccess).not.toHaveBeenCalled();
    expect(mockInsertReturning).toHaveBeenCalledOnce();
  });

  it('reads waitlist only after the launch gate is on', async () => {
    mockIsWaitlistGateEnabled.mockResolvedValue(true);
    mockGetWaitlistAccess.mockResolvedValue({
      entryId: 'entry-1',
      status: 'approved',
    });

    await expect(
      provisionAppUser({
        betterAuthUserId: 'ba-user-2',
        email: 'approved@example.com',
        emailVerified: false,
        name: 'Approved',
      })
    ).resolves.toBe('user-new');

    expect(mockGetWaitlistAccess).toHaveBeenCalledExactlyOnceWith(
      'approved@example.com'
    );
  });
});
