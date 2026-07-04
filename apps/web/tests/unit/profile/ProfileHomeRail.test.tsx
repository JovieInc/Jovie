import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EntityCardModel } from '@/components/organisms/entity-card';
import {
  __profileHomeRailTestUtils,
  ProfileHomeRail,
} from '@/features/profile/ProfileHomeRail';
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
  it('orders approved S2 cards by PAC slot without duplicating ticket and RSVP buckets', () => {
    const merchCard = {
      id: 'merch-1',
      kind: 'merch',
      imageAlt: 'Merch',
      title: 'Tour Tee',
    } satisfies EntityCardModel;
    const showCard = {
      id: 'show-1',
      kind: 'show',
      imageAlt: 'Show',
      title: 'The Novo',
    } satisfies EntityCardModel;

    expect(
      __profileHomeRailTestUtils
        .getS2OrderedItems({
          assignedSlot: 'tickets',
          merchItems: [merchCard],
          showItems: [showCard],
        })
        .map(item => item.id)
    ).toEqual(['show-1', 'merch-1']);

    expect(
      __profileHomeRailTestUtils
        .getS2OrderedItems({
          assignedSlot: 'rsvp',
          merchItems: [merchCard],
          showItems: [showCard],
        })
        .map(item => item.id)
    ).toEqual(['show-1', 'merch-1']);
  });

  it('falls back to existing merch and show order when the assigned S2 slot is unavailable', () => {
    const merchCard = {
      id: 'merch-1',
      kind: 'merch',
      imageAlt: 'Merch',
      title: 'Tour Tee',
    } satisfies EntityCardModel;
    const showCard = {
      id: 'show-1',
      kind: 'show',
      imageAlt: 'Show',
      title: 'The Novo',
    } satisfies EntityCardModel;

    expect(
      __profileHomeRailTestUtils
        .getS2OrderedItems({
          assignedSlot: 'tip',
          merchItems: [merchCard],
          showItems: [showCard],
        })
        .map(item => item.id)
    ).toEqual(['merch-1', 'show-1']);
  });

  it('renders alerts above content cards in the home rail DOM order (JOV-11084)', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease({ title: 'Never Say A Word' })}
        profileSettings={{ showOldReleases: true }}
        featuredPlaylistFallback={null}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    const alertsCard = screen.getByTestId('profile-home-alerts-fallback-card');
    const carousel = screen.getByTestId('profile-home-carousel');

    expect(alertsCard.compareDocumentPosition(carousel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      screen.getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
  });

  it('renders a prominent gradient alerts bento when the home rail is empty', () => {
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

    const alertsCard = screen.getByTestId('profile-home-alerts-fallback-card');
    expect(alertsCard.style.background).toContain('var(--color-accent-purple)');
    expect(alertsCard.className).toContain('min-h-44');
  });

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

    const alertsCard = screen.getByTestId('profile-home-alerts-fallback-card');
    const carousel = screen.getByTestId('profile-home-carousel');

    expect(alertsCard).toBeInTheDocument();
    expect(carousel).toBeInTheDocument();
    expect(alertsCard.compareDocumentPosition(carousel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
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
