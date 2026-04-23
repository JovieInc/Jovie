import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TourModePanel } from '@/features/profile/TourModePanel';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist } from '@/types/db';

const { replaceMock, ticketClickMock } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  ticketClickMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

// Default: no location
const locationMock = vi.hoisted(() => ({
  location: null as { latitude: number; longitude: number } | null,
  isLoading: false,
  error: null as string | null,
}));

vi.mock('@/hooks/useUserLocation', () => ({
  useUserLocation: () => locationMock,
}));

vi.mock('@/hooks/useTourDateTicketClick', () => ({
  useTourDateTicketClick: () => ticketClickMock,
}));

// Mock ArtistNotificationsCTA to avoid deep dependency tree
vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: ({
      source,
    }: {
      source?: string;
      forceExpanded?: boolean;
      hideListenFallback?: boolean;
      artist: Artist;
    }) => (
      <div data-testid='mock-notifications-cta' data-source={source}>
        Subscribe CTA
      </div>
    ),
  })
);

const artist: Artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  handle: 'timwhite',
  spotify_id: '4u',
  name: 'Tim White',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Artist',
  theme: {},
  settings: { hide_branding: false },
  spotify_url: null,
  apple_music_url: null,
  youtube_url: null,
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00Z',
};

const londonDate: TourDateViewModel = {
  id: 'tour-london',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  title: null,
  startDate: '2026-04-25T00:00:00.000Z',
  startTime: null,
  timezone: null,
  venueName: 'The O2',
  city: 'London',
  region: null,
  country: 'UK',
  latitude: 51.503,
  longitude: 0.003,
  ticketUrl: 'https://tickets.example.com/london',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

const nycDate: TourDateViewModel = {
  id: 'tour-nyc',
  profileId: 'profile-1',
  externalId: null,
  provider: 'manual',
  title: null,
  startDate: '2026-05-01T00:00:00.000Z',
  startTime: null,
  timezone: null,
  venueName: 'Madison Square Garden',
  city: 'New York',
  region: 'NY',
  country: 'US',
  latitude: 40.7505,
  longitude: -73.9934,
  ticketUrl: 'https://tickets.example.com/nyc',
  ticketStatus: 'available',
  lastSyncedAt: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
};

describe('TourModePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationMock.location = null;
    locationMock.isLoading = false;
    locationMock.error = null;
  });

  it('renders a clickable ticket link for available dates', () => {
    render(<TourModePanel artist={artist} tourDates={[londonDate]} />);

    const ticketLink = screen.getByRole('link', { name: 'Tickets' });
    expect(ticketLink).toHaveAttribute('href', londonDate.ticketUrl);

    ticketLink.addEventListener('click', event => event.preventDefault());
    fireEvent.click(ticketLink);
    expect(ticketClickMock).toHaveBeenCalledTimes(1);
  });

  // State 3: No dates at all
  it('renders empty state when no tour dates', () => {
    render(<TourModePanel artist={artist} tourDates={[]} />);
    expect(screen.getByTestId('tour-drawer-content')).toBeInTheDocument();
    expect(screen.getByText('No upcoming events.')).toBeInTheDocument();
  });

  // State 4: No geolocation — shows all dates without Near You
  it('shows all dates under "All Dates" when no geolocation', () => {
    locationMock.error = 'Location denied';
    render(<TourModePanel artist={artist} tourDates={[londonDate, nycDate]} />);
    expect(screen.getByText('All Dates')).toBeInTheDocument();
    expect(screen.getByText('The O2')).toBeInTheDocument();
    expect(screen.getByText('Madison Square Garden')).toBeInTheDocument();
    // No "Events near you" section
    expect(screen.queryByText('Events near you')).not.toBeInTheDocument();
  });

  // State 1: Has nearby dates
  it('shows "Events near you" and "All Dates" when user has nearby dates', () => {
    locationMock.location = { latitude: 51.507, longitude: -0.128 }; // London
    render(<TourModePanel artist={artist} tourDates={[londonDate, nycDate]} />);
    expect(screen.getByText('Events near you')).toBeInTheDocument();
    expect(screen.getByText('All Dates')).toBeInTheDocument();
    // London appears in both sections (nearby + all dates)
    const o2Elements = screen.getAllByText('The O2');
    expect(o2Elements.length).toBeGreaterThanOrEqual(2);
  });

  // State 2: No nearby dates, conversion CTA
  it('shows conversion CTA when user has location but no nearby dates', () => {
    // User in middle of Pacific — nothing is nearby
    locationMock.location = { latitude: 0, longitude: -160 };
    render(<TourModePanel artist={artist} tourDates={[londonDate, nycDate]} />);
    expect(screen.getByText('No events near you.')).toBeInTheDocument();
    expect(screen.getByTestId('mock-notifications-cta')).toBeInTheDocument();
    expect(screen.getByTestId('mock-notifications-cta')).toHaveAttribute(
      'data-source',
      'tour_drawer'
    );
  });

  // Collapsible disclosure
  it('shows collapsed disclosure that expands on click', () => {
    locationMock.location = { latitude: 0, longitude: -160 };
    render(<TourModePanel artist={artist} tourDates={[londonDate, nycDate]} />);
    const disclosure = screen.getByRole('button', {
      name: /events in other cities/,
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    // Dates not visible when collapsed
    expect(screen.queryByText('The O2')).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    // Dates now visible
    expect(screen.getByText('The O2')).toBeInTheDocument();
  });

  // State 5: Geo loading — shows all dates
  it('shows all dates while geolocation is loading', () => {
    locationMock.isLoading = true;
    render(<TourModePanel artist={artist} tourDates={[londonDate, nycDate]} />);
    // No "Events near you" while loading
    expect(screen.queryByText('Events near you')).not.toBeInTheDocument();
    expect(screen.getByText('All Dates')).toBeInTheDocument();
    expect(screen.getByText('The O2')).toBeInTheDocument();
  });

  // Date box renders month and day
  it('renders date box with month and day', () => {
    render(<TourModePanel artist={artist} tourDates={[londonDate]} />);
    // Month is rendered in date box
    expect(screen.getByText('Apr')).toBeInTheDocument();
    // Day is rendered (may vary by timezone, just check it's a number)
    const dayElement = screen
      .getAllByText(/^\d{1,2}$/)
      .find(el => el.className.includes('font-bold'));
    expect(dayElement).toBeTruthy();
  });
});
