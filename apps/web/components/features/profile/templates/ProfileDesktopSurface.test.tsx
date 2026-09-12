import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Music' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Events' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alerts' })).toBeInTheDocument();
    const listenCta = screen.getByRole('button', { name: 'Listen' });
    expect(listenCta).toHaveClass('h-auto', 'min-h-7');
    expect(listenCta).toHaveClass(
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
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
    expect(screen.getByTestId('profile-primary-tab-releases')).toHaveClass(
      PROFILE_LISTEN_RELEASES_COLUMN_CLASSNAME
    );
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

  // Dead-control regression (JOV-6124 desktop hydrated-beat cert): the Alerts
  // card preference switches rendered `checked={contentPrefs[key]}` but routed
  // activation to the subscribe flow, so a role="switch" never changed state —
  // for subscribed visitors the template's real mutation handler was dropped.
  describe('Alerts card preference switches', () => {
    const renderAlertsCard = (props: {
      readonly onTogglePref: (key: NotificationContentType) => void;
    }) =>
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
          isSubscribed
          contentPrefs={contentPrefs}
          onTogglePref={props.onTogglePref}
          onUnsubscribe={vi.fn()}
        />
      );

    it('routes activation to the template preference mutation when subscribed', () => {
      const onTogglePref = vi.fn<(key: NotificationContentType) => void>();
      renderAlertsCard({ onTogglePref });

      const merchSwitch = screen.getByRole('switch', { name: 'Merch' });
      expect(merchSwitch).toHaveAttribute('data-state', 'unchecked');
      merchSwitch.click();

      expect(onTogglePref).toHaveBeenCalledTimes(1);
      expect(onTogglePref).toHaveBeenCalledWith('merch');
    });

    it('keeps the switch state owned by contentPrefs when subscribed', () => {
      renderAlertsCard({ onTogglePref: vi.fn() });
      expect(screen.getByRole('switch', { name: 'New Music' })).toHaveAttribute(
        'data-state',
        'checked'
      );
      expect(screen.getByRole('switch', { name: 'Shows' })).toHaveAttribute(
        'data-state',
        'unchecked'
      );
    });

    it('routes activation to the subscribe flow for unsubscribed visitors', () => {
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

      const newMusicSwitch = screen.getByRole('switch', {
        name: 'New Music',
      });
      expect(newMusicSwitch).toHaveAttribute('data-state', 'unchecked');
      newMusicSwitch.click();

      expect(onModeSelect).toHaveBeenCalledWith('subscribe');
      expect(onTogglePref).not.toHaveBeenCalled();
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
});
