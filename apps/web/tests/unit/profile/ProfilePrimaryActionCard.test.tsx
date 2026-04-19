import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ProfilePrimaryActionCard,
  type ProfilePrimaryActionCardRelease,
  resolveProfilePrimaryActionCardState,
} from '@/features/profile/ProfilePrimaryActionCard';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'tim',
    spotify_id: '4u',
    name: 'Tim White',
    image_url: '/images/avatars/tim-white-founder.jpg',
    published: true,
    is_verified: true,
    is_featured: true,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
    ...overrides,
  } as Artist;
}

function makeRelease(
  overrides: Partial<ProfilePrimaryActionCardRelease> = {}
): ProfilePrimaryActionCardRelease {
  return {
    title: 'The Deep End',
    slug: 'the-deep-end',
    artworkUrl: '/img/releases/the-deep-end.jpg',
    releaseDate: '2026-05-01T07:00:00.000Z',
    revealDate: '2026-04-18T07:00:00.000Z',
    releaseType: 'single',
    metadata: {
      artistNames: ['Tim White', 'Cosmic Gate'],
    },
    ...overrides,
  };
}

function makeTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'tour-1',
    profileId: 'artist-1',
    externalId: 'tour-1',
    provider: 'manual',
    title: 'The Deep End Tour',
    startDate: '2026-05-18T03:00:00.000Z',
    startTime: '20:00',
    timezone: 'America/Los_Angeles',
    venueName: 'The Novo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: 34.043,
    longitude: -118.267,
    ticketUrl: 'https://tickets.example.com/the-novo',
    ticketStatus: 'available',
    lastSyncedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('resolveProfilePrimaryActionCardState', () => {
  const now = new Date('2026-04-20T12:00:00.000Z');

  it('prioritizes countdown releases above all other states', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: makeRelease(),
      profileSettings: { showOldReleases: true },
      nextTourDate: makeTourDate(),
      nearbyTourDate: makeTourDate({ id: 'tour-nearby' }),
      featuredPlaylistFallback: {
        playlistId: 'playlist-1',
        title: 'This Is Tim White',
        url: 'https://open.spotify.com/playlist/playlist-1',
        imageUrl: '/img/releases/the-deep-end.jpg',
        artistSpotifyId: '4u',
        source: 'serp_html',
        discoveredAt: now.toISOString(),
        searchQuery: 'tim white playlist',
        confirmedAt: now.toISOString(),
      },
      hasPlayableDestinations: true,
      now,
    });

    expect(result.kind).toBe('release_countdown');
  });

  it('returns the live release state when the release is already out', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: makeRelease({
        releaseDate: '2026-03-10T07:00:00.000Z',
        revealDate: null,
      }),
      profileSettings: { showOldReleases: true },
      nextTourDate: makeTourDate(),
      nearbyTourDate: makeTourDate({ id: 'tour-nearby' }),
      featuredPlaylistFallback: null,
      hasPlayableDestinations: true,
      now,
    });

    expect(result.kind).toBe('release_live');
  });

  it('prefers a nearby tour over the next tour fallback', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: null,
      profileSettings: { showOldReleases: true },
      nextTourDate: makeTourDate({ id: 'tour-next' }),
      nearbyTourDate: makeTourDate({ id: 'tour-nearby' }),
      featuredPlaylistFallback: null,
      hasPlayableDestinations: false,
      now,
    });

    expect(result).toMatchObject({
      kind: 'tour_nearby',
      tourDate: { id: 'tour-nearby' },
    });
  });

  it('falls back to the next tour when there is no nearby date', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: null,
      profileSettings: { showOldReleases: true },
      nextTourDate: makeTourDate({ id: 'tour-next' }),
      nearbyTourDate: null,
      featuredPlaylistFallback: null,
      hasPlayableDestinations: false,
      now,
    });

    expect(result).toMatchObject({
      kind: 'tour_next',
      tourDate: { id: 'tour-next' },
    });
  });

  it('uses the playlist fallback when there is no release or tour', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: null,
      profileSettings: { showOldReleases: true },
      nextTourDate: null,
      nearbyTourDate: null,
      featuredPlaylistFallback: {
        playlistId: 'playlist-1',
        title: 'This Is Tim White',
        url: 'https://open.spotify.com/playlist/playlist-1',
        imageUrl: '/img/releases/the-deep-end.jpg',
        artistSpotifyId: '4u',
        source: 'serp_html',
        discoveredAt: now.toISOString(),
        searchQuery: 'tim white playlist',
        confirmedAt: now.toISOString(),
      },
      hasPlayableDestinations: false,
      now,
    });

    expect(result.kind).toBe('playlist_fallback');
  });

  it('uses the listen fallback when destinations exist but no richer state is available', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: null,
      profileSettings: { showOldReleases: true },
      nextTourDate: null,
      nearbyTourDate: null,
      featuredPlaylistFallback: null,
      hasPlayableDestinations: true,
      now,
    });

    expect(result.kind).toBe('listen_fallback');
  });

  it('returns none when nothing is eligible', () => {
    const result = resolveProfilePrimaryActionCardState({
      artistName: 'Tim White',
      latestRelease: null,
      profileSettings: { showOldReleases: true },
      nextTourDate: null,
      nearbyTourDate: null,
      featuredPlaylistFallback: null,
      hasPlayableDestinations: false,
      now,
    });

    expect(result.kind).toBe('none');
  });
});

describe('ProfilePrimaryActionCard', () => {
  it('renders collaborator metadata as a compact w/ line', () => {
    render(
      <ProfilePrimaryActionCard
        artist={makeArtist()}
        latestRelease={makeRelease({
          releaseDate: '2026-03-10T07:00:00.000Z',
          revealDate: null,
        })}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations={true}
        renderMode='preview'
        previewActionLabel='Listen'
        size='showcase'
        now={new Date('2026-04-20T12:00:00.000Z')}
      />
    );

    expect(screen.getByText('The Deep End')).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('w/ Cosmic Gate')).toBeInTheDocument();
    expect(screen.getByText('Listen')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'The Deep End artwork' })
    ).toBeInTheDocument();
  });
});
