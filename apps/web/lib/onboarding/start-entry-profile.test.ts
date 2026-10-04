import { describe, expect, it } from 'vitest';
import {
  buildStartEntryDraft,
  buildStartEntryProfile,
  readStartEntryHandle,
  type StartEntryProfileSource,
} from './start-entry-profile';

const PREBUILT: StartEntryProfileSource = {
  usernameNormalized: 'megaran',
  displayName: 'Mega Ran | Instagram, Facebook, Twitch',
  avatarUrl: 'https://blob.example.com/avatars/megaran.avif',
  isPublic: true,
  isClaimed: false,
  spotifyId: null,
  spotifyUrl: null,
  genres: null,
  socialLinks: [
    { url: 'https://instagram.com/megaran', platform: 'instagram' },
    { url: 'https://twitch.tv/megaran', platform: 'Twitch' },
    { url: 'http://insecure.example.com', platform: 'website' },
    { url: 'not a url', platform: 'website' },
  ],
};

describe('readStartEntryHandle', () => {
  it.each([
    [{ handle: 'MegaRan' }, 'megaran'],
    [{ handle: ' @megaran ' }, 'megaran'],
    [{ handle: 'ab' }, null],
    [{ handle: 'bad handle!' }, null],
    [{ handle: ['a', 'b'] }, null],
    [{}, null],
  ])('reads %j as %s', (params, expected) => {
    expect(readStartEntryHandle(params)).toBe(expected);
  });
});

describe('buildStartEntryProfile', () => {
  it('shows a prebuilt page with a clean name and only https links', () => {
    expect(buildStartEntryProfile('megaran', PREBUILT)).toEqual({
      status: 'claimable',
      handle: 'megaran',
      displayName: 'Mega Ran',
      avatarUrl: 'https://blob.example.com/avatars/megaran.avif',
      spotifyId: null,
      spotifyUrl: null,
      genres: [],
      socialLinks: [
        'https://instagram.com/megaran',
        'https://twitch.tv/megaran',
      ],
      linkPlatforms: ['instagram', 'twitch', 'website'],
      linkCount: 4,
    });
  });

  it('marks a claimed page as taken without leaking its links', () => {
    expect(
      buildStartEntryProfile('tim', {
        ...PREBUILT,
        usernameNormalized: 'tim',
        displayName: 'Tim White',
        isClaimed: true,
      })
    ).toEqual({
      status: 'claimed',
      handle: 'tim',
      displayName: 'Tim White',
      avatarUrl: PREBUILT.avatarUrl,
    });
  });

  it('never reveals a private profile', () => {
    expect(
      buildStartEntryProfile('megaran', { ...PREBUILT, isPublic: false })
    ).toBeNull();
  });

  it('treats an unknown handle as open to claim', () => {
    expect(buildStartEntryProfile('newartist', null)).toEqual({
      status: 'available',
      handle: 'newartist',
    });
  });
});

describe('buildStartEntryDraft', () => {
  it('drafts the claim message for claimable and open handles only', () => {
    expect(buildStartEntryDraft({ status: 'available', handle: 'x-y' })).toBe(
      'I want to claim jov.ie/x-y.'
    );
    expect(
      buildStartEntryDraft({
        status: 'claimed',
        handle: 'tim',
        displayName: 'Tim',
        avatarUrl: null,
      })
    ).toBeNull();
    expect(buildStartEntryDraft(null)).toBeNull();
  });
});
