import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationContentType } from '@/types/notifications';
import { ProfilePrimaryTabPanel } from './ProfilePrimaryTabPanel';
import {
  PROFILE_STORY_ARTIST,
  PROFILE_STORY_CONTENT_PREFS,
} from './profile-story-fixture';

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => <div data-testid='mock-tour-drawer-content' />,
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
  it('labels the tour panel Events per the shared nav contract', () => {
    renderPanel({ mode: 'tour' });

    expect(screen.getByTestId('profile-primary-tab-tour')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Events' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Shows' })).toBeNull();
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
    renderPanel({ mode: 'subscribe' });

    expect(
      screen.getByTestId('profile-primary-tab-subscribe')
    ).toBeInTheDocument();
  });
});
