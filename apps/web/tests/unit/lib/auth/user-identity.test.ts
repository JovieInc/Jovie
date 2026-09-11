import { describe, expect, it } from 'vitest';
import { resolveUserIdentity } from '@/lib/auth/user-identity';

describe('resolveUserIdentity', () => {
  it('prefers private metadata, then user name fields, then email local part', () => {
    expect(
      resolveUserIdentity({
        primaryEmailAddress: { emailAddress: 'Ada.Lovelace@jov.ie' },
        privateMetadata: { fullName: 'Ada Lovelace' },
        fullName: 'Ignored Full',
      }).displayNameSource
    ).toBe('private_metadata_full_name');

    expect(
      resolveUserIdentity({
        fullName: 'Ada Lovelace',
        firstName: 'Ada',
      }).displayNameSource
    ).toBe('user_full_name');

    expect(
      resolveUserIdentity({
        firstName: 'Ada',
        lastName: 'Lovelace',
      }).displayNameSource
    ).toBe('user_name_parts');

    expect(
      resolveUserIdentity({
        username: 'ada',
      }).displayNameSource
    ).toBe('user_username');

    expect(
      resolveUserIdentity({
        primaryEmailAddress: { emailAddress: 'ada.lovelace@jov.ie' },
      })
    ).toEqual(
      expect.objectContaining({
        email: 'ada.lovelace@jov.ie',
        displayName: 'ada lovelace',
        displayNameSource: 'email_local_part',
      })
    );
  });

  it('returns empty identity when no user is present', () => {
    expect(resolveUserIdentity(null)).toEqual({
      email: null,
      displayName: null,
      avatarUrl: null,
      spotifyUsername: null,
      displayNameSource: null,
    });
  });
});
