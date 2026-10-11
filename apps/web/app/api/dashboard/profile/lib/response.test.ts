import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateHomepageCache = vi.hoisted(() => vi.fn());
const invalidateProfileCache = vi.hoisted(() => vi.fn());
const invalidateReleaseCaches = vi.hoisted(() => vi.fn());
const invalidateUsernameChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/cache/profile', () => ({
  invalidateHomepageCache,
  invalidateProfileCache,
  invalidateUsernameChange,
}));

vi.mock('@/lib/cache/releases', () => ({
  invalidateReleaseCaches,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(() =>
    Promise.resolve({ ok: true, eventId: 'analytics-event-id' })
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

import { finalizeProfileResponse } from './response';

function profile(usernameNormalized: string) {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    usernameNormalized,
  } as Parameters<typeof finalizeProfileResponse>[0]['updatedProfile'];
}

describe('finalizeProfileResponse cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses username-change invalidation for a renamed profile', async () => {
    await finalizeProfileResponse({
      updatedProfile: profile('newartist'),
      oldUsernameNormalized: 'oldartist',
      clerkUserId: '11111111-1111-4111-8111-111111111111',
    });

    expect(invalidateUsernameChange).toHaveBeenCalledExactlyOnceWith(
      'newartist',
      'oldartist'
    );
    expect(invalidateProfileCache).not.toHaveBeenCalled();
    expect(invalidateReleaseCaches).toHaveBeenCalledExactlyOnceWith(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
  });

  it('uses regular profile invalidation when the handle is unchanged', async () => {
    await finalizeProfileResponse({
      updatedProfile: profile('sameartist'),
      oldUsernameNormalized: 'sameartist',
      clerkUserId: '11111111-1111-4111-8111-111111111111',
    });

    expect(invalidateProfileCache).toHaveBeenCalledExactlyOnceWith(
      'sameartist'
    );
    expect(invalidateHomepageCache).toHaveBeenCalledOnce();
    expect(invalidateUsernameChange).not.toHaveBeenCalled();
    expect(invalidateReleaseCaches).toHaveBeenCalledExactlyOnceWith(
      '11111111-1111-4111-8111-111111111111',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
  });
});
