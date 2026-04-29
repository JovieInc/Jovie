import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import { ProfileDesktopSurface } from './ProfileDesktopSurface';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly [key: string]: unknown;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/components/atoms/ImageWithFallback', () => ({
  ImageWithFallback: ({
    alt,
    src,
    fill: _fill,
    priority: _priority,
    fallbackVariant: _fallbackVariant,
    fallbackClassName: _fallbackClassName,
    ...props
  }: {
    readonly alt: string;
    readonly src?: string | null;
    readonly fill?: boolean;
    readonly priority?: boolean;
    readonly fallbackVariant?: string;
    readonly fallbackClassName?: string;
    readonly [key: string]: unknown;
  }) => React.createElement('img', { alt, src: src ?? undefined, ...props }),
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: (props: Record<string, unknown>) =>
    React.createElement('svg', props),
}));

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: () => <div data-testid='mock-brand-logo'>Jovie</div>,
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: () => null,
    isEnabled: false,
  }),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA',
  () => ({
    ProfileInlineNotificationsCTA: () => (
      <button type='button' data-testid='mock-desktop-alerts-cta'>
        Alerts CTA
      </button>
    ),
  })
);

vi.mock('@/features/profile/ProfileUnifiedDrawer', () => ({
  ProfileUnifiedDrawer: ({
    open,
    presentation,
  }: {
    readonly open: boolean;
    readonly presentation?: string;
  }) => (
    <div
      data-testid='mock-desktop-drawer'
      data-open={String(open)}
      data-presentation={presentation ?? 'standalone'}
    />
  ),
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [],
}));

vi.mock('@/lib/dsp', () => ({
  sortDSPsByGeoPopularity: (value: unknown) => value,
}));

const artist = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Tim White',
  handle: 'timwhite',
  spotify_id: '4u',
  image_url: 'https://example.com/tim.jpg',
  tagline: 'Producer, songwriter, and after-hours romantic.',
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
  settings: {
    heroRoleLabel: 'DJ / PRODUCER',
  },
} satisfies Artist;

const contacts = [] satisfies PublicContact[];

const contentPrefs: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: false,
  merch: false,
  general: false,
};

const upcomingShow = {
  id: 'show-1',
  profileId: artist.id,
  externalId: null,
  provider: 'manual' as const,
  title: null,
  venueName: 'The Echo',
  city: 'Los Angeles',
  region: 'CA',
  country: 'US',
  startDate: '2099-05-20T00:00:00.000Z',
  startTime: null,
  endDate: null,
  ticketUrl: 'https://tickets.example.com/show',
  ticketStatus: 'available' as const,
  timezone: 'America/Los_Angeles',
  latitude: null,
  longitude: null,
  lastSyncedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProfileDesktopSurface', () => {
  it('renders the desktop shell and hides events when no events are upcoming', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onModeSelect={vi.fn()}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
        isSubscribed={false}
        contentPrefs={contentPrefs}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
      />
    );

    expect(screen.getByTestId('profile-desktop-surface')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Events' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByTestId('mock-desktop-drawer')).toHaveAttribute(
      'data-presentation',
      'modal'
    );
  });

  it('shows events in primary navigation when an upcoming event exists', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        tourDates={[upcomingShow]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onModeSelect={vi.fn()}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
        isSubscribed={false}
        contentPrefs={contentPrefs}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
  });
});
