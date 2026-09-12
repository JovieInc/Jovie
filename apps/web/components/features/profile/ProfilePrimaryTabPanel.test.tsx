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
  AboutSection: () => <div data-testid='mock-about-section' />,
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
  it('labels the tour panel Shows per the shared nav contract', () => {
    renderPanel({ mode: 'tour' });

    expect(screen.getByTestId('profile-primary-tab-tour')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Shows' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull();
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

    expect(
      screen.getByTestId('profile-primary-tab-releases')
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Music' })).toBeInTheDocument();
  });

  it('keeps the subscribe panel mounted as the subscribe destination', () => {
    renderPanel({ mode: 'subscribe' });

    expect(
      screen.getByTestId('profile-primary-tab-subscribe')
    ).toBeInTheDocument();
  });
});
