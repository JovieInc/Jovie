import { describe, expect, it } from 'vitest';
import {
  buildStartEntryDraft,
  buildStartEntryProfile,
  buildStartEntryResumeHref,
  readStartEntryHandle,
  type StartEntryProfileSource,
  withStartEntryDisplayName,
} from './start-entry-profile';

describe('name-to-claim context', () => {
  it('supports the native GET name entry without client normalization', () => {
    expect(readStartEntryHandle({ entry: 'Beyoncé Knowles', handle: '' })).toBe(
      'beyonce-knowles'
    );
    expect(
      readStartEntryHandle({ entry: 'tim white', handle: 'chosen-address' })
    ).toBe('chosen-address');
    expect(
      readStartEntryHandle({ entry: 'https://jov.ie/tim', handle: '' })
    ).toBeNull();
  });
  it('preserves the name through reload, explicit continuation and the signin return path', () => {
    const entry = withStartEntryDisplayName(
      { status: 'available', handle: 'tim-white' },
      { display_name: 'Tim White' }
    );
    expect(entry).toEqual({
      status: 'available',
      handle: 'tim-white',
      displayName: 'Tim White',
    });
    expect(buildStartEntryDraft(entry)).toContain('My name is "Tim White"');
    const resumed = new URL(buildStartEntryResumeHref(entry), 'https://jov.ie');
    expect(resumed.searchParams.get('handle')).toBe('tim-white');
    expect(resumed.searchParams.get('display_name')).toBe('Tim White');
    expect(
      withStartEntryDisplayName(
        { status: 'available', handle: 'tim-white' },
        Object.fromEntries(resumed.searchParams)
      )
    ).toEqual(entry);
    expect(buildStartEntryDraft(entry)).not.toMatch(
      /saved|verified|available|reserved/i
    );
  });
  it('never overrides known catalog identity with a name hint', () => {
    const entry = buildStartEntryProfile('megaran', PREBUILT);
    expect(
      withStartEntryDisplayName(entry, { display_name: 'Someone Else' })
    ).toEqual(entry);
    expect(
      withStartEntryDisplayName(
        { status: 'available', handle: 'draft' },
        { display_name: 'https://example.com' }
      )
    ).toEqual({ status: 'available', handle: 'draft' });
  });
});

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
      spotifyFollowers: null,
      latestRelease: null,
      genres: [],
      socialLinks: [
        'https://instagram.com/megaran',
        'https://twitch.tv/megaran',
      ],
      linkPlatforms: ['instagram', 'twitch'],
      linkCount: 2,
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

  it('reuses public catalog data without exposing private release fields', () => {
    const release = {
      title: 'Actual release',
      slug: 'actual-release',
      artworkUrl: 'https://cdn.example.com/release.webp',
      releaseDate: '2026-10-20',
      releaseType: 'single',
      ownerEmail: 'private@example.com',
    };
    const result = buildStartEntryProfile('megaran', {
      ...PREBUILT,
      spotifyFollowers: 42,
      latestRelease: release,
    });
    expect(result).toMatchObject({
      spotifyFollowers: 42,
      latestRelease: {
        title: 'Actual release',
        artworkUrl: release.artworkUrl,
      },
    });
    expect(
      result?.status === 'claimable' && result.latestRelease
    ).not.toHaveProperty('ownerEmail');
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
