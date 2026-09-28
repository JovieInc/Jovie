import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { TourEventAlertsAction, TourModePanel } from './TourModePanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => ({
    location: null,
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/useTourDateTicketClick', () => ({
  useTourDateTicketClick: () => () => undefined,
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: ({
      triggerLabel,
      source,
    }: {
      readonly triggerLabel?: string;
      readonly source?: string;
    }) =>
      triggerLabel === 'Turn On Event Alerts' ? (
        <span data-testid='mock-event-alerts-cta' data-source={source}>
          {triggerLabel}
        </span>
      ) : null,
  })
);

function makeTourDate(
  overrides: Partial<TourDateViewModel> = {}
): TourDateViewModel {
  return {
    id: 'tour-1',
    profileId: 'artist-1',
    externalId: null,
    provider: 'manual',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: '2030-08-20T20:00:00.000Z',
    startTime: null,
    timezone: 'America/Los_Angeles',
    venueName: 'The Novo',
    city: 'Los Angeles',
    region: 'CA',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example.com/the-novo',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('TourModePanel', () => {
  it('renders the upcoming show list with ticket links when dates exist', () => {
    render(
      <TourModePanel
        artist={PROFILE_STORY_ARTIST}
        tourDates={[makeTourDate()]}
      />
    );

    expect(screen.getByTestId('tour-drawer-list')).toBeInTheDocument();
    expect(screen.getByText('The Novo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tickets' })).toHaveAttribute(
      'href',
      'https://tickets.example.com/the-novo'
    );
  });

  it('keeps the empty state quiet and cardless with the alerts CTA as the single action', () => {
    render(<TourModePanel artist={PROFILE_STORY_ARTIST} tourDates={[]} />);

    expect(screen.getByTestId('tour-drawer-content')).toBeInTheDocument();
    expect(screen.getByText('No upcoming shows')).toBeInTheDocument();
    expect(screen.queryByTestId('tour-drawer-list')).not.toBeInTheDocument();
    expect(screen.queryByText('Latest release')).not.toBeInTheDocument();
    expect(screen.queryByText('Releases')).not.toBeInTheDocument();
  });
});

describe('TourEventAlertsAction', () => {
  const sourceContext = {
    artistId: 'artist-1',
    profileId: 'artist-1',
    profileSlug: 'tim',
    currentTab: 'events',
    ctaLocation: 'events_empty_state',
    intent: 'event_alerts',
  } as const;

  it('renders the live event alerts opt-in with the empty-state source', () => {
    render(
      <TourEventAlertsAction
        artist={PROFILE_STORY_ARTIST}
        sourceContext={sourceContext}
        renderMode='interactive'
      />
    );

    expect(screen.getByTestId('mock-event-alerts-cta')).toHaveAttribute(
      'data-source',
      'events_empty_state'
    );
  });

  it('renders a disabled placeholder in previews', () => {
    render(
      <TourEventAlertsAction
        artist={PROFILE_STORY_ARTIST}
        sourceContext={sourceContext}
        renderMode='preview'
      />
    );

    expect(
      screen.getByRole('button', { name: 'Turn On Event Alerts' })
    ).toBeDisabled();
    expect(screen.queryByTestId('mock-event-alerts-cta')).toBeNull();
  });
});
