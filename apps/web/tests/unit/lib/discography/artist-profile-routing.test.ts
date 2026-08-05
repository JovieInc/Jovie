import { describe, expect, it } from 'vitest';
import {
  artistProfileHref,
  buildUnclaimedArtistHandle,
} from '@/lib/discography/artist-profile-routing';

describe('artist profile routing', () => {
  it('pins a deterministic full-UUID handle without reserving a name', () => {
    const artistId = 'f5441adb-6789-449a-9553-ab7460c9c61c';
    const handle = buildUnclaimedArtistHandle(artistId);

    expect(handle).toBe('a_eiqd46x3irj64dlgo8a3glau4');
    expect(handle).toHaveLength(27);
    expect(handle).toMatch(/^[a-z0-9_]+$/);
    expect(handle).not.toContain('austin');
  });

  it('keeps different registry IDs collision-safe even for same-name artists', () => {
    expect(
      buildUnclaimedArtistHandle('f5441adb-6789-449a-9553-ab7460c9c61c')
    ).not.toBe(
      buildUnclaimedArtistHandle('3cefe948-7521-465f-813a-95ae15e3141e')
    );
  });

  it('builds a stable encoded inbound entity route', () => {
    expect(artistProfileHref('f5441adb-6789-449a-9553-ab7460c9c61c')).toBe(
      '/artists/f5441adb-6789-449a-9553-ab7460c9c61c'
    );
  });

  it('rejects malformed registry IDs instead of inventing a route handle', () => {
    expect(() => buildUnclaimedArtistHandle('Austin Leeds')).toThrow(
      'Artist ID must be a UUID'
    );
  });
});
