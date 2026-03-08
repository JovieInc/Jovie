import { describe, expect, it } from 'vitest';
import { BASE_URL } from '@/constants/app';
import { getProfileOgImageUrl } from '@/lib/profile/og-image';

describe('getProfileOgImageUrl', () => {
  it('normalizes username casing and builds API OG URL', () => {
    expect(getProfileOgImageUrl('TimWhite')).toBe(
      `${BASE_URL}/api/og/timwhite`
    );
  });

  it('encodes usernames with safe URL characters', () => {
    expect(getProfileOgImageUrl('The Artist')).toBe(
      `${BASE_URL}/api/og/the%20artist`
    );
  });
});
