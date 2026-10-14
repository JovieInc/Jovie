import { describe, expect, it } from 'vitest';
import {
  findSurfaceDspMatch,
  formatPresenceRank,
  getPresenceEntityName,
  getPresenceHandle,
  getPresenceObservation,
  getPresenceOutcomeGroup,
  getPresenceRowTitle,
  identityPhotoAlt,
  isPresenceObservationStale,
  resolveIdentityPhoto,
  summarizePresenceOutcomes,
} from './presence-identity';

const now = new Date('2026-09-16T12:00:00.000Z');

describe('presence identity', () => {
  it('does not certify a cached connector image without image observation evidence', () => {
    const photo = resolveIdentityPhoto({
      kind: 'dsp',
      artistAvatarUrl: 'https://cdn.jov.ie/artist.jpg',
      connectorImageUrl: 'https://i.scdn.co/image/spotify.jpg',
      metadata: { ogImage: 'https://example.com/album.jpg' },
      observedAt: now.toISOString(),
      now,
    });

    expect(photo).toMatchObject({
      url: 'https://i.scdn.co/image/spotify.jpg',
      source: 'connector',
      kind: 'profile',
      verified: false,
      freshness: 'current',
    });
  });

  it('does not present MusicFetch reference artwork as an Anghami profile portrait', () => {
    const reference = 'https://is1-ssl.mzstatic.com/image/reference.jpg';
    const photo = resolveIdentityPhoto({
      kind: 'dsp',
      connectorImageUrl: reference,
      connectorMatchSource: 'musicfetch',
      metadata: { profileImageUrl: reference, ogImage: reference },
      observedAt: '2026-04-12T02:06:27.166Z',
      now,
    });
    expect(photo).toMatchObject({
      url: null,
      source: 'none',
      kind: 'missing',
      verified: false,
    });
  });

  it('preserves independent public page metadata while excluding the shared reference photo', () => {
    const photo = resolveIdentityPhoto({
      kind: 'dsp',
      connectorImageUrl: 'https://is1-ssl.mzstatic.com/image/reference.jpg',
      connectorMatchSource: 'musicfetch',
      metadata: {
        profileImageUrl: 'https://artwork.anghcdn.co/profile-observation.jpg',
      },
      observedAt: now.toISOString(),
      now,
    });
    expect(photo).toMatchObject({
      url: 'https://artwork.anghcdn.co/profile-observation.jpg',
      source: 'public_metadata',
      kind: 'profile',
      verified: false,
    });
  });

  it.each(['profile', 'generic'] as const)(
    'retains a later independent %s image after skipping the MusicFetch reference',
    kind => {
      const reference = 'https://is1-ssl.mzstatic.com/image/reference.jpg';
      const independent = 'https://artwork.anghcdn.co/independent.jpg';
      const photo = resolveIdentityPhoto({
        kind: 'dsp',
        connectorImageUrl: reference,
        connectorMatchSource: 'musicfetch',
        metadata:
          kind === 'profile'
            ? { avatarUrl: reference, profileImageUrl: independent }
            : {
                avatarUrl: reference,
                ogImage: reference,
                imageUrl: independent,
              },
        observedAt: now.toISOString(),
        now,
      });
      expect(photo).toMatchObject({
        url: independent,
        source: 'public_metadata',
        kind,
        verified: false,
      });
    }
  );

  it('does not label generic OG or album images as verified avatars', () => {
    const photo = resolveIdentityPhoto({
      kind: 'dsp',
      metadata: { ogImage: 'https://www.7digital.com/og-card.jpg' },
      observedAt: now.toISOString(),
      now,
    });

    expect(photo).toMatchObject({
      url: 'https://www.7digital.com/og-card.jpg',
      source: 'public_metadata',
      kind: 'generic',
      verified: false,
    });
    expect(identityPhotoAlt('Tim White', '7digital', photo)).toMatch(
      /not a verified profile photo/i
    );
  });

  it('falls back honestly when no photo source exists', () => {
    const photo = resolveIdentityPhoto({
      kind: 'social',
      now,
    });

    expect(photo.kind).toBe('missing');
    expect(photo.verified).toBe(false);
    expect(photo.url).toBeNull();
  });

  it('marks stale photos without treating missing data as a zero score', () => {
    const observedAt = '2026-08-01T00:00:00.000Z';
    const photo = resolveIdentityPhoto({
      kind: 'jovie',
      artistAvatarUrl: 'https://cdn.jov.ie/tim.jpg',
      observedAt,
      now,
    });

    expect(photo.freshness).toBe('stale');
    expect(isPresenceObservationStale(observedAt, now)).toBe(true);
    expect(formatPresenceRank(null, 'pending')).toBe('Not Measured');
    expect(formatPresenceRank(null, 'measured')).toBe('Not Ranked');
    expect(formatPresenceRank(0, 'measured')).toBe('#0');
  });

  it('summarizes search as unavailable, pending, stale, or measured', () => {
    const search = (
      overrides: Partial<Parameters<typeof summarizePresenceOutcomes>[0]>
    ) =>
      summarizePresenceOutcomes({
        artistName: 'Tim White',
        artistIsPublic: true,
        providerAvailable: true,
        bestJovieRank: null,
        lastObservedAt: null,
        rows: [],
        now,
        ...overrides,
      }).find(item => item.group === 'search');

    expect(
      search({
        providerAvailable: false,
        lastObservedAt: '2026-09-15T12:00:00.000Z',
        bestJovieRank: 4,
      })
    ).toMatchObject({
      status: 'unavailable',
      value: 'Unavailable',
      detail: 'Search provider is unavailable',
      attentionCount: 1,
    });
    expect(search({})).toMatchObject({
      status: 'pending',
      value: 'Not Measured',
      detail: 'No search run has completed yet',
      attentionCount: 1,
    });
    expect(
      search({
        lastObservedAt: '2026-08-01T00:00:00.000Z',
        bestJovieRank: 4,
      })
    ).toMatchObject({
      status: 'stale',
      value: '#4',
      detail: 'Last search check is older than two weeks',
      attentionCount: 1,
    });
    expect(
      search({ lastObservedAt: '2026-09-15T12:00:00.000Z' })
    ).toMatchObject({
      status: 'measured',
      value: 'Not Ranked',
      detail: 'Best measured Jovie rank',
      attentionCount: 0,
    });
    expect(search({ bestJovieRank: 0 })).toMatchObject({
      status: 'measured',
      value: '#0',
      detail: 'Best measured Jovie rank',
      attentionCount: 0,
    });
  });

  it('prefers a clean entity name and handle over repeated domain/path', () => {
    const sevenDigital = {
      kind: 'dsp',
      platform: 'seven_digital',
      label: '7digital',
      handle: null,
      url: 'https://www.7digital.com/artist/tim-white',
    };

    expect(getPresenceEntityName(sevenDigital, 'Tim White')).toBe('Tim White');
    // Inventory rows name the platform; generated titles collapse to it.
    expect(
      getPresenceRowTitle(
        { platform: 'spotify', label: 'Tim White on spotify' },
        'Tim White'
      )
    ).toBe('Spotify');
    expect(
      getPresenceRowTitle(
        { platform: 'venmo', label: 'Tip on Venmo' },
        'Tim White'
      )
    ).toBe('Tip on Venmo');
    // Generated "<artist> on <platform>" titles collapse to the entity name;
    // the row subtitle already carries the platform.
    expect(
      getPresenceEntityName(
        { kind: 'social', platform: 'spotify', label: 'Tim White on spotify' },
        'Tim White'
      )
    ).toBe('Tim White');
    expect(
      getPresenceEntityName(
        { kind: 'social', platform: 'venmo', label: 'Tip on Venmo' },
        'Tim White'
      )
    ).toBe('Tip on Venmo');
    expect(getPresenceHandle(sevenDigital)).toBeNull();
    expect(
      getPresenceEntityName(
        {
          kind: 'connector',
          platform: 'gmail',
          label: 'Gmail',
        },
        'Tim White'
      )
    ).toBe('Gmail');

    expect(
      getPresenceHandle({
        kind: 'social',
        handle: '@very-long-handle-that-should-remain-intact',
        url: 'https://instagram.com/very-long-handle-that-should-remain-intact',
      })
    ).toBe('@very-long-handle-that-should-remain-intact');
  });

  it('groups observations without calling missing data a failed check', () => {
    expect(
      getPresenceObservation({
        monitoringState: 'locked',
        rank: null,
        lastObservedAt: null,
      }).status
    ).toBe('plan-restricted');
    expect(
      getPresenceObservation({
        monitoringState: 'active',
        rank: null,
        lastObservedAt: null,
      })
    ).toMatchObject({ status: 'pending', label: 'Not Measured' });
    expect(
      getPresenceObservation(
        {
          monitoringState: 'active',
          rank: 4,
          lastObservedAt: '2026-08-01T00:00:00.000Z',
        },
        { now }
      ).status
    ).toBe('stale');
    expect(getPresenceOutcomeGroup({ kind: 'dsp' })).toBe('profiles');
  });

  it('summarizes Identity/Profiles/Catalog/Search outcomes', () => {
    const summaries = summarizePresenceOutcomes({
      artistName: 'Tim White',
      artistIsPublic: true,
      providerAvailable: true,
      bestJovieRank: 2,
      lastObservedAt: now.toISOString(),
      now,
      rows: [
        {
          kind: 'jovie',
          platform: 'jovie',
          label: 'Jovie Profile',
          handle: '@tim',
          url: 'https://jov.ie/tim',
          monitoringState: 'active',
          rank: 2,
          lastObservedAt: now.toISOString(),
        },
        {
          kind: 'dsp',
          platform: 'spotify',
          label: 'Spotify',
          handle: null,
          url: 'https://open.spotify.com/artist/tim',
          monitoringState: 'locked',
          rank: null,
          lastObservedAt: now.toISOString(),
        },
      ],
    });

    expect(summaries.map(item => item.group)).toEqual([
      'identity',
      'profiles',
      'catalog',
      'search',
    ]);
    expect(summaries[0]?.value).toBe('1 Page');
    expect(summaries[1]?.value).toBe('1 Page');
    expect(summaries[2]?.value).toBe('0 Pages');
    expect(summaries[3]?.value).toBe('#2');
  });
});

describe('exact DSP source identity', () => {
  const matches = [
    {
      providerId: 'spotify',
      externalArtistUrl: 'https://open.spotify.com/artist/a',
      externalArtistId: 'a',
    },
  ];
  it('does not reuse another artist photo merely because the platform matches', () => {
    expect(
      findSurfaceDspMatch(
        {
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/b',
          externalId: 'b',
        },
        matches
      )
    ).toBeUndefined();
  });
  it('binds an exact URL or provider artist ID and rejects a cross-provider ID collision', () => {
    expect(
      findSurfaceDspMatch(
        {
          platform: 'spotify',
          url: matches[0].externalArtistUrl,
          externalId: null,
        },
        matches
      )
    ).toBe(matches[0]);
    expect(
      findSurfaceDspMatch(
        {
          platform: 'spotify',
          url: 'https://open.spotify.com/artist/a?locale=en',
          externalId: 'a',
        },
        matches
      )
    ).toBe(matches[0]);
    expect(
      findSurfaceDspMatch(
        {
          platform: 'deezer',
          url: 'https://deezer.com/artist/a',
          externalId: 'a',
        },
        matches
      )
    ).toBeUndefined();
  });
});
