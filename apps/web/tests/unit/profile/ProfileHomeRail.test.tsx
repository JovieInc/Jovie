import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileHomeRail } from '@/features/profile/ProfileHomeRail';
import type { ProfilePrimaryActionCardRelease } from '@/features/profile/ProfilePrimaryActionCard';
import type { PublicRelease } from '@/features/profile/releases/types';
import type { PublicMerchCard } from '@/lib/merch/types';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'tim',
    spotify_id: '4u',
    name: 'Tim White',
    image_url: '/images/avatars/tim-white.jpg',
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

function makeMerchCard(): PublicMerchCard {
  return {
    id: 'merch-1',
    artistId: 'artist-1',
    status: 'live',
    title: 'Tour Tee',
    description: 'Tour tee',
    productType: 'shirt',
    primaryImageUrl: '/img/merch/tour-tee.jpg',
    mockupUrls: [],
    printful: {},
    pricing: {},
    retailPriceCents: 4500,
    rankScore: 1,
    position: 0,
    pinned: false,
  } as unknown as PublicMerchCard;
}

function makeTourDate(ticketUrl: string | null): TourDateViewModel {
  return {
    id: 'show-1',
    profileId: 'artist-1',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: 'The Novo',
    startDate: '2030-08-20T20:00:00.000Z',
    startTime: null,
    timezone: 'America/Los_Angeles',
    venueName: 'The Novo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl,
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  };
}

describe('ProfileHomeRail', () => {
  it('renders the PAC as the single featured card surface — no carousel stack', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease({ title: 'Never Say A Word' })}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed={false}
      />
    );

    const pacCard = screen.getByTestId('profile-pac');

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Profile Highlights From Tim White',
      })
    ).toBeInTheDocument();

    // JOV-7123: the featured editorial card is the only card surface on the
    // home rail. The highlights carousel and trailing alerts card are gone —
    // fan capture lives inside the PAC prompt state.
    expect(pacCard).toHaveAttribute('data-presentation', 'featured');
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByTestId('profile-home-alerts-fallback-card')
    ).toBeNull();
    expect(screen.queryByTestId('entity-card-music')).toBeNull();
    expect(within(pacCard).getByText('Featured')).toBeInTheDocument();
    // Featured anatomy: centered art that is never cropped, title, artist,
    // and one full-width neutral CTA (28px face inside a 44px hit area).
    const pacMedia = within(pacCard).getByTestId('profile-pac-featured-art');
    expect(pacMedia.className).toContain('h-26 w-26');
    expect(pacMedia.className).toContain('rounded-lg');
    const pacArtwork = screen.getByRole('img', {
      name: 'Never Say A Word artwork',
    });
    expect(pacArtwork).toHaveClass('object-contain');
    expect(pacArtwork).not.toHaveClass('object-cover');
    expect(
      within(pacCard).getByRole('heading', { name: 'Never Say A Word' })
    ).toBeInTheDocument();
    expect(within(pacCard).getByText('Tim White')).toBeInTheDocument();
    const listen = within(pacCard).getByRole('link', { name: 'Listen now' });
    expect(listen).toHaveClass('h-11', 'w-full');
    expect(listen.firstElementChild).toHaveClass('h-7', 'rounded-full');
    // The featured release renders once, inside the PAC card.
    expect(screen.getAllByText('Never Say A Word')).toHaveLength(1);
  });

  it('renders no false Latest or Listen card when the profile has no inventory', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        isSubscribed={false}
      />
    );

    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(screen.queryByTestId('profile-pac')).toBeNull();
    expect(screen.queryByText('Latest')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Listen' })).toBeNull();
  });

  it('renders merch-only inventory as a merch PAC instead of a blank Listen card', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        merchCards={[makeMerchCard()]}
      />
    );

    expect(screen.getByTestId('profile-pac')).toHaveAttribute(
      'data-state',
      'merch'
    );
    expect(screen.getByRole('link', { name: 'Shop' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Listen' })).toBeNull();
  });

  it('renders show-only inventory as a ticket PAC instead of a blank Listen card', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        tourDates={[makeTourDate('https://tickets.example.com/the-novo')]}
        hasPlayableDestinations={false}
        renderMode='preview'
        resolveNearbyTour={false}
      />
    );

    expect(screen.getByTestId('profile-pac')).toHaveAttribute(
      'data-state',
      'tickets'
    );
    expect(screen.getByRole('link', { name: 'Tickets' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Listen' })).toBeNull();
  });

  it('names the heart/pay control Support when the PAC lands on tip', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        hasTip
      />
    );

    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard).toHaveAttribute('data-state', 'tip');
    expect(
      within(pacCard).getByRole('region', { name: 'Support Tim White' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Tip.*Support Tim White/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Listen' })).toBeNull();
  });

  it('eager-loads latest-release artwork even when it is not the hero LCP', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        pacArtPriority={false}
      />
    );

    const artwork = screen.getByRole('img', {
      name: 'The Deep End artwork',
    });
    expect(artwork).toHaveAttribute('loading', 'eager');
  });

  it('renders tip-only inventory as a support PAC instead of a blank Listen card', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={null}
        tourDates={[]}
        hasPlayableDestinations={false}
        renderMode='preview'
        hasTip
      />
    );

    expect(screen.getByTestId('profile-pac')).toHaveAttribute(
      'data-state',
      'tip'
    );
    expect(
      screen.getByRole('link', { name: /Tip.*Support Tim White/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Listen' })).toBeNull();
  });

  it('leads with the visible latest release even when the catalog has newer entries', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
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

    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard.dataset.state).toBe('idle');
    // The featured release appears exactly once (inside the PAC card); the
    // back catalog stays off the home surface — it lives on Music.
    expect(screen.getAllByText('The Deep End')).toHaveLength(1);
    expect(
      within(pacCard).getByRole('heading', { name: 'The Deep End' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Under Lights')).not.toBeInTheDocument();
  });

  it('resolves the PAC to the following state for a subscribed visitor', () => {
    render(
      <ProfileHomeRail
        artist={makeArtist()}
        latestRelease={makeRelease()}
        profileSettings={{ showOldReleases: true }}
        tourDates={[]}
        hasPlayableDestinations
        renderMode='preview'
        isSubscribed
      />
    );

    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard.dataset.state).toBe('following');
    expect(screen.getByText('You follow Tim White')).toBeInTheDocument();
  });
});
