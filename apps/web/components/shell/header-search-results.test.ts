import { describe, expect, it } from 'vitest';
import { buildHeaderSearchGroups } from './header-search-results';

describe('buildHeaderSearchGroups', () => {
  it('builds typed matching groups with canonical deep links', () => {
    const groups = buildHeaderSearchGroups('midnight', {
      conversations: [
        {
          id: 'thread-1',
          title: 'Midnight rollout',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      profiles: [
        {
          id: 'profile-1',
          displayName: 'Midnight Artist',
          username: 'midnight-artist',
          usernameNormalized: 'midnight-artist',
        },
      ],
      releases: [
        {
          id: 'release-1',
          title: 'Midnight Drive',
          artistNames: ['Midnight Artist'],
          smartLinkPath: '/midnight-artist/midnight-drive',
        },
      ],
    });

    expect(groups.map(group => group.kind)).toEqual([
      'threads',
      'entities',
      'library-assets',
    ]);
    expect(groups[0]?.items[0]?.href).toBe('/app/chat/thread-1');
    expect(groups[1]?.items[0]?.href).toBe('/midnight-artist');
    expect(groups[2]?.items[0]?.href).toBe('/midnight-artist/midnight-drive');
    expect(groups[0]?.items[0]).toMatchObject({
      label: 'Midnight rollout',
      description: 'Chat thread',
    });
    expect(groups[1]?.items[0]).toMatchObject({
      label: 'Midnight Artist',
      description: '@midnight-artist',
    });
    expect(groups[2]?.items[0]).toMatchObject({
      label: 'Midnight Drive',
      description: 'Midnight Artist',
    });
  });

  it('matches release artists and preserves fallbacks and encoded links', () => {
    const catalog = {
      conversations: [
        {
          id: 'thread/with space',
          title: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      profiles: [
        {
          id: 'profile-1',
          displayName: null,
          username: 'artist/name',
          usernameNormalized: 'artist/name',
        },
      ],
      releases: [
        {
          id: 'release-1',
          title: 'Sunrise',
          artistNames: ['Midnight Artist'],
          smartLinkPath: '/midnight-artist/sunrise',
        },
      ],
    };

    const untitledThread = buildHeaderSearchGroups('untitled', catalog);
    expect(untitledThread[0]?.items[0]).toMatchObject({
      label: 'Untitled chat',
      href: '/app/chat/thread%2Fwith%20space',
    });

    const encodedProfile = buildHeaderSearchGroups('artist/name', catalog);
    expect(encodedProfile[0]?.items[0]).toMatchObject({
      label: 'artist/name',
      href: '/artist%2Fname',
    });

    const artistRelease = buildHeaderSearchGroups('midnight artist', catalog);
    expect(artistRelease[0]?.items[0]).toMatchObject({
      label: 'Sunrise',
      description: 'Midnight Artist',
      href: '/midnight-artist/sunrise',
    });
  });

  it('limits every typed group to five results', () => {
    const indexes = Array.from({ length: 6 }, (_, index) => index);
    const groups = buildHeaderSearchGroups('match', {
      conversations: indexes.map(index => ({
        id: `thread-${index}`,
        title: `Match thread ${index}`,
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      })),
      profiles: indexes.map(index => ({
        id: `profile-${index}`,
        displayName: `Match artist ${index}`,
        username: `match-${index}`,
        usernameNormalized: `match-${index}`,
      })),
      releases: indexes.map(index => ({
        id: `release-${index}`,
        title: `Match release ${index}`,
        artistNames: [],
        smartLinkPath: `/match-${index}`,
      })),
    });

    expect(groups).toHaveLength(3);
    expect(groups.every(group => group.items.length === 5)).toBe(true);
  });

  it('omits unmatched groups and requires a non-empty query', () => {
    const catalog = {
      conversations: [],
      profiles: [
        {
          id: 'profile-1',
          displayName: 'Aria',
          username: 'aria',
          usernameNormalized: 'aria',
        },
      ],
      releases: [],
    };

    expect(buildHeaderSearchGroups('', catalog)).toEqual([]);
    expect(buildHeaderSearchGroups('no match', catalog)).toEqual([]);
  });
});
