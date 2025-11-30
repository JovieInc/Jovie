import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  syncCanonicalUsernameFromApp,
  syncUsernameFromClerkEvent,
  UsernameValidationError,
} from '@/lib/username/sync';

const dbMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

const clerkClientMock = vi.hoisted(() => ({
  users: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => clerkClientMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: dbMocks.transaction,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  creatorProfiles: {
    id: 'creator_profiles.id',
    userId: 'creator_profiles.user_id',
    username: 'creator_profiles.username',
    usernameNormalized: 'creator_profiles.username_normalized',
  },
  users: {
    id: 'users.id',
    clerkId: 'users.clerk_id',
  },
}));

describe('username sync helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncCanonicalUsernameFromApp updates Clerk with normalized username and metadata', async () => {
    dbMocks.transaction.mockImplementation(async callback => {
      const select = vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([
                  { id: 'profile-1', usernameNormalized: 'old-handle' },
                ]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }));

      const update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(),
        })),
      }));

      const execute = vi.fn();

      return callback({ select, update, execute } as unknown as Parameters<
        (typeof dbMocks.transaction)['mockImplementation']
      >[0]);
    });

    clerkClientMock.users.getUser.mockResolvedValue({
      privateMetadata: { existing: 'value' },
    } as unknown as Parameters<typeof clerkClientMock.users.getUser>[0]);

    await syncCanonicalUsernameFromApp('user_123', 'New-Handle');

    expect(clerkClientMock.users.updateUser).toHaveBeenCalledWith('user_123', {
      username: 'new-handle',
      privateMetadata: {
        existing: 'value',
        jovie_username_normalized: 'new-handle',
      },
    });
  });

  it('syncCanonicalUsernameFromApp throws UsernameValidationError when username is taken', async () => {
    dbMocks.transaction.mockImplementation(async callback => {
      const select = vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([
                  { id: 'profile-1', usernameNormalized: 'old-handle' },
                ]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'other-profile' }]),
            }),
          }),
        }));

      const update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(),
        })),
      }));

      const execute = vi.fn();

      return callback({ select, update, execute } as unknown as Parameters<
        (typeof dbMocks.transaction)['mockImplementation']
      >[0]);
    });

    await expect(
      syncCanonicalUsernameFromApp('user_123', 'new-handle')
    ).rejects.toBeInstanceOf(UsernameValidationError);

    expect(clerkClientMock.users.updateUser).not.toHaveBeenCalled();
  });

  it('syncUsernameFromClerkEvent reverts invalid username to last canonical value', async () => {
    clerkClientMock.users.updateUser.mockResolvedValue(
      {} as unknown as Parameters<typeof clerkClientMock.users.updateUser>[1]
    );

    await syncUsernameFromClerkEvent('user_123', '1', {
      jovie_username_normalized: 'existing-handle',
    });

    expect(clerkClientMock.users.updateUser).toHaveBeenCalledWith('user_123', {
      username: 'existing-handle',
    });
    expect(dbMocks.transaction).not.toHaveBeenCalled();
  });

  it('syncUsernameFromClerkEvent resolves conflicts by reverting to DB canonical username', async () => {
    dbMocks.transaction.mockImplementation(async callback => {
      const select = vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([
                  { id: 'profile-1', usernameNormalized: 'db-handle' },
                ]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'other-profile' }]),
            }),
          }),
        }));

      const update = vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(),
        })),
      }));

      const execute = vi.fn();

      return callback({ select, update, execute } as unknown as Parameters<
        (typeof dbMocks.transaction)['mockImplementation']
      >[0]);
    });

    clerkClientMock.users.updateUser.mockResolvedValue(
      {} as unknown as Parameters<typeof clerkClientMock.users.updateUser>[1]
    );

    await syncUsernameFromClerkEvent('user_123', 'new-handle', {});

    expect(clerkClientMock.users.updateUser).toHaveBeenCalledWith('user_123', {
      username: 'db-handle',
    });
  });
});
