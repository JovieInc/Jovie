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

  it('renders the PAC card first and the alerts card last inside the carousel', () => {
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

    const carousel = screen.getByTestId('profile-home-carousel');
    const pacCard = screen.getByTestId('profile-pac');
    const alertsCard = screen.getByTestId('profile-home-alerts-fallback-card');

    // Both live inside the single carousel — no stacked sections.
    expect(carousel.contains(pacCard)).toBe(true);
    expect(carousel.contains(alertsCard)).toBe(true);

    const footprints = [...carousel.querySelectorAll(':scope > li')];
    expect(footprints[0]?.contains(pacCard)).toBe(true);
    expect(footprints[footprints.length - 1]?.contains(alertsCard)).toBe(true);
    // The featured release renders once, inside the PAC card (not as a
    // duplicate plain catalog card).
    expect(screen.getAllByText('Never Say A Word')).toHaveLength(1);
  });

  it('renders a prominent gradient alerts card when the home rail is empty', () => {
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

  it('keeps the carousel shell with PAC and alerts cards even when the catalog is empty', () => {
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

    const carousel = screen.getByTestId('profile-home-carousel');
    expect(
      screen.getByTestId('profile-home-alerts-fallback-card')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-home-alerts-switch')
    ).toBeInTheDocument();
    // No entity items → the carousel still hosts the slot cards.
    expect(carousel.querySelectorAll(':scope > li').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('entity-card-music')).not.toBeInTheDocument();
  });

  it('renders the latest release as the featured PAC card, not a catalog card', () => {
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

    const pacCard = screen.getByTestId('profile-pac');
    const carousel = screen.getByTestId('profile-home-carousel');
    const alertsCard = screen.getByTestId('profile-home-alerts-fallback-card');

    expect(pacCard).toBeInTheDocument();
    expect(pacCard.dataset.state).toBe('idle');
    expect(carousel).toBeInTheDocument();
    expect(alertsCard).toBeInTheDocument();
    // Featured release title lives in the PAC card only.
    expect(screen.getAllByText('The Deep End')).toHaveLength(1);
    expect(
      screen.queryByRole('heading', { name: 'The Deep End' })
    ).not.toBeInTheDocument();
    expect(pacCard.compareDocumentPosition(alertsCard)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
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
    // The featured release appears exactly once (inside the PAC card).
    expect(screen.getAllByText('The Deep End')).toHaveLength(1);
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
    // Subscribed visitor: the PAC card resolves to the S2 'following' state.
    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard.dataset.state).toBe('following');
    expect(screen.getByText('You follow Tim White')).toBeInTheDocument();
  });
});
