import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
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

describe('ProfileHomeRail', () => {
  it('uses an alerts bento fallback instead of the generic listen card', () => {
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
    expect(
      screen.queryByRole('button', { name: /Turn On/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-home-feature-card')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Listen across your preferred platforms')).toBe(
      null
    );
  });

  it('renders alerts plus the compact primary card when a real release exists', () => {
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

    expect(screen.getByTestId('profile-home-alerts-row')).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-home-alerts-switch')
    ).toBeInTheDocument();
    expect(screen.getByTestId('profile-home-feature-card')).toBeInTheDocument();
    expect(screen.getByText('The Deep End')).toBeInTheDocument();
  });

  it('hides the alerts card entirely once subscribed', () => {
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
      screen.queryByTestId('profile-home-alerts-row')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-home-feature-card')).toBeInTheDocument();
  });
});
