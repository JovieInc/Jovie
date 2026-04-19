import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { APP_ROUTES } from '@/constants/routes';
import type { Artist } from '@/types/db';

const {
  mockCanonicalProfileDSPs,
  mockUseProfileShell,
  mockProfileInlineNotificationsCTA,
  mockProfileUnifiedDrawer,
} = vi.hoisted(() => ({
  mockCanonicalProfileDSPs: vi.fn(() => []),
  mockUseProfileShell: vi.fn(),
  mockProfileInlineNotificationsCTA: vi.fn(),
  mockProfileUnifiedDrawer: vi.fn(),
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

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    ProfileNotificationsContext: React.createContext(null),
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
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: (...args: unknown[]) =>
    mockCanonicalProfileDSPs(...args),
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

let ProfileCompactTemplate: typeof import('@/features/profile/templates/ProfileCompactTemplate').ProfileCompactTemplate;

describe('ProfileCompactTemplate', () => {
  beforeAll(async () => {
    ({ ProfileCompactTemplate } = await import(
      '@/features/profile/templates/ProfileCompactTemplate'
    ));
  }, 30_000);

  beforeEach(() => {
    cleanup();
    mockCanonicalProfileDSPs.mockReturnValue([]);
    mockUseProfileShell.mockReset();
    mockProfileInlineNotificationsCTA.mockClear();
    mockProfileUnifiedDrawer.mockClear();
    mockProfileInlineNotificationsCTA.mockImplementation(
      (props: {
        readonly onManageNotifications?: () => void;
        readonly onRegisterReveal?: (reveal: () => void) => void;
      }) => (
        <button
          type='button'
          data-testid='mock-inline-notifications-cta'
          onClick={() => props.onManageNotifications?.()}
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

  it('links the top-left Jovie mark to the artist profiles landing page', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(
      screen.getByRole('link', { name: 'Create your artist profile on Jovie' })
    ).toHaveAttribute('href', APP_ROUTES.ARTIST_PROFILES);
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

  it('renders a quiet menu trigger in the compact profile header', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const trigger = screen.getByRole('button', { name: /more options/i });
    expect(trigger.className).toContain('bg-transparent');
    expect(trigger.className).toContain('border-transparent');
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
      screen.getByRole('link', { name: 'Create your artist profile on Jovie' })
    ).toBeInTheDocument();
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

  it('opens subscribe drawer when ?mode=subscribe is in the URL', async () => {
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

    // Subscribe mode now opens the drawer directly instead of the inline CTA.
    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'subscribe',
        })
      );
    });
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

  it('keeps modeOverride in sync when user interactions open a mode drawer', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: `Play ${mockArtist.name}` })
    );

    await waitFor(() => {
      expect(window.location.search).toContain('mode=listen');
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'listen',
        })
      );
    });
  });

  it('opens the notifications drawer when the inline subscribed CTA manages notifications', async () => {
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

    expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
      'data-open',
      'true'
    );
    expect(screen.getByTestId('mock-profile-unified-drawer')).toHaveAttribute(
      'data-view',
      'notifications'
    );
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

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));

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
        name: `Open This Is playlist for ${mockArtist.name}`,
      })
    ).toHaveAttribute(
      'href',
      'https://open.spotify.com/playlist/37i9dQZF1DZ06evO2SKVTu'
    );
    expect(screen.getByText('Open Playlist')).toBeInTheDocument();
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

    expect(screen.getByText('Tickets')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', {
        name: `Open This Is playlist for ${mockArtist.name}`,
      })
    ).not.toBeInTheDocument();
  });

  it('clears the mode query and closes the deep-linked drawer', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
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

  it('stays closed after the delayed reset window', async () => {
    vi.useFakeTimers();
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
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

  it('does not restore a stale drawer mode on popstate after close', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
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
