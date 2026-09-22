import { describe, expect, it } from 'vitest';
import {
  formatPresenceRank,
  getPresenceEntityName,
  getPresenceHandle,
  getPresenceObservation,
  getPresenceOutcomeGroup,
  identityPhotoAlt,
  isPresenceObservationStale,
  resolveIdentityPhoto,
  summarizePresenceOutcomes,
} from './presence-identity';

const now = new Date('2026-09-16T12:00:00.000Z');

describe('presence identity', () => {
  it('uses connector photos as verified profile images', () => {
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
      verified: true,
      freshness: 'current',
    });
  });

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

  it('prefers a clean entity name and handle over repeated domain/path', () => {
    const sevenDigital = {
      kind: 'dsp',
      platform: 'seven_digital',
      label: '7digital',
      handle: null,
      url: 'https://www.7digital.com/artist/tim-white',
    };

    expect(getPresenceEntityName(sevenDigital, 'Tim White')).toBe('Tim White');
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
