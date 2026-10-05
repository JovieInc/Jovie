import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { resolveProfileModeCardAccents } from '@/lib/profile/mode-card-accent';
import type { NotificationContentType } from '@/types/notifications';
import { ProfilePrimaryTabPanel } from './ProfilePrimaryTabPanel';

// What the compact surface passes when the featured card shows artwork.
const PEN_ACCENTS = resolveProfileModeCardAccents({
  listenArtworkAccent: 'ultra',
});

import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
} from './profile-story-fixture';

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => <div data-testid='mock-tour-drawer-content' />,
  TourEventAlertsAction: () => (
    <div data-testid='mock-tour-event-alerts-action' />
  ),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => (
      <div data-testid='mock-artist-notifications-cta' />
    ),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: () => (
      <div data-testid='mock-two-step-notifications-cta' />
    ),
  })
);

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: (props: {
    readonly creditSegments?: readonly { readonly type: string }[];
    readonly contacts?: readonly { readonly id: string }[];
  }) => (
    <div
      data-testid='mock-about-section'
      data-credit-segments={(props.creditSegments ?? [])
        .map(segment => segment.type)
        .join('|')}
      data-contacts={(props.contacts ?? [])
        .map(contact => contact.id)
        .join('|')}
    />
  ),
}));

vi.mock('@/features/profile/views/ReleasesView', () => ({
  ReleasesView: () => <div data-testid='mock-releases-view' />,
}));

const artist = PROFILE_STORY_ARTIST;

const contentPrefs: Record<NotificationContentType, boolean> =
  PROFILE_STORY_CONTENT_PREFS;

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof ProfilePrimaryTabPanel>> = {}
) {
  return render(
    <ProfilePrimaryTabPanel
      mode='listen'
      artist={artist}
      dsps={[]}
      isSubscribed={false}
      contentPrefs={contentPrefs}
      onTogglePref={vi.fn()}
      onUnsubscribe={vi.fn()}
      isUnsubscribing={false}
      {...overrides}
    />
  );
}

describe('ProfilePrimaryTabPanel', () => {
  it('renders the Events mode card with a truthful empty state and the alerts opt-in', () => {
    renderPanel({ mode: 'tour', modeCardAccents: PEN_ACCENTS });

    expect(screen.getByTestId('profile-primary-tab-tour')).toBeInTheDocument();
    const card = screen.getByTestId('profile-primary-tab-events-empty');
    // Shared nav contract (#18803): Events, never Shows.
    expect(card).toHaveAccessibleName('Events');
    expect(screen.queryByText('Shows')).toBeNull();
    expect(card).toHaveAttribute('data-accent', 'pulse');
    expect(
      within(card).getByRole('heading', { name: 'No upcoming events' })
    ).toBeInTheDocument();
    expect(within(card).getByText('New dates will appear here.')).toBeVisible();
    // Only the event-alerts opt-in; no event list, no invented CTA.
    expect(
      within(card).getByTestId('mock-tour-event-alerts-action')
    ).toBeInTheDocument();
    expect(within(card).queryByTestId('mock-tour-drawer-content')).toBeNull();
  });

  it('lists upcoming events inside the Events mode card', () => {
    renderPanel({
      mode: 'tour',
      modeCardAccents: PEN_ACCENTS,
      tourDates: [
        {
          id: 'show-1',
          title: 'Live',
          venueName: 'The Echo',
          city: 'Los Angeles',
          region: 'CA',
          country: 'US',
          startDate: '2099-05-01T20:00:00.000Z',
          timezone: 'America/Los_Angeles',
          ticketUrl: null,
          ticketStatus: 'available',
        } as never,
      ],
    });

    const card = screen.getByTestId('profile-events-card');
    expect(card).toHaveAttribute('data-accent', 'pulse');
    expect(
      within(card).getByTestId('mock-tour-drawer-content')
    ).toBeInTheDocument();
  });

  it('wraps the alerts flow in the Stay close mode card', () => {
    renderPanel({ mode: 'subscribe', modeCardAccents: PEN_ACCENTS });

    const card = screen.getByTestId('profile-primary-tab-subscribe');
    expect(card).toHaveAccessibleName('Stay close');
    expect(card).toHaveAttribute('data-accent', 'orange');
    expect(
      within(card).getByTestId('mock-artist-notifications-cta')
    ).toBeInTheDocument();
  });

  it('keeps the Payments surface off the About tab even when the profile can take payments', () => {
    // JOV-7810: pay content only renders on the pay intent surface.
    renderPanel({ mode: 'about', modeCardAccents: PEN_ACCENTS });

    expect(screen.getByTestId('profile-primary-tab-about')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-payments-card')).toBeNull();
  });

  it('labels the About panel About per the shared nav contract', () => {
    renderPanel({ mode: 'about' });

    expect(screen.getByTestId('profile-primary-tab-about')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.queryByText('Profile')).toBeNull();
  });

  it('labels the Music panel Music and mounts the releases view when releases have slugs', () => {
    renderPanel({
      mode: 'listen',
      releases: [
        {
          id: 'release-1',
          title: 'Never Say A Word',
          slug: 'never-say-a-word',
          releaseType: 'single',
          releaseDate: '2026-08-01',
          artworkUrl: null,
          artistNames: ['Tim White'],
        },
      ],
    });

    const releases = screen.getByTestId('profile-primary-tab-releases');
    expect(releases).toBeInTheDocument();
    expect(releases.className).toContain('-mx-(--page-pad)');
    expect(releases.className).not.toContain('-mx-4');
    expect(screen.getByRole('heading', { name: 'Music' })).toBeInTheDocument();
  });

  it('routes selected credits and contacts into the About destination (JOV-6199)', () => {
    renderPanel({
      mode: 'about',
      creditSegments: [
        { type: 'text', text: 'Credited on "' },
        {
          type: 'release',
          text: 'Neon Circuit',
          href: '/timwhite/neon-circuit',
        },
        { type: 'text', text: '".' },
      ],
      contacts: [
        {
          id: 'contact-1',
          role: 'bookings',
          roleLabel: 'Booking',
          territorySummary: 'Worldwide',
          territoryCount: 1,
          channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
        },
      ],
    });

    const about = screen.getByTestId('mock-about-section');
    expect(about).toHaveAttribute('data-credit-segments', 'text|release|text');
    expect(about).toHaveAttribute('data-contacts', 'contact-1');
  });

  it('keeps the subscribe panel mounted as the subscribe destination', () => {
    renderPanel({ mode: 'subscribe', modeCardAccents: PEN_ACCENTS });

    expect(
      screen.getByTestId('profile-primary-tab-subscribe')
    ).toBeInTheDocument();
  });

  it('renders the capture control once the visitor assignment has resolved', () => {
    renderPanel({ mode: 'subscribe', visitorAssignmentResolved: true });

    expect(
      screen.getByTestId('mock-artist-notifications-cta')
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading subscription form')).toBeNull();
  });

  it('holds the subscribe CTA as a skeleton while the visitor assignment resolves', () => {
    renderPanel({ mode: 'subscribe', visitorAssignmentResolved: false });

    expect(screen.getByText('Loading subscription form')).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-artist-notifications-cta')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-two-step-notifications-cta')
    ).not.toBeInTheDocument();
  });

  it('holds the two-step subscribe CTA too while the visitor assignment resolves', () => {
    renderPanel({
      mode: 'subscribe',
      subscribeTwoStep: true,
      visitorAssignmentResolved: false,
    });

    expect(screen.getByText('Loading subscription form')).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-two-step-notifications-cta')
    ).not.toBeInTheDocument();
  });
});
