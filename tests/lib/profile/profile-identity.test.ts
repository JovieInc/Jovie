import { describe, expect, it } from 'vitest';
import { getProfileIdentity } from '@/lib/profile/profile-identity';

describe('getProfileIdentity', () => {
  it('prefers profileUsername/profileDisplayName and trims', () => {
    const identity = getProfileIdentity({
      profileUsername: '  myname  ',
      profileDisplayName: '  My Name  ',
      artistHandle: 'fallback',
      artistName: 'Fallback',
    });

    expect(identity).toEqual({
      username: 'myname',
      displayName: 'My Name',
      profilePath: '/myname',
    });
  });

  it('strips leading @ and falls back when username empty', () => {
    const identity = getProfileIdentity({
      profileUsername: '   @   ',
      profileDisplayName: '',
      artistHandle: null,
      artistName: null,
    });

    expect(identity.username).toBe('username');
    expect(identity.displayName).toBe('username');
    expect(identity.profilePath).toBe('/username');
  });

  it('falls back to artist identity when profile fields missing', () => {
    const identity = getProfileIdentity({
      profileUsername: undefined,
      profileDisplayName: undefined,
      artistHandle: 'artist-handle',
      artistName: 'Artist Name',
    });

    expect(identity).toEqual({
      username: 'artist-handle',
      displayName: 'Artist Name',
      profilePath: '/artist-handle',
    });
  });
});
