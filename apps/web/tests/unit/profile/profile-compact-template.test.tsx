import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { PublicRelease } from '@/components/features/profile/releases/types';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';

const {
  mockCanonicalProfileDSPs,
  mockUseProfileShell,
  mockProfileInlineNotificationsCTA,
  mockProfileDesktopSurface,
  mockProfileUnifiedDrawer,
  mockProfilePrimaryTabPanel,
} = vi.hoisted(() => ({
  mockCanonicalProfileDSPs: vi.fn(() => []),
  mockUseProfileShell: vi.fn(),
  mockProfileInlineNotificationsCTA: vi.fn(),
  mockProfileDesktopSurface: vi.fn(),
  mockProfileUnifiedDrawer: vi.fn(),
  mockProfilePrimaryTabPanel: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: (loader: unknown) => {
    const source = String(loader);

    if (source.includes('ProfileUnifiedDrawer')) {
      return (props: unknown) => mockProfileUnifiedDrawer(props);
    }

    if (source.includes('ProfileInlineNotificationsCTA')) {
      return (props: unknown) => mockProfileInlineNotificationsCTA(props);
    }

    return () => null;
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
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

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    ProfileNotificationsContext: React.createContext(null),
    useProfileNotifications: () => ({
      state: 'idle',
      setState: vi.fn(),
      subscribedChannels: {},
      setSubscribedChannels: vi.fn(),
      subscriptionDetails: {},
      setSubscriptionDetails: vi.fn(),
      channel: 'email',
      setChannel: vi.fn(),
      registerInputFocus: vi.fn(),
      smsEnabled: false,
      source: 'profile',
      setSource: vi.fn(),
    }),
  })
);

vi.mock('@/components/organisms/profile-shell/useProfileShell', () => ({
  useProfileShell: (...args: unknown[]) => mockUseProfileShell(...args),
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: null,
    isEnabled: false,
  }),
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUnsubscribeNotificationsMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateContentPreferencesMutation: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
  }),
}));

vi.mock('@/lib/dsp', () => ({
  sortDSPsByGeoPopularity: (dsps: unknown[]) => dsps,
  sortDSPsForDevice: (dsps: unknown[]) => dsps,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: (...args: unknown[]) =>
    mockCanonicalProfileDSPs(...args),
}));

vi.mock('@/features/profile/ProfilePrimaryTabPanel', () => ({
  ProfilePrimaryTabPanel: (props: { readonly mode: string }) =>
    mockProfilePrimaryTabPanel(props),
}));

vi.mock('@/features/profile/templates/ProfileDesktopSurface', () => ({
  ProfileDesktopSurface: (props: Record<string, unknown>) =>
    mockProfileDesktopSurface(props),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  name: 'Test Artist',
  handle: 'test-artist',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_public: true,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_verified_flag: false,
};

const mockContacts = [
  {
    id: 'contact-1',
    role: 'booking',
    roleLabel: 'Booking',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    secondaryLabel: 'book@example.com',
    channels: [
      {
        type: 'email' as const,
        encoded: 'book@example.com',
      },
    ],
  },
] satisfies PublicContact[];

const mockReleases = [
  {
    id: 'release-1',
    title: "Don't Look Down",
    slug: 'dont-look-down',
    releaseType: 'single',
    releaseDate: '2024-11-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/release-1.jpg',
    artistNames: ['Test Artist'],
  },
  {
    id: 'release-2',
    title: 'Holding On',
    slug: 'holding-on',
    releaseType: 'single',
    releaseDate: '2023-10-01T00:00:00.000Z',
    artworkUrl: 'https://example.com/release-2.jpg',
    artistNames: ['Test Artist'],
  },
] satisfies readonly PublicRelease[];

let ProfileCompactTemplate: typeof import('@/features/profile/templates/ProfileCompactTemplate').ProfileCompactTemplate;

describe('ProfileCompactTemplate', () => {
  beforeAll(async () => {
    ({ ProfileCompactTemplate } = await import(
      '@/features/profile/templates/ProfileCompactTemplate'
    ));
  }, 120_000);

  beforeEach(() => {
    cleanup();
    mockCanonicalProfileDSPs.mockReturnValue([]);
    mockUseProfileShell.mockReset();
    mockProfileInlineNotificationsCTA.mockClear();
    mockProfileDesktopSurface.mockClear();
    mockProfileUnifiedDrawer.mockClear();
    mockProfilePrimaryTabPanel.mockClear();
    mockProfileInlineNotificationsCTA.mockImplementation(
      (props: {
        readonly onManageNotifications?: () => void;
        readonly onRegisterReveal?: (reveal: () => void) => void;
        readonly onSubscriptionActivated?: () => void;
      }) => (
        <button
          type='button'
          data-testid='mock-inline-notifications-cta'
          onClick={() =>
            props.onSubscriptionActivated?.() ?? props.onManageNotifications?.()
          }
        >
          Inline notifications
        </button>
      )
    );
    mockProfileUnifiedDrawer.mockImplementation(
      (props: {
        readonly open: boolean;
        readonly view: string;
        readonly presentation?: string;
        readonly onOpenChange?: (open: boolean) => void;
      }) => (
        <div
          data-testid='mock-profile-unified-drawer'
          data-open={String(props.open)}
          data-view={props.view}
          data-presentation={props.presentation ?? 'standalone'}
        >
          <button
            type='button'
            data-testid='mock-profile-unified-drawer-close'
            onClick={() => props.onOpenChange?.(false)}
          >
            Close drawer
          </button>
        </div>
      )
    );
    mockProfilePrimaryTabPanel.mockImplementation(
      (props: { readonly mode: string }) => (
        <div data-testid='mock-primary-tab-panel' data-mode={props.mode}>
          {props.mode}
        </div>
      )
    );
    mockUseProfileShell.mockImplementation(() => ({
      notificationsContextValue: {
        subscribedChannels: {},
        subscriptionDetails: {},
        setSubscribedChannels: vi.fn(),
        setSubscriptionDetails: vi.fn(),
        setState: vi.fn(),
      },
      notificationsController: {
        contentPreferences: null,
      },
    }));
    window.history.replaceState(null, '', '/test-artist');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the floating back control in the compact header', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('links the artist name back to the canonical profile route', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(
      screen.getByRole('link', { name: `Go to ${mockArtist.name}'s profile` })
    ).toHaveAttribute('href', `/${mockArtist.handle}`);
  });

  it('renders the mock-style overflow trigger in the compact profile header', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const trigger = screen.getByRole('button', { name: /more options/i });
    expect(trigger.className).toContain('bg-black/34');
    expect(trigger.className).toContain('h-11!');
  });

  it('can hide the menu trigger for clean marketing screenshots', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        hideMoreMenu
      />
    );

    expect(
      screen.queryByRole('button', { name: /more options/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More' })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('renders the compact bottom navigation with a real More action', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const bottomNav = screen.getByTestId('profile-bottom-nav');
    for (const label of ['Home', 'Music', 'Events', 'Alerts', 'More']) {
      expect(
        within(bottomNav).getByRole('button', { name: label })
      ).toBeInTheDocument();
    }
    expect(
      within(bottomNav).queryByRole('button', { name: 'Profile' })
    ).not.toBeInTheDocument();

    fireEvent.click(within(bottomNav).getByRole('button', { name: 'More' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'true'
      );
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-view',
        'menu'
      );
    });
  });

  it('keeps the home tab active for about mode deep links', async () => {
    render(
      <ProfileCompactTemplate
        mode='about'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const bottomNav = screen.getByTestId('profile-bottom-nav');
    expect(
      within(bottomNav).getByRole('button', { name: 'Home' })
    ).toHaveAttribute('aria-current', 'page');
  });

  it('uses browser back from the floating back control when history is available', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const originalReferrer = document.referrer;

    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://example.com/previous',
    });
    window.history.pushState(null, '', '/previous');
    window.history.pushState(null, '', '/test-artist');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: originalReferrer,
    });
    backSpy.mockRestore();
  });

  it('does not push an intermediate profile URL when deep-linked into a mode', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(window.location.search).toBe('?mode=listen');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(mockUseProfileShell).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modeOverride: 'listen',
      })
    );

    pushStateSpy.mockRestore();
  });

  it('renders the alerts tab when ?mode=subscribe is in the URL', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=subscribe');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'subscribe',
        })
      );
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-mode',
        'subscribe'
      );
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
    });

    expect(screen.queryByTestId('profile-bottom-nav')).not.toBeInTheDocument();
  });

  it('renders the Music tab when ?mode=listen is in the URL even when releases exist', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        releases={mockReleases}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-mode',
        'listen'
      );
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
    });

    expect(screen.getByTestId('profile-bottom-nav')).toBeInTheDocument();
    expect(window.location.search).toBe('?mode=listen');
  });

  it('prioritizes the ticket CTA without rendering tour metadata in the hero', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        latestRelease={{
          title: "Don't Look Down",
          slug: 'dont-look-down',
          artworkUrl: 'https://example.com/release.jpg',
          releaseDate: '2026-04-01T00:00:00.000Z',
          releaseType: 'single',
        }}
        tourDates={[
          {
            id: 'tour-1',
            profileId: mockArtist.id,
            title: null,
            venueName: 'The Echo',
            city: 'Los Angeles',
            region: 'CA',
            country: 'US',
            startDate: '2099-05-01T00:00:00.000Z',
            endDate: null,
            ticketUrl: 'https://tickets.example.com/show',
            ticketStatus: 'onsale',
            timezone: 'America/Los_Angeles',
            latitude: null,
            longitude: null,
            source: 'manual',
            sourceEventId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByTestId('profile-hero-alerts-row')).toHaveTextContent(
      'Alerts Off'
    );
    expect(screen.getByTestId('profile-home-rail-tour')).toHaveTextContent(
      'Tickets'
    );
    expect(
      screen.queryByTestId('profile-hero-status-pill')
    ).not.toBeInTheDocument();
  });

  it('falls back to the listen CTA without rendering release metadata in the hero', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        latestRelease={{
          title: "Don't Look Down",
          slug: 'dont-look-down',
          artworkUrl: 'https://example.com/release.jpg',
          releaseDate: '2026-04-01T00:00:00.000Z',
          releaseType: 'single',
        }}
      />
    );

    expect(screen.getByTestId('profile-hero-alerts-row')).toHaveTextContent(
      'Alerts Off'
    );
    expect(screen.getByTestId('profile-home-rail-release')).toHaveTextContent(
      'Listen Now'
    );
    expect(
      screen.queryByTestId('profile-hero-status-pill')
    ).not.toBeInTheDocument();
  });

  it('opens the alerts tab from the compact hero alerts row', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const alertsRow = screen.getByTestId('profile-hero-alerts-row');
    expect(alertsRow).toHaveTextContent('Alerts Off');
    expect(alertsRow).not.toHaveTextContent('New music and shows');

    fireEvent.click(alertsRow);

    await waitFor(() => {
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-mode',
        'subscribe'
      );
    });
  });

  it('opens the registered notifications reveal from the compact hero alerts row', async () => {
    const revealNotifications = vi.fn();
    mockProfileInlineNotificationsCTA.mockImplementation(
      (props: {
        readonly onManageNotifications?: () => void;
        readonly onRegisterReveal?: (reveal: () => void) => void;
      }) => {
        props.onRegisterReveal?.(revealNotifications);
        return (
          <button
            type='button'
            data-testid='mock-inline-notifications-cta'
            onClick={() => props.onManageNotifications?.()}
          >
            Inline notifications
          </button>
        );
      }
    );

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByTestId('profile-hero-alerts-row'));

    expect(revealNotifications).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId('mock-primary-tab-panel')
    ).not.toBeInTheDocument();
  });

  it('hides the compact hero alerts row for returning subscribers', async () => {
    mockUseProfileShell.mockImplementation(() => ({
      notificationsContextValue: {
        subscribedChannels: { email: true },
        subscriptionDetails: { email: 'fan@example.com' },
        setSubscribedChannels: vi.fn(),
        setSubscriptionDetails: vi.fn(),
        setState: vi.fn(),
      },
      notificationsController: {
        contentPreferences: null,
      },
    }));

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(
      screen.queryByTestId('profile-hero-alerts-row')
    ).not.toBeInTheDocument();
  });

  it('keeps the compact hero alerts row on after activation in the current session', async () => {
    const renderProfile = () => (
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const view = render(renderProfile());

    fireEvent.click(screen.getByTestId('mock-inline-notifications-cta'));

    mockUseProfileShell.mockImplementation(() => ({
      notificationsContextValue: {
        subscribedChannels: { email: true },
        subscriptionDetails: { email: 'fan@example.com' },
        setSubscribedChannels: vi.fn(),
        setSubscriptionDetails: vi.fn(),
        setState: vi.fn(),
      },
      notificationsController: {
        contentPreferences: null,
      },
    }));

    view.rerender(renderProfile());

    expect(screen.getByTestId('profile-hero-alerts-row')).toHaveTextContent(
      'Alerts On'
    );
  });

  it('falls back to the mode prop when the URL has no mode param', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'listen',
        })
      );
    });
  });

  it('updates requested mode when the fallback mode prop changes', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

    const { rerender } = render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'profile',
        })
      );
    });

    rerender(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'listen',
        })
      );
    });
  });

  it('keeps modeOverride in sync when user interactions switch primary tabs', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        releases={mockReleases}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Music' }));

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'listen',
        })
      );
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-mode',
        'listen'
      );
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
    });
  });

  it('routes the inline subscribed CTA into the alerts tab', async () => {
    mockUseProfileShell.mockImplementation(() => ({
      notificationsContextValue: {
        subscribedChannels: { email: true },
        subscriptionDetails: { email: 'fan@example.com' },
        setSubscribedChannels: vi.fn(),
        setSubscriptionDetails: vi.fn(),
        setState: vi.fn(),
      },
      notificationsController: {
        contentPreferences: null,
      },
    }));

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByTestId('mock-inline-notifications-cta'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-mode',
        'subscribe'
      );
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
    });
  });

  it('does not rewrite the URL when a non-mode drawer opens over a deep-linked mode', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    pushStateSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?mode=listen');

    pushStateSpy.mockRestore();
  });

  it('renders the confirmed playlist fallback when no release is available', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        featuredPlaylistFallback={{
          artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
          confirmedAt: '2026-01-01T00:00:00.000Z',
          discoveredAt: '2026-01-01T00:00:00.000Z',
          imageUrl: 'https://example.com/playlist.jpg',
          playlistId: '37i9dQZF1DZ06evO2SKVTu',
          searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
          source: 'serp_html',
          title: 'This Is Tim White',
          url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        }}
      />
    );

    expect(
      screen.getByRole('link', {
        name: /This Is Tim White/,
      })
    ).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu'
    );
    expect(screen.getByText('Featured Playlist')).toBeInTheDocument();
  });

  it('keeps optional hero role metadata out of the mobile hero chrome', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={{
          ...mockArtist,
          settings: {
            heroRoleLabel: 'DJ / Producer',
          },
        }}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(screen.queryByText('DJ / Producer')).not.toBeInTheDocument();
  });

  it('keeps the upcoming show CTA ahead of the playlist fallback', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        featuredPlaylistFallback={{
          artistSpotifyId: '4Uwpa6zW3zzCSQvooQNksm',
          confirmedAt: '2026-01-01T00:00:00.000Z',
          discoveredAt: '2026-01-01T00:00:00.000Z',
          imageUrl: 'https://example.com/playlist.jpg',
          playlistId: '37i9dQZF1DZ06evO2SKVTu',
          searchQuery: 'site:open.spotify.com/playlist "This Is Tim White"',
          source: 'serp_html',
          title: 'This Is Tim White',
          url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu',
        }}
        tourDates={[
          {
            id: 'tour-1',
            profileId: mockArtist.id,
            title: null,
            venueName: 'The Ballroom',
            city: 'Los Angeles',
            region: 'CA',
            country: 'US',
            startDate: '2099-05-01T00:00:00.000Z',
            endDate: null,
            ticketUrl: 'https://tickets.example.com/show',
            ticketStatus: 'onsale',
            timezone: 'America/Los_Angeles',
            latitude: null,
            longitude: null,
            source: 'manual',
            sourceEventId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]}
      />
    );

    expect(screen.getByTestId('profile-home-rail-tour')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: `Open This Is playlist for ${mockArtist.name}`,
      })
    ).not.toBeInTheDocument();
  });

  it('clears the mode query and closes a deep-linked secondary drawer', async () => {
    window.history.replaceState(null, '', '/test-artist?mode=contact');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
      />
    );

    fireEvent.click(screen.getByTestId('mock-profile-unified-drawer-close'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
      expect(window.location.pathname).toBe('/test-artist');
      expect(window.location.search).toBe('');
    });
  });

  it('stays closed after the delayed reset window for secondary drawers', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/test-artist?mode=contact');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
      />
    );

    fireEvent.click(screen.getByTestId('mock-profile-unified-drawer-close'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(window.location.search).toBe('');
    expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
      'data-open',
      'false'
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
      'data-open',
      'false'
    );
    expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
      'data-view',
      'menu'
    );
  });

  it('does not restore a stale secondary drawer mode on popstate after close', async () => {
    window.history.replaceState(null, '', '/test-artist?mode=contact');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
      />
    );

    fireEvent.click(screen.getByTestId('mock-profile-unified-drawer-close'));

    await waitFor(() => {
      expect(window.location.search).toBe('');
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'profile',
        })
      );
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
        'data-open',
        'false'
      );
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'profile',
        })
      );
    });
  });

  it('renders the drawer at desktop widths', async () => {
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as typeof window.matchMedia;

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('mock-profile-unified-drawer')
      ).toBeInTheDocument();
    });

    window.matchMedia = previousMatchMedia;
  });
});
