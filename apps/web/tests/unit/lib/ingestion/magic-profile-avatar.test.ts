import { describe, expect, it, vi } from 'vitest';
import type { DbType } from '@/lib/db';
import { maybeSetProfileAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';

function makeDbMock(): DbType {
  const returning = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const insert = vi.fn(() => ({ values: vi.fn(() => ({ returning })) }));

  return { update, insert } as unknown as DbType;
}

describe('maybeSetProfileAvatarFromLinks', () => {
  it('returns null when userId is missing', async () => {
    const db = makeDbMock();
    const result = await maybeSetProfileAvatarFromLinks({
      db,
      clerkUserId: 'user_123',
      profileId: 'profile_123',
      userId: null,
      currentAvatarUrl: null,
      avatarLockedByUser: false,
      links: ['https://example.com'],
    });

    expect(result).toBeNull();
    expect(
      (db as unknown as { insert: unknown }).insert
    ).not.toHaveBeenCalled();
    expect(
      (db as unknown as { update: unknown }).update
    ).not.toHaveBeenCalled();
  });

  it('returns null when avatar is locked', async () => {
    const db = makeDbMock();
    const result = await maybeSetProfileAvatarFromLinks({
      db,
      clerkUserId: 'user_123',
      profileId: 'profile_123',
      userId: 'uuid_123',
      currentAvatarUrl: null,
      avatarLockedByUser: true,
      links: ['https://example.com'],
    });

    expect(result).toBeNull();
    expect(
      (db as unknown as { insert: unknown }).insert
    ).not.toHaveBeenCalled();
    expect(
      (db as unknown as { update: unknown }).update
    ).not.toHaveBeenCalled();
  });

  it('returns null when current avatar already exists', async () => {
    const db = makeDbMock();
    const result = await maybeSetProfileAvatarFromLinks({
      db,
      clerkUserId: 'user_123',
      profileId: 'profile_123',
      userId: 'uuid_123',
      currentAvatarUrl: 'https://example.com/existing.png',
      avatarLockedByUser: false,
      links: ['https://example.com'],
    });

    expect(result).toBeNull();
    expect(
      (db as unknown as { insert: unknown }).insert
    ).not.toHaveBeenCalled();
    expect(
      (db as unknown as { update: unknown }).update
    ).not.toHaveBeenCalled();
  });
});
