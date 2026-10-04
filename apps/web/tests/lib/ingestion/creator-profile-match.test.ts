// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectMock, selectResults } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const selectMock = vi.fn(() => {
    const rows = selectResults.shift() ?? [];
    const promise = Promise.resolve(rows);
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'innerJoin', 'where', 'limit']) {
      builder[method] = () => builder;
    }
    builder.then = promise.then.bind(promise);
    return builder;
  });
  return { selectMock, selectResults };
});

vi.mock('@/lib/db', () => ({ db: { select: selectMock } }));
vi.mock('@/lib/db/schema/links', () => ({ socialLinks: {} }));
vi.mock('@/lib/db/schema/profiles', () => ({ creatorProfiles: {} }));

import {
  findProfileForSource,
  isSameSourceIdentity,
  youtubeChannelKey,
} from '@/lib/ingestion/creator-profile-match';

describe('youtubeChannelKey', () => {
  it.each([
    ['https://www.youtube.com/@Creator/about', 'handle:creator'],
    ['https://youtube.com/@creator', 'handle:creator'],
    [
      'https://www.youtube.com/channel/UCabcdefghijklmnopqr12/about',
      'channel:ucabcdefghijklmnopqr12',
    ],
    ['https://www.youtube.com/c/SomeName', 'c:somename'],
  ])('keys %s as %s', (url, key) => {
    expect(youtubeChannelKey(url)).toBe(key);
  });

  it('keeps @handle, /channel, and /c identities distinct', () => {
    expect(youtubeChannelKey('https://www.youtube.com/@same/about')).not.toBe(
      youtubeChannelKey('https://www.youtube.com/c/same')
    );
    expect(youtubeChannelKey('https://www.youtube.com/c/same')).not.toBe(
      youtubeChannelKey('https://www.youtube.com/channel/same')
    );
  });

  it('returns null for non-channel paths and invalid URLs', () => {
    expect(youtubeChannelKey('https://www.youtube.com/')).toBeNull();
    expect(youtubeChannelKey('not a url')).toBeNull();
  });
});

describe('isSameSourceIdentity', () => {
  const source = 'https://www.youtube.com/@creator/about';

  it('matches the same channel across youtube URL spellings', () => {
    for (const candidate of [
      'https://www.youtube.com/@creator',
      'https://youtube.com/@CREATOR/videos',
      'https://m.youtube.com/@creator',
    ]) {
      expect(isSameSourceIdentity('youtube', source, candidate)).toBe(true);
    }
  });

  it('rejects different channels and same-slug different identities', () => {
    for (const candidate of [
      'https://www.youtube.com/@other',
      'https://www.youtube.com/c/creator',
      'https://www.youtube.com/channel/creator',
      'https://example.com/@creator',
    ]) {
      expect(isSameSourceIdentity('youtube', source, candidate)).toBe(false);
    }
  });

  it('matches handles case-insensitively on non-youtube platforms', () => {
    expect(
      isSameSourceIdentity(
        'instagram',
        'https://www.instagram.com/creator',
        'https://instagram.com/@CREATOR'
      )
    ).toBe(true);
    expect(
      isSameSourceIdentity(
        'tiktok',
        'https://www.tiktok.com/@creator',
        'https://tiktok.com/@other'
      )
    ).toBe(false);
    // Same handle on a different platform host is not the same identity.
    expect(
      isSameSourceIdentity(
        'instagram',
        'https://www.instagram.com/creator',
        'https://www.tiktok.com/@creator'
      )
    ).toBe(false);
  });
});

describe('findProfileForSource', () => {
  beforeEach(() => {
    selectResults.length = 0;
    selectMock.mockClear();
  });

  it('returns null without querying when the source has no usable token', async () => {
    await expect(
      findProfileForSource('youtube', 'https://www.youtube.com/')
    ).resolves.toBeNull();
    await expect(
      findProfileForSource('instagram', 'https://www.instagram.com/')
    ).resolves.toBeNull();
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('matches an active social link by handle identity', async () => {
    selectResults.push([
      {
        username: 'creator',
        displayName: 'Creator',
        url: 'https://instagram.com/@CREATOR',
      },
    ]);

    await expect(
      findProfileForSource('instagram', 'https://www.instagram.com/creator')
    ).resolves.toEqual({
      username: 'creator',
      displayName: 'Creator',
      profileUrl: expect.stringContaining('/creator'),
    });
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it('prefers the canonical youtubeUrl over social link rows', async () => {
    selectResults.push(
      [
        {
          username: 'link-user',
          displayName: 'Link',
          url: 'https://www.youtube.com/@creator',
        },
      ],
      [
        {
          username: 'profile-user',
          displayName: 'Profile',
          url: 'https://youtube.com/@creator/about',
        },
      ]
    );

    await expect(
      findProfileForSource('youtube', 'https://www.youtube.com/@creator/videos')
    ).resolves.toMatchObject({ username: 'profile-user' });
    expect(selectMock).toHaveBeenCalledTimes(2);
  });

  it('skips candidates whose URLs name a different channel identity', async () => {
    selectResults.push(
      [
        {
          username: 'other',
          displayName: null,
          url: 'https://www.youtube.com/c/creator',
        },
        { username: 'null-url', displayName: null, url: null },
      ],
      []
    );

    await expect(
      findProfileForSource('youtube', 'https://www.youtube.com/@creator')
    ).resolves.toBeNull();
  });

  it('returns null when no candidates exist', async () => {
    selectResults.push([], []);
    await expect(
      findProfileForSource('youtube', 'https://www.youtube.com/@nobody')
    ).resolves.toBeNull();
  });
});
