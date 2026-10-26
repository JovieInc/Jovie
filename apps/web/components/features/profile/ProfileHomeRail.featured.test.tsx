import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FEATURED_REASON_CODES } from '@/lib/profile/one-right-thing/engine';
import { ProfileHomeRail } from './ProfileHomeRail';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({ location: null, isLoading: false, error: null }),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; src?: string | null }) => (
    <img alt='' src={props.src ?? undefined} />
  ),
}));

const daysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const release = (id: string, ageDays: number) => ({
  id,
  title: `Song ${id}`,
  slug: `song-${id}`,
  releaseType: 'single',
  artworkUrl: null,
  artistNames: ['Tim White'],
  previewUrl: null,
  releaseDate: daysFromNow(-ageDays),
});

const tourDate = (id: string, inDays: number, country = 'US') =>
  ({
    id,
    profileId: 'p',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: daysFromNow(inDays),
    startTime: null,
    timezone: null,
    venueName: 'The Venue',
    city: 'Austin',
    region: 'TX',
    country,
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example/x',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: daysFromNow(-30),
    updatedAt: daysFromNow(-30),
  }) as const;

function renderRail(props: {
  releases?: ReturnType<typeof release>[];
  tourDates?: ReturnType<typeof tourDate>[];
  hasPlayableDestinations?: boolean;
  renderMode?: 'interactive' | 'preview';
}) {
  return render(
    <ProfileHomeRail
      artist={PROFILE_STORY_ARTIST}
      releases={props.releases ?? []}
      tourDates={props.tourDates ?? []}
      hasPlayableDestinations={props.hasPlayableDestinations ?? true}
      renderMode={props.renderMode ?? 'interactive'}
      isSubscribed={false}
    />
  );
}

describe('ProfileHomeRail featured decision', () => {
  it('a fresh release leads and the card carries its reason code', () => {
    renderRail({
      releases: [release('new', 5)],
      tourDates: [tourDate('a', 40)],
    });
    const card = screen.getByTestId('profile-pac');
    expect(card).toHaveAttribute('data-featured-kind', 'release');
    expect(card).toHaveAttribute('data-featured-reason', 'fresh_release');
  });

  it('a stale release yields to a show that is coming up', () => {
    renderRail({
      releases: [release('old', 400)],
      tourDates: [tourDate('a', 30)],
    });
    const card = screen.getByTestId('profile-pac');
    expect(card).toHaveAttribute('data-featured-kind', 'show');
    expect(card).toHaveAttribute(
      'data-featured-reason',
      'stale_release_show_soon'
    );
    expect(card).toHaveAttribute('data-state', 'tickets');
  });

  it('previews never personalize and carry no reason', () => {
    renderRail({
      releases: [release('old', 400)],
      tourDates: [tourDate('a', 30)],
      renderMode: 'preview',
    });
    const card = screen.getByTestId('profile-pac');
    expect(card).not.toHaveAttribute('data-featured-reason');
    expect(card).toHaveAttribute('data-state', 'idle');
  });

  it('guard: every interactive featured card carries a registered reason code', () => {
    const fixtures = [
      { releases: [release('a', 3)] },
      { releases: [release('b', 200)] },
      { releases: [release('c', 200)], tourDates: [tourDate('t', 20)] },
      { releases: [], tourDates: [tourDate('t', 20)] },
      { releases: [], hasPlayableDestinations: true },
    ];
    for (const fixture of fixtures) {
      const { unmount } = renderRail(fixture);
      const card = screen.getByTestId('profile-pac');
      const reason = card.getAttribute('data-featured-reason');
      expect(FEATURED_REASON_CODES).toContain(reason);
      unmount();
    }
  });
});
