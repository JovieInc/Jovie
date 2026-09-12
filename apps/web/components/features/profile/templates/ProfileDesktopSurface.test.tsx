import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import {
  PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME,
  PROFILE_LISTEN_DSP_COLUMN_CLASSNAME,
  PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME,
  ProfileDesktopSurface,
} from './ProfileDesktopSurface';

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
    priority,
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
  }) =>
    React.createElement('img', {
      alt,
      src: src ?? undefined,
      ...props,
      'data-priority': priority ? 'true' : 'false',
    }),
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

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: ({
    dspsOverride = [],
  }: {
    readonly dspsOverride?: ReadonlyArray<{ readonly name: string }>;
  }) => (
    <div data-testid='mock-static-listen-interface'>
      {dspsOverride.map(dsp => (
        <button key={dsp.name} type='button'>
          {dsp.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [
    {
      key: 'spotify',
      name: 'Spotify',
      url: 'https://open.spotify.com/artist/4u',
      config: {},
    },
  ],
}));

vi.mock('@/lib/dsp', () => ({
  sortDSPsByGeoPopularity: (value: unknown) => value,
}));

const mockUseIsAuthenticated = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => mockUseIsAuthenticated(),
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

describe('ProfileDesktopSurface', () => {
  beforeEach(() => {
    mockUseIsAuthenticated.mockReturnValue(false);
  });

  it('hides the desktop back control on the public profile root for logged-out visitors', () => {
    mockUseIsAuthenticated.mockReturnValue(false);

    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onBack={vi.fn()}
        profileHref='/timwhite'
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('shows the desktop back control for a signed-in session', () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    const onBack = vi.fn();

    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onBack={onBack}
        profileHref='/timwhite'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('publishes readiness only after the desktop surface hydrates', () => {
    const surface = (
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        drawerOpen={false}
        drawerView='menu'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
      />
    );
    expect(renderToString(surface)).not.toContain(
      'data-interactive-ready="true"'
    );
    const view = render(surface);
    expect(screen.getByTestId('profile-desktop-surface')).toHaveAttribute(
      'data-interactive-ready',
      'true'
    );
    view.unmount();
    expect(screen.queryByTestId('profile-desktop-surface')).toBeNull();
  });
  it('renders the desktop shell and primary navigation', () => {
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
    const navigation = screen.getByRole('navigation', {
      name: 'Profile Navigation',
    });
    expect(navigation).toHaveAttribute(
      'data-public-profile-nav',
      'profile,listen,tour,about'
    );
    expect(
      within(navigation).getByRole('button', { name: 'Home' })
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'Music' })
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'Shows' })
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole('button', { name: 'About' })
    ).toBeInTheDocument();
    expect(
      within(navigation).queryByRole('button', { name: 'Events' })
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('button', { name: 'Alerts' })
    ).not.toBeInTheDocument();
    expect(
      within(navigation).queryByRole('button', { name: 'Get updates' })
    ).not.toBeInTheDocument();
    const listenCta = screen.getByRole('button', { name: 'Listen' });
    expect(listenCta).toHaveClass('h-7');
    expect(listenCta.className).toContain('before:h-11');
    expect(listenCta.className).toContain('before:min-w-11');
    const profileHeader = screen.getByTestId('profile-header');
    expect(profileHeader).toHaveClass('min-w-0', 'max-w-full');
    expect(within(profileHeader).getByText('Tim White')).toHaveClass(
      'min-w-0',
      'line-clamp-2'
    );
    expect(
      screen.getByText('Producer, songwriter, and after-hours romantic.')
    ).toHaveClass('line-clamp-2');
    expect(screen.getByTestId('mock-desktop-drawer')).toHaveAttribute(
      'data-presentation',
      'modal'
    );
  });

  it('renders DSP actions in desktop listen mode', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        latestRelease={{
          title: 'Never Say A Word',
          slug: 'never-say-a-word',
          artworkUrl: 'https://example.com/never-say-a-word.jpg',
          releaseDate: '2026-08-01T00:00:00.000Z',
          releaseType: 'single',
        }}
        profileSettings={{ showOldReleases: true }}
        drawerOpen={false}
        drawerView='menu'
        activeMode='listen'
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

    expect(screen.getByTestId('mock-static-listen-interface')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Spotify' })).toBeVisible();
    expect(screen.getByAltText('Never Say A Word')).toHaveAttribute(
      'data-priority',
      'true'
    );

    const listenGrid = screen.getByTestId('profile-listen-desktop-grid');
    expect(listenGrid).toHaveClass(PROFILE_LISTEN_DESKTOP_GRID_CLASSNAME);
    expect(
      screen.getByTestId('profile-primary-tab-artist-streaming')
    ).toHaveClass(PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME);
    expect(screen.getByTestId('profile-listen-dsp-column')).toHaveClass(
      PROFILE_LISTEN_DSP_COLUMN_CLASSNAME
    );
  });

  it('omits fan-capture actions when fan capture is disabled', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='subscribe'
        onModeSelect={vi.fn()}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
        allowFanCapture={false}
        isSubscribed={false}
        contentPrefs={contentPrefs}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Alerts' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-desktop-alerts-cta')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-desktop-home-overview')).toHaveAttribute(
      'data-side-rail-enabled',
      'false'
    );
    expect(screen.getByTestId('profile-desktop-side-rail')).toHaveClass(
      'hidden'
    );
    expect(screen.getByTestId('profile-desktop-main-content')).toHaveClass(
      '[@media(min-width:1180px)]:contents'
    );
    expect(screen.getByTestId('profile-desktop-surface')).toBeInTheDocument();
  });

  // Regression: JOV-4103 — desktop hero must render social media icons.
  it('renders hero social icons when Instagram and Twitter links are present', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[
          {
            id: 'ig-1',
            artist_id: artist.id,
            platform: 'instagram',
            url: 'https://instagram.com/timwhite',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'tw-1',
            artist_id: artist.id,
            platform: 'twitter',
            url: 'https://x.com/timwhite',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
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

    expect(
      screen.getByRole('link', { name: 'Follow Tim White on Instagram' })
    ).toHaveAttribute('href', 'https://instagram.com/timwhite');
    expect(
      screen.getByRole('link', { name: 'Follow Tim White on Twitter' })
    ).toHaveAttribute('href', 'https://x.com/timwhite');
  });

  describe('Home alerts honesty (JOV-6197)', () => {
    it('shows one Get updates invitation before signup and no preference switches', () => {
      const onModeSelect = vi.fn();
      const onTogglePref = vi.fn();
      render(
        <ProfileDesktopSurface
          artist={artist}
          socialLinks={[]}
          contacts={contacts}
          photoDownloadSizes={[]}
          drawerOpen={false}
          drawerView='menu'
          activeMode='profile'
          onModeSelect={onModeSelect}
          onDrawerOpenChange={vi.fn()}
          onDrawerViewChange={vi.fn()}
          onOpenMenu={vi.fn()}
          onPlayClick={vi.fn()}
          profileHref='/timwhite'
          allowFanCapture
          isSubscribed={false}
          contentPrefs={contentPrefs}
          onTogglePref={onTogglePref}
          onUnsubscribe={vi.fn()}
        />
      );

      expect(screen.getByTestId('profile-desktop-get-updates')).toBeVisible();
      expect(screen.getAllByText('Get updates').length).toBeGreaterThanOrEqual(
        1
      );
      expect(
        screen.queryByRole('switch', { name: 'New Music' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('switch', { name: 'Shows' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('switch', { name: 'Merch' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'View Shows' })
      ).not.toBeInTheDocument();
      expect(screen.getByText('No live shows listed.')).toBeVisible();
      expect(screen.queryByText('No upcoming shows.')).not.toBeInTheDocument();

      screen.getByTestId('profile-desktop-get-updates').click();
      expect(onModeSelect).toHaveBeenCalledWith('subscribe');
      expect(onTogglePref).not.toHaveBeenCalled();
    });

    it('keeps preference switches inside Manage after signup', () => {
      const onTogglePref = vi.fn<(key: NotificationContentType) => void>();
      render(
        <ProfileDesktopSurface
          artist={artist}
          socialLinks={[]}
          contacts={contacts}
          photoDownloadSizes={[]}
          drawerOpen={false}
          drawerView='menu'
          activeMode='subscribe'
          onModeSelect={vi.fn()}
          onDrawerOpenChange={vi.fn()}
          onDrawerViewChange={vi.fn()}
          onOpenMenu={vi.fn()}
          onPlayClick={vi.fn()}
          profileHref='/timwhite'
          allowFanCapture
          isSubscribed
          contentPrefs={contentPrefs}
          onTogglePref={onTogglePref}
          onUnsubscribe={vi.fn()}
        />
      );

      expect(
        screen.getByTestId('profile-desktop-manage-settings')
      ).toBeVisible();
      const merchSwitch = screen.getByRole('switch', { name: 'Merch' });
      expect(merchSwitch).toHaveAttribute('aria-checked', 'false');
      merchSwitch.click();
      expect(onTogglePref).toHaveBeenCalledWith('merch');
      expect(screen.getByRole('switch', { name: 'New Music' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });
  });
  // Regression: hero social labels must use registry brand casing
  // (tiktok → 'TikTok'), not naive title case ('Tiktok').
  it('renders registry-cased hero social aria labels for TikTok', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[
          {
            id: 'tt-1',
            artist_id: artist.id,
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@timwhite',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
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

    expect(
      screen.getByRole('link', { name: 'Follow Tim White on TikTok' })
    ).toHaveAttribute('href', 'https://www.tiktok.com/@timwhite');
    expect(
      screen.queryByRole('link', { name: 'Follow Tim White on Tiktok' })
    ).toBeNull();
  });

  it('offers View Shows only when upcoming dates exist', () => {
    const onModeSelect = vi.fn();
    const upcomingShow = {
      id: 'show-1',
      profileId: artist.id,
      externalId: null,
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: '2026-01-01T00:00:00.000Z',
      title: null,
      venueName: 'The Echo',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
      startDate: '2026-10-20',
      startTime: null,
      timezone: null,
      latitude: null,
      longitude: null,
      ticketUrl: 'https://tickets.example.com/show-1',
      ticketStatus: 'available',
      lastSyncedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    } satisfies TourDateViewModel;

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
        onModeSelect={onModeSelect}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
      />
    );

    screen.getByRole('button', { name: 'View Shows' }).click();
    expect(onModeSelect).toHaveBeenCalledWith('tour');
  });

  it('keeps Home release rows as release-scoped links without decorative controls', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        releases={[
          {
            id: 'release-1',
            title: 'Training Season',
            slug: 'training-season',
            releaseType: 'single',
            releaseDate: '2026-04-24',
            artworkUrl: null,
            artistNames: ['Tim White'],
          },
        ]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onModeSelect={vi.fn()}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
      />
    );

    const releaseLink = screen.getByRole('link', { name: /Training Season/ });
    expect(releaseLink).toHaveAttribute('href', '/timwhite/training-season');
    expect(within(releaseLink).queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render artist-generic Listen beside an imported catalog', () => {
    render(
      <ProfileDesktopSurface
        artist={artist}
        socialLinks={[]}
        contacts={contacts}
        photoDownloadSizes={[]}
        releases={[
          {
            id: 'release-1',
            title: 'Training Season',
            slug: 'training-season',
            releaseType: 'single',
            releaseDate: '2026-04-24',
            artworkUrl: null,
            artistNames: ['Tim White'],
          },
        ]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='listen'
        onModeSelect={vi.fn()}
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        profileHref='/timwhite'
      />
    );

    expect(screen.getByTestId('profile-primary-tab-releases')).toBeVisible();
    expect(
      screen.queryByTestId('profile-primary-tab-artist-streaming')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-static-listen-interface')
    ).not.toBeInTheDocument();
  });
});
