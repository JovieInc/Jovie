import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetUserByClerkId = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: mockGetUserByClerkId,
}));

function createSelectChain(result: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createUpdateChain(result: unknown[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

describe('updateProfileRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges incoming settings with existing settings before update', async () => {
    mockGetUserByClerkId.mockResolvedValue({ id: 'user-1' });
    createSelectChain([
      {
        usernameNormalized: 'testartist',
        settings: { hide_branding: false, exclude_self_from_analytics: true },
      },
    ]);
    const updateChain = createUpdateChain([
      {
        id: 'profile-1',
        usernameNormalized: 'testartist',
      },
    ]);

    const { updateProfileRecords } = await import(
      '@/app/api/dashboard/profile/lib/db-operations'
    );

    const result = await updateProfileRecords({
      clerkUserId: 'clerk_123',
      displayNameForUserUpdate: undefined,
      dbProfileUpdates: {
        location: 'Austin, TX',
        settings: { hometown: 'Tulsa, OK' },
      },
    });

    expect(result).not.toBeInstanceOf(NextResponse);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        location: 'Austin, TX',
        settings: {
          hide_branding: false,
          exclude_self_from_analytics: true,
          hometown: 'Tulsa, OK',
        },
      })
    );
  });
});
