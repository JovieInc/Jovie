import { revalidateTag } from 'next/cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

import { invalidateReleaseCaches } from '@/lib/cache/releases';
import { createReleasesTag } from '@/lib/cache/tags';

const USER_ID = 'user-1';
const PROFILE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('invalidateReleaseCaches (JOV-6272)', () => {
  beforeEach(() => {
    vi.mocked(revalidateTag).mockClear();
  });

  it('builds the release family tag as releases:<userId>:<profileId>', () => {
    expect(createReleasesTag(USER_ID, PROFILE_ID)).toBe(
      `releases:${USER_ID}:${PROFILE_ID}`
    );
  });

  it('invalidates private, public, smart-link, and sitemap release consumers', () => {
    invalidateReleaseCaches(USER_ID, PROFILE_ID);

    expect(revalidateTag).toHaveBeenCalledTimes(5);
    expect(revalidateTag).toHaveBeenCalledWith(
      `releases:${USER_ID}:${PROFILE_ID}`,
      'max'
    );
    expect(revalidateTag).toHaveBeenCalledWith(
      `smartlink-content:${PROFILE_ID}`,
      'max'
    );
    expect(revalidateTag).toHaveBeenCalledWith(
      `public-releases:${PROFILE_ID}`,
      'max'
    );
    expect(revalidateTag).toHaveBeenCalledWith('profiles-all', 'max');
    expect(revalidateTag).toHaveBeenCalledWith('sitemap-catalog', 'max');
  });

  it('never invalidates a handle-keyed release tag (one key family)', () => {
    invalidateReleaseCaches(USER_ID, PROFILE_ID);

    const releaseTags = vi
      .mocked(revalidateTag)
      .mock.calls.map(call => call[0] as string)
      .filter(tag => tag.startsWith('releases:'));

    expect(releaseTags).toEqual([`releases:${USER_ID}:${PROFILE_ID}`]);
    // The family is keyed by (userId, profileId) only — exactly two
    // segments after the prefix.
    expect(releaseTags[0]?.split(':')).toHaveLength(3);
  });
});
