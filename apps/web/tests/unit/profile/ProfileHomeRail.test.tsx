import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
import type { PublicRelease } from '@/features/profile/releases/types';
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
    releaseDate: '2026-03-10T07:00:00.000Z',
    revealDate: null,
    releaseType: 'single',
    metadata: null,
    ...overrides,
  };
}

function makePublicRelease(
  overrides: Partial<PublicRelease> = {}
): PublicRelease {
  return {
    id: 'catalog-release',
    title: 'Back Catalog',
    slug: 'back-catalog',
    releaseType: 'single',
    releaseDate: '2025-01-10T07:00:00.000Z',
    revealDate: null,
    artworkUrl: '/img/releases/back-catalog.jpg',
    artistNames: ['Tim White'],
    ...overrides,
  };
}

describe('ProfileHomeRail', () => {
  it('pins the alerts bento above the carousel and renders no carousel when empty', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={null}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    expect(
      screen.getByTestId('profile-home-alerts-fallback-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-home-alerts-switch')
    ).toBeInTheDocument();
    // No items → carousel renders nothing (no empty shell).
    expect(
      screen.queryByTestId('profile-home-carousel')
    ).not.toBeInTheDocument();
  });

  it('renders the latest release as the featured carousel card', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={null}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    expect(
      screen.getByTestId('profile-home-alerts-fallback-card')
    ).toBeInTheDocument();
    expect(screen.getByTestId('profile-home-carousel')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The Deep End' })
    ).toBeInTheDocument();
  });

  it('adds back-catalog releases without duplicating the featured release', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={null}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
        releases={[
          makePublicRelease({
            id: 'release-featured',
            title: 'The Deep End',
            slug: 'the-deep-end',
          }),
          makePublicRelease({
            id: 'release-catalog',
            title: 'Under Lights',
            slug: 'under-lights',
          }),
        ]}
      />
    );

    expect(screen.getByTestId('profile-home-carousel')).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { name: 'The Deep End' })
    ).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: 'Under Lights' })
    ).toBeInTheDocument();
  });

  it('hides the alerts card once subscribed but keeps the carousel', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={null}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed
      />
    );

    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-home-carousel')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'The Deep End' })
    ).toBeInTheDocument();
  });
});
