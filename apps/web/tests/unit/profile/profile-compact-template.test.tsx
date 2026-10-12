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
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AboutSection } from '@/components/features/profile/AboutSection';
import type { PublicRelease } from '@/components/features/profile/releases/types';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import { ProfileCompactSurface } from '../../../components/features/profile/templates/ProfileCompactSurface';
import { ProfileCompactTemplate } from '../../../components/features/profile/templates/ProfileCompactTemplate';

// The desktop surface ships behind a build-time flag (default off). Most of
// this suite pins it ON to keep covering the flagged desktop surface; the
// flag-off describe below stubs it back to the shipped default.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE = '1';
});

vi.mock('@/lib/profile/desktop-surface-flag', () => ({
  get PROFILE_DESKTOP_SURFACE_ENABLED() {
    const value = process.env.NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE;
    return value === '1' || value === 'true';
  },
}));

const {
  mockCanonicalProfileDSPs,
  mockUseProfileShell,
  mockUseIsAuthenticated,
  mockProfileInlineNotificationsCTA,
  mockProfileDesktopSurface,
  mockProfileUnifiedDrawer,
  mockProfilePrimaryTabPanel,
  MockProfileDesktopSurface,
  mockClientNavigation,
} = vi.hoisted(() => {
  const mockProfileDesktopSurface = vi.fn();
  function MockProfileDesktopSurface(props: {
    readonly onReady?: () => void;
    readonly [key: string]: unknown;
  }) {
    const { onReady } = props;
    mockProfileDesktopSurface(props);
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return React.createElement(
      'div',
      { 'data-testid': 'mock-profile-desktop-surface' },
      React.createElement(
        'nav',
        { 'aria-label': 'Profile Navigation' },
        React.createElement('button', { type: 'button' }, 'Home'),
        React.createElement('button', { type: 'button' }, 'Music'),
        React.createElement('button', { type: 'button' }, 'Events'),
        React.createElement('button', { type: 'button' }, 'About')
      )
    );
  }
  return {
    mockCanonicalProfileDSPs: vi.fn(() => []),
    mockUseProfileShell: vi.fn(),
    mockUseIsAuthenticated: vi.fn(() => false),
    mockProfileInlineNotificationsCTA: vi.fn(),
    mockProfileDesktopSurface,
    mockProfileUnifiedDrawer: vi.fn(),
    mockProfilePrimaryTabPanel: vi.fn(),
    MockProfileDesktopSurface,
    mockClientNavigation: vi.fn((_href: string) => false),
  };
});

vi.mock('next/dynamic', () => ({
  default: (loader: unknown) => {
    const source = String(loader);

    if (source.includes('ProfileUnifiedDrawer')) {
      return (props: unknown) => mockProfileUnifiedDrawer(props);
    }

    if (source.includes('ProfileInlineNotificationsCTA')) {
      return (props: unknown) => mockProfileInlineNotificationsCTA(props);
    }

    if (source.includes('ProfileDesktopSurface')) {
      return MockProfileDesktopSurface;
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
  }) =>
    React.createElement(
      'a',
      {
        href,
        ...props,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (mockClientNavigation(href)) {
            event.preventDefault();
            window.history.pushState(window.history.state, '', href);
          }
        },
      },
      children
    ),
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

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => mockUseIsAuthenticated(),
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
  ProfileDesktopSurface: MockProfileDesktopSurface,
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
    role: 'bookings',
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

function mockViewport(width: 'mobile' | 'desktop') {
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      width === 'desktop' &&
      (query === '(min-width: 768px)' || query === '(min-width: 1180px)'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

  return () => {
    window.matchMedia = previousMatchMedia;
  };
}

describe('ProfileCompactTemplate', () => {
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    cleanup();
    mockClientNavigation.mockReturnValue(false);
    mockCanonicalProfileDSPs.mockReturnValue([]);
    mockUseIsAuthenticated.mockReturnValue(false);
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
        readonly onViewChange?: (view: string) => void;
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
          <button
            type='button'
            data-testid='mock-profile-unified-drawer-menu'
            onClick={() => props.onViewChange?.('menu')}
          >
            Open menu
          </button>
        </div>
      )
    );
    mockProfilePrimaryTabPanel.mockImplementation(
      (props: {
        readonly mode: string;
        readonly catalogLoadFailed?: boolean;
      }) => (
        <div
          data-testid='mock-primary-tab-panel'
          data-mode={props.mode}
          data-catalog-load-failed={props.catalogLoadFailed ? 'true' : 'false'}
        >
          {props.mode}
        </div>
      )
    );
    mockUseProfileShell.mockImplementation(() => ({
      locationMode:
        new URLSearchParams(window.location.search).get('mode') ?? 'profile',
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
    // AnonCookieBootstrap fetches the per-user variant on mount; resolve it
    // deterministically so tests exercise the post-resolution state.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ alertOptInVariant: 'button' }),
      })
    );
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.cookie =
      'jv_country=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('keeps the signed-in escape hatch on a live tablet profile that uses embedded presentation', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);

    render(
      <ProfileCompactSurface
        renderMode='interactive'
        presentation='embedded'
        allowSignedInEscape
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onBack={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onShare={vi.fn()}
        profileHref='/test-artist'
      />
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('does not treat marketing embeds as a signed-in live public profile', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);

    render(
      <ProfileCompactSurface
        renderMode='interactive'
        presentation='embedded'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        drawerOpen={false}
        drawerView='menu'
        activeMode='profile'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onBack={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onShare={vi.fn()}
        profileHref='/test-artist'
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('shows the floating back control on the public profile root for a signed-in session', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);

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

  it('passes the proof claim to the phone claim bar (JOV-7114)', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        proofClaim
        showClaimFooter
        claimFooterHref='/start?campaign=proof-to-claim'
        claimFooterLabel='Claim yours'
      />
    );

    expect(
      await screen.findByTestId('profile-proof-claim-bar-cta')
    ).toHaveAttribute('href', '/start?campaign=proof-to-claim');
  });

  it('hides the floating back control on the public profile root first landing', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('keeps the floating back control on nested modes with a profile-root destination', async () => {
    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  // Regression: JOV-4103 — public profile hero must show social media icons
  // when the artist has Instagram/Twitter links (missed-ship recovery).
  it('renders identity social icons for Instagram and Twitter profile links', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[
          {
            id: 'ig-1',
            artist_id: mockArtist.id,
            platform: 'instagram',
            url: 'https://instagram.com/test-artist',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'tw-1',
            artist_id: mockArtist.id,
            platform: 'twitter',
            url: 'https://x.com/test-artist',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
        contacts={[]}
      />
    );

    const socialRow = await screen.findByTestId('profile-identity-social-row');
    expect(socialRow).toBeInTheDocument();

    const instagram = within(socialRow).getByRole('link', {
      name: `Follow ${mockArtist.name} on Instagram`,
    });
    const twitter = within(socialRow).getByRole('link', {
      name: `Follow ${mockArtist.name} on Twitter`,
    });
    expect(instagram).toHaveAttribute(
      'href',
      'https://instagram.com/test-artist'
    );
    expect(twitter).toHaveAttribute('href', 'https://x.com/test-artist');
  });

  it('uses registry brand casing for identity social aria labels', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[
          {
            id: 'tiktok',
            artist_id: mockArtist.id,
            platform: 'tiktok',
            url: 'https://www.tiktok.com/@test-artist',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
        contacts={[]}
      />
    );

    const socialRow = await screen.findByTestId('profile-identity-social-row');
    // Registry casing ('TikTok'), not naive title case ('Tiktok').
    expect(
      within(socialRow).getByRole('link', {
        name: `Follow ${mockArtist.name} on TikTok`,
      })
    ).toHaveAttribute('href', 'https://www.tiktok.com/@test-artist');
    expect(
      within(socialRow).queryByRole('link', {
        name: `Follow ${mockArtist.name} on Tiktok`,
      })
    ).toBeNull();
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

    expect(screen.getByRole('link', { name: mockArtist.name })).toHaveAttribute(
      'href',
      `/${mockArtist.handle}`
    );
  });

  it('keeps the identity header on 44px targets with the handle under the name', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={{ ...mockArtist, location: 'Los Angeles' }}
        socialLinks={[
          {
            id: 'instagram',
            artist_id: mockArtist.id,
            platform: 'instagram',
            url: 'https://instagram.com/test-artist',
            clicks: 0,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ]}
        contacts={[]}
      />
    );

    const identity = screen.getByTestId('profile-identity-header');
    expect(
      within(identity).getByTestId('profile-identity-handle')
    ).toHaveTextContent(`jov.ie/${mockArtist.handle}`);
    // Location lives in About, not in the identity header.
    expect(within(identity).queryByText('Los Angeles')).toBeNull();
    // Get Updates is the only identity action; songs carry their own Listen.
    expect(
      within(identity).queryByTestId('profile-identity-listen')
    ).toBeNull();
    const getUpdates = within(identity).getByRole('button', {
      name: 'Get Updates',
    });
    expect(getUpdates.parentElement).toHaveClass('h-11');
    expect(
      getUpdates.parentElement?.querySelector('.profile-glass-pill')
    ).toHaveClass('profile-glass-pill', 'profile-glass-pill--flat', 'h-7');
    expect(
      within(screen.getByTestId('profile-identity-social-row')).getByRole(
        'link'
      )
    ).toHaveClass('h-11', 'w-11');
  });

  it('opens the existing subscribe flow from the identity Get Updates action', async () => {
    const revealNotifications = vi.fn();
    mockProfileInlineNotificationsCTA.mockImplementation(
      (props: { readonly onRegisterReveal?: (reveal: () => void) => void }) => {
        props.onRegisterReveal?.(revealNotifications);
        return null;
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

    // The hero CTA mounts once the visitor assignment resolves; the reveal is
    // registered at mount, so clicks afterwards hit the reveal path.
    await waitFor(() => {
      expect(mockProfileInlineNotificationsCTA).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Get Updates' }));

    await waitFor(() => {
      expect(revealNotifications).toHaveBeenCalledTimes(1);
    });
  });

  it('shows no Get Updates action when the profile cannot take fans', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        allowFanCapture={false}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Get Updates' })
    ).not.toBeInTheDocument();
  });

  it('scopes the mobile overflow contract to the active home surface slot', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const surface = screen.getByTestId('profile-compact-surface');

    expect(surface.parentElement).toHaveAttribute(
      'data-profile-home-mode',
      'true'
    );
    expect(surface.parentElement?.parentElement).toHaveClass(
      'profile-compact-surface-slot'
    );
  });

  it('shows the artist photo as an 80px portrait with only the verified glyph over it', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={{
          ...mockArtist,
          image_url: 'https://example.com/artist.jpg',
          is_verified: true,
        }}
        socialLinks={[]}
        contacts={[]}
      />
    );

    // Portrait is decorative (empty alt) so the H1 name is not duplicated.
    const identity = screen.getByTestId('profile-identity-header');
    const artistPhoto = identity.querySelector(
      'img[src="https://example.com/artist.jpg"]'
    );
    expect(artistPhoto).not.toBeNull();
    expect(artistPhoto?.getAttribute('alt') ?? '').toBe('');
    expect(artistPhoto?.className).not.toContain('grayscale');
    expect(artistPhoto?.closest('.h-20.w-20')).not.toBeNull();
    // Verified is a glyph with a tooltip, never the visible word.
    const verified = within(identity).getByRole('img', {
      name: 'Verified Jovie Profile',
    });
    expect(verified).toHaveAttribute('title', 'Verified Jovie Profile');
    expect(identity).not.toHaveTextContent(/verified/i);
    // The cover no longer hosts a photo; it is floating chrome only.
    expect(screen.getByTestId('profile-cover').querySelector('img')).toBeNull();
  });

  it('names the document identity heading after the artist', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={{ ...mockArtist, is_verified: true }}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: mockArtist.name })
    ).toBeInTheDocument();
  });

  it('opens the release credits drawer from the profile credits trigger', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        releaseCredits={[
          { role: 'producer', label: 'Producer', entries: [] },
          {
            role: 'main_artist',
            label: 'Main artist',
            entries: [
              {
                artistId: 'artist-1',
                name: 'Test Artist',
                handle: null,
                role: 'main_artist',
                position: 0,
              },
            ],
          },
        ]}
      />
    );

    // No raw credits control in the shell; the entry lives in the menu.
    expect(
      screen.queryByRole('button', { name: 'Release credits' })
    ).toBeNull();
    const drawerProps = mockProfileUnifiedDrawer.mock.calls.at(-1)?.[0] as {
      onOpenReleaseCredits?: () => void;
    };
    expect(drawerProps.onOpenReleaseCredits).toBeTypeOf('function');
    act(() => drawerProps.onOpenReleaseCredits?.());

    const drawer = await screen.findByRole('dialog', { name: 'Credits' });
    expect(within(drawer).getByText('Main artist')).toBeInTheDocument();
    expect(within(drawer).queryByText('Producer')).toBeNull();

    // The desktop surface slot owns a sheet container that anchors modal
    // drawers to the desktop shell (route DOM certification, JOV-6915).
    const sheetContainer = document.querySelector('[data-sheet-container]');
    expect(sheetContainer).not.toBeNull();
    expect(
      sheetContainer?.querySelector(
        '[data-testid="mock-profile-desktop-surface"]'
      )
    ).not.toBeNull();
  });

  it('hides the release credits menu entry when every credit group is empty', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        releaseCredits={[{ role: 'producer', label: 'Producer', entries: [] }]}
      />
    );

    const drawerProps = mockProfileUnifiedDrawer.mock.calls.at(-1)?.[0] as {
      onOpenReleaseCredits?: () => void;
    };
    expect(drawerProps.onOpenReleaseCredits).toBeUndefined();
  });

  it('keeps the identity header without a portrait image when a profile has no real photo', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const identity = screen.getByTestId('profile-identity-header');
    expect(identity.querySelector('.h-20.w-20')).not.toBeNull();
    expect(screen.queryByTestId('profile-identity-verified')).toBeNull();
  });

  it('renders the Jovie menu trigger instead of a duplicate alerts trigger in the compact profile header', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const menuTrigger = within(
      screen.getByTestId('profile-top-chrome')
    ).getByRole('button', { name: 'Menu' });
    expect(menuTrigger).toBeInTheDocument();
    expect(
      within(screen.getByTestId('profile-top-chrome')).queryByRole('button', {
        name: 'Alerts',
      })
    ).not.toBeInTheDocument();

    fireEvent.click(menuTrigger);

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

  // Regression: JOV-3377 — with overflow-y-auto, overflow-x computes to auto
  // (CSS Overflow 3), so the home scroll region clips at its own padding box.
  // Without the --page-pad bleed, that clip lands --page-pad inside the shell
  // and hard-clips the featured editorial card instead of letting it reach
  // the surface edge (JOV-7123: the card replaces the old catalog carousel).
  it('bleeds the home content scroll region to the shell edge so the editorial card is not clipped', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const scrollRegion = screen.getByTestId('profile-content-scroll');
    expect(scrollRegion.className).toContain('-mx-(--page-pad)');
    expect(scrollRegion.className).toContain('px-(--page-pad)');
    expect(scrollRegion.className).toContain('overflow-y-auto');

    const surfaceSlot = screen
      .getByTestId('profile-compact-shell')
      .querySelector('.profile-compact-surface-slot');
    expect(surfaceSlot).toHaveClass('profile-compact-surface-slot');
    expect(surfaceSlot).toHaveClass('relative', 'min-h-0', 'flex-1');
  });

  // Regression: JOV-6573 — Music uses the same padding-box clip as home.
  // A fixed inset leaves the release rows under the side padding, and
  // overflow-y-auto computes overflow-x to auto, so a vertical drag pans
  // sideways. The Music scrollport bleeds to the shell edge and locks x.
  it('bleeds the Music scroll region to the shell edge and locks horizontal panning', async () => {
    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const scrollRegion = screen.getByTestId('profile-content-scroll');
    expect(scrollRegion.className).toContain('-mx-(--page-pad)');
    expect(scrollRegion.className).toContain('px-(--page-pad)');
    expect(scrollRegion.className).toContain('overflow-x-clip');
    expect(scrollRegion.className).toContain('touch-pan-y');
    expect(scrollRegion.className).toContain('overflow-y-auto');
    expect(scrollRegion.className).toContain('min-w-0');
  });

  it('does not bleed the content scroll region on non-music modes', async () => {
    render(
      <ProfileCompactTemplate
        mode='tour'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const scrollRegion = screen.getByTestId('profile-content-scroll');
    expect(scrollRegion.className).not.toContain('-mx-(--page-pad)');
    expect(scrollRegion.className).not.toContain('overflow-x-clip');
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
      screen.queryByRole('button', { name: 'Menu' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('renders the compact bottom navigation with four primary icon tabs', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const bottomNav = screen.getByTestId('profile-bottom-nav');
    for (const label of ['Home', 'Music', 'Events', 'About']) {
      expect(
        within(bottomNav).getByRole('button', { name: label })
      ).toBeInTheDocument();
    }
    expect(
      within(bottomNav).queryByRole('button', { name: 'Alerts' })
    ).toBeNull();
    expect(
      within(bottomNav).queryByRole('button', { name: 'Get updates' })
    ).toBeNull();
    expect(
      within(bottomNav).queryByRole('button', { name: 'More options' })
    ).not.toBeInTheDocument();
  });

  it('suppresses unowned fan capture and resolves subscribe deep links to home', async () => {
    render(
      <ProfileCompactTemplate
        mode='subscribe'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        allowFanCapture={false}
        showSubscriptionConfirmedBanner
      />
    );

    const bottomNav = screen.getByTestId('profile-bottom-nav');
    expect(
      within(bottomNav).queryByRole('button', { name: 'Alerts' })
    ).toBeNull();
    expect(screen.getByTestId('profile-compact-surface')).toHaveAttribute(
      'data-mode',
      'profile'
    );
    expect(screen.getByTestId('profile-home-rail')).toBeInTheDocument();
    expect(screen.queryByText(/Notifications on!/)).toBeNull();
  });

  it('keeps profile disclosure inside the fixed shell without hiding navigation', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        profileBanner={<div data-testid='test-profile-banner'>Unclaimed</div>}
      />
    );

    const shell = screen.getByTestId('profile-compact-shell');
    const banner = screen.getByTestId('profile-shell-banner');
    const surfaceSlot = banner.nextElementSibling;

    expect(shell).toContainElement(banner);
    expect(banner).toContainElement(
      within(banner).getByTestId('test-profile-banner')
    );
    expect(surfaceSlot).toHaveClass('min-h-0', 'flex-1');
  });

  it('marks About as the active destination for about mode deep links', async () => {
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
      within(bottomNav).getByRole('button', { name: 'About' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(bottomNav).getByRole('button', { name: 'Home' })
    ).not.toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
      'data-mode',
      'about'
    );
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

  it('uses browser back for a signed-in arrival when history exists without a referrer', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign: assignSpy,
    });
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 3,
    });

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
    expect(assignSpy).not.toHaveBeenCalled();

    backSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('returns a signed-in arrival without history to the app dashboard', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign: assignSpy,
    });
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 1,
    });

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backSpy).not.toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('/app');

    backSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does not trap a signed-in new-tab arrival in internal mode history', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 1,
    });
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {
      // noop
    });
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign: assignSpy,
    });

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('profile-compact-surface')).toHaveAttribute(
      'data-mode',
      'profile'
    );
    expect(assignSpy).not.toHaveBeenCalled();

    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 3,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backSpy).not.toHaveBeenCalled();
    expect(goSpy).not.toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalledWith('/app');

    backSpy.mockRestore();
    goSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('exits past internal mode history to the prior app surface for a signed-in arrival', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 2,
    });
    window.history.replaceState(
      { joviePublicProfileDepth: 2 },
      '',
      '/test-artist'
    );
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {
      // noop
    });
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign: assignSpy,
    });

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(goSpy).toHaveBeenCalledWith(-3);
    expect(backSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();

    backSpy.mockRestore();
    goSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does not overshoot the prior app surface after browser back', async () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 2,
    });
    window.history.replaceState(
      { joviePublicProfileDepth: 0 },
      '',
      '/test-artist'
    );
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });
    const goSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {
      // noop
    });
    const assignSpy = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign: assignSpy,
    });

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    Object.defineProperty(window.history, 'length', {
      configurable: true,
      value: 4,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();

    backSpy.mockRestore();
    goSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('returns nested listen mode to the profile root instead of leaving the profile', async () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
      // noop
    });

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(backSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('profile-compact-surface')).toHaveAttribute(
      'data-mode',
      'profile'
    );
    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();

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

    await waitFor(() => {
      expect(window.location.search).toBe('?mode=listen');
      expect(pushStateSpy).not.toHaveBeenCalled();
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({
          modeOverride: 'listen',
        })
      );
    });

    pushStateSpy.mockRestore();
  });

  it('does not push a source-less URL before the source param hydrates', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?source=qr');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

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
          sourceOverride: 'qr',
        })
      );
    });

    expect(window.location.search).toBe('?source=qr');
    for (const call of pushStateSpy.mock.calls) {
      expect(String(call[2])).toContain('source=qr');
    }

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

    expect(screen.getByTestId('profile-bottom-nav')).toBeInTheDocument();
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

    // JOV-7123: the featured editorial card carries the show — there is no
    // carousel or separate alerts card on the home surface.
    const pacCard = screen.getByTestId('profile-pac');
    expect(pacCard).toHaveAttribute('data-state', 'tickets');
    expect(pacCard).toHaveTextContent('Tickets');
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByTestId('profile-hero-status-pill')
    ).not.toBeInTheDocument();
  });

  it('renders the compact latest release card without release metadata in the hero', async () => {
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

    const pacCard = screen.getByTestId('profile-pac');

    // The featured editorial card carries the release and its Listen CTA as
    // the single card surface on the home rail.
    expect(pacCard).toHaveTextContent("Don't Look Down");
    expect(pacCard).toHaveTextContent('Listen now');
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByTestId('profile-hero-status-pill')
    ).not.toBeInTheDocument();
  });

  it('leads the featured editorial card with the newest catalog release when latestRelease is not provided', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        releases={mockReleases}
      />
    );

    // JOV-7123: the editorial card resolves the newest catalog release as its
    // subject; the rest of the catalog stays on the Music destination.
    const homeRail = screen.getByTestId('profile-home-rail');
    expect(homeRail).toHaveTextContent("Don't Look Down");
    expect(homeRail).not.toHaveTextContent('Holding On');
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
  });

  it('opens the alerts tab from the identity header Get Updates action', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    // JOV-7123: the alerts carousel card is gone; Get Updates on the
    // identity header is the home capture entry point.
    fireEvent.click(screen.getByTestId('profile-identity-get-updates'));

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

    // The hero CTA mounts once the visitor assignment resolves; the reveal is
    // registered at mount, so clicks afterwards hit the reveal path.
    await screen.findByTestId('mock-inline-notifications-cta');

    fireEvent.click(screen.getByTestId('profile-identity-get-updates'));

    await waitFor(() => {
      expect(revealNotifications).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByTestId('mock-primary-tab-panel')
    ).not.toBeInTheDocument();
  });

  it('keeps the fan-capture CTA unmounted until the visitor assignment resolves', async () => {
    let resolveAssignment:
      | ((value: { ok: boolean; json: () => Promise<unknown> }) => void)
      | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveAssignment = resolve;
          })
      )
    );

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    // While the assignment fetch is in flight the interactive capture CTA
    // must not exist — a control that would morph post-paint stays absent.
    expect(
      screen.queryByTestId('mock-inline-notifications-cta')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-compact-shell')).not.toHaveAttribute(
      'data-visitor-assignment-resolved'
    );
    expect(mockProfileInlineNotificationsCTA).not.toHaveBeenCalled();

    await act(async () => {
      resolveAssignment?.({
        ok: true,
        json: async () => ({ alertOptInVariant: 'toggle' }),
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('profile-compact-shell')).toHaveAttribute(
        'data-visitor-assignment-resolved',
        'true'
      );
    });
    // The CTA mounts exactly once, with the assigned variant — never the
    // ISR default that would later morph.
    expect(screen.getByTestId('profile-compact-shell')).toHaveAttribute(
      'data-alert-opt-in-variant',
      'toggle'
    );
    expect(mockProfileInlineNotificationsCTA).toHaveBeenCalledWith(
      expect.objectContaining({ experimentVariant: 'toggle' })
    );
    expect(
      mockProfileInlineNotificationsCTA.mock.calls.filter(
        ([props]) =>
          (props as { experimentVariant?: string }).experimentVariant ===
          'button'
      )
    ).toHaveLength(0);
  });

  it('keeps the ISR default variant when assignment resolution fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-compact-shell')).toHaveAttribute(
        'data-visitor-assignment-resolved',
        'true'
      );
    });
    expect(mockProfileInlineNotificationsCTA).toHaveBeenCalledWith(
      expect.objectContaining({ experimentVariant: 'button' })
    );
  });

  it('routes a cold-load alerts click to the capture flow under the assigned variant', async () => {
    let resolveAssignment:
      | ((value: { ok: boolean; json: () => Promise<unknown> }) => void)
      | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(resolve => {
            resolveAssignment = resolve;
          })
      )
    );

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    // Early click: the visitor lands on the subscribe tab before the
    // assignment resolves; the panel receives the unresolved flag so its
    // capture control stays inert.
    fireEvent.click(screen.getByTestId('profile-identity-get-updates'));

    await waitFor(() => {
      expect(mockProfilePrimaryTabPanel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'subscribe',
          visitorAssignmentResolved: false,
        })
      );
    });

    await act(async () => {
      resolveAssignment?.({
        ok: true,
        json: async () => ({ alertOptInVariant: 'toggle' }),
      });
    });

    await waitFor(() => {
      expect(mockProfilePrimaryTabPanel).toHaveBeenLastCalledWith(
        expect.objectContaining({
          mode: 'subscribe',
          visitorAssignmentResolved: true,
          alertOptInVariant: 'toggle',
        })
      );
    });
  });

  it('geo-sorts DSPs from the readable jv_country cookie after mount', async () => {
    document.cookie = 'jv_country=DE; path=/';

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
        expect.objectContaining({ viewerCountryCode: 'DE' })
      );
    });
  });

  it('prefers an explicit viewerCountryCode prop over the jv_country cookie', async () => {
    document.cookie = 'jv_country=DE; path=/';

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        viewerCountryCode='US'
      />
    );

    await waitFor(() => {
      expect(mockUseProfileShell).toHaveBeenLastCalledWith(
        expect.objectContaining({ viewerCountryCode: 'US' })
      );
    });
  });

  it('marks the Get Updates action subscribed for returning subscribers', async () => {
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

    // JOV-7123: no separate alerts card exists; subscribed visitors see the
    // identity header's Updates On state instead of a capture CTA.
    expect(screen.getByTestId('profile-identity-get-updates')).toHaveAttribute(
      'data-subscribed',
      'true'
    );
  });

  it('marks the Get Updates action subscribed after activation in the current session', async () => {
    mockProfileInlineNotificationsCTA.mockImplementation(
      (props: { readonly onSubscriptionActivated?: () => void }) => (
        <button
          type='button'
          data-testid='mock-inline-notifications-cta'
          onClick={() => props.onSubscriptionActivated?.()}
        >
          Inline notifications
        </button>
      )
    );

    const renderProfile = () => (
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const view = render(renderProfile());

    fireEvent.click(await screen.findByTestId('mock-inline-notifications-cta'));

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

    expect(screen.getByTestId('profile-identity-get-updates')).toHaveAttribute(
      'data-subscribed',
      'true'
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

    fireEvent.click(
      within(screen.getByTestId('profile-compact-surface')).getByRole(
        'button',
        { name: 'Music' }
      )
    );

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

    fireEvent.click(await screen.findByTestId('mock-inline-notifications-cta'));

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

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));

    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?mode=listen');

    pushStateSpy.mockRestore();
  });

  it('does not stack a playlist card under the featured editorial card', async () => {
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

    // JOV-7123: one card surface on home — the playlist fallback no longer
    // renders a second card under the editorial card.
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: /This Is Tim White/,
      })
    ).not.toBeInTheDocument();
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

    // The featured editorial card resolves the upcoming show as its subject;
    // nothing else stacks under it.
    expect(screen.getByTestId('profile-pac')).toHaveTextContent('The Ballroom');
    expect(screen.queryByTestId('profile-home-carousel')).toBeNull();
    expect(
      screen.queryByRole('link', {
        name: `Open This Is playlist for ${mockArtist.name}`,
      })
    ).not.toBeInTheDocument();
  });

  describe('contact query navigation', () => {
    afterEach(() => vi.restoreAllMocks());
    const profile = (mode: 'profile' | 'contact' = 'profile') => (
      <ProfileCompactTemplate
        mode={mode}
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
      />
    );
    const drawer = () => screen.getByTestId('mock-profile-unified-drawer');

    beforeEach(() => {
      mockClientNavigation.mockReturnValue(true);
      mockProfilePrimaryTabPanel.mockImplementation(
        (props: { readonly mode: string }) => (
          <div data-testid='mock-primary-tab-panel' data-mode={props.mode}>
            {props.mode === 'about' && (
              <AboutSection artist={mockArtist} contacts={mockContacts} />
            )}
          </div>
        )
      );
      mockProfileUnifiedDrawer.mockImplementation(
        (props: {
          readonly open: boolean;
          readonly view: string;
          readonly onOpenChange: (open: boolean) => void;
        }) => (
          <div
            data-testid='mock-profile-unified-drawer'
            data-open={String(props.open)}
            data-view={props.view}
          >
            <button type='button' onClick={() => props.onOpenChange(false)}>
              Close contact
            </button>
          </div>
        )
      );
    });

    it.each(['profile', 'contact'] as const)(
      'opens direct contact navigation with server mode %s',
      async mode => {
        window.history.replaceState(null, '', '/test-artist?mode=contact');
        render(profile(mode));
        await waitFor(() => {
          expect(drawer()).toHaveAttribute('data-open', 'true');
          expect(drawer()).toHaveAttribute('data-view', 'contact');
        });
      }
    );

    it('opens Contact from the real About action across repeated client transitions', async () => {
      window.history.replaceState(null, '', '/test-artist?mode=about');
      const view = render(profile());
      const pushState = vi.spyOn(window.history, 'pushState');

      for (let transition = 0; transition < 2; transition += 1) {
        await waitFor(() => {
          expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
            'data-mode',
            'about'
          );
        });
        fireEvent.click(screen.getByRole('link', { name: /Booking/ }));
        expect(window.location.search).toBe('?mode=contact');
        // Next publishes new search params without changing the cached server
        // mode prop or dispatching popstate. Keep this component mounted.
        view.rerender(profile());
        await waitFor(() => {
          expect(drawer()).toHaveAttribute('data-open', 'true');
          expect(drawer()).toHaveAttribute('data-view', 'contact');
        });
        expect(pushState).toHaveBeenCalledTimes(transition + 1);

        if (transition === 0) {
          window.history.replaceState(null, '', '/test-artist?mode=about');
          view.rerender(profile());
        }
      }
    });

    it('restores About and Contact with browser Back and Forward without extra entries', async () => {
      window.history.replaceState(null, '', '/test-artist?mode=about');
      const view = render(profile());
      const pushState = vi.spyOn(window.history, 'pushState');
      fireEvent.click(await screen.findByRole('link', { name: /Booking/ }));
      view.rerender(profile());
      await waitFor(() =>
        expect(drawer()).toHaveAttribute('data-view', 'contact')
      );

      act(() => window.history.back());
      await waitFor(() => {
        expect(window.location.search).toBe('?mode=about');
        expect(drawer()).toHaveAttribute('data-open', 'false');
        expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
          'data-mode',
          'about'
        );
      });
      act(() => window.history.forward());
      await waitFor(() => {
        expect(window.location.search).toBe('?mode=contact');
        expect(drawer()).toHaveAttribute('data-open', 'true');
        expect(drawer()).toHaveAttribute('data-view', 'contact');
      });
      expect(pushState).toHaveBeenCalledTimes(1);
    });

    it('stays closed when Next publishes query removal with a cached contact server mode', async () => {
      window.history.replaceState(null, '', '/test-artist?mode=contact');
      const view = render(profile('contact'));
      await waitFor(() =>
        expect(drawer()).toHaveAttribute('data-open', 'true')
      );
      fireEvent.click(screen.getByRole('button', { name: 'Close contact' }));
      await waitFor(() => expect(window.location.search).toBe(''));
      view.rerender(profile('contact'));
      await waitFor(() => {
        expect(drawer()).toHaveAttribute('data-open', 'false');
        expect(window.location.search).toBe('');
        expect(mockUseProfileShell).toHaveBeenLastCalledWith(
          expect.objectContaining({ modeOverride: 'profile' })
        );
      });
    });
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

  it('does not expose a loading status on the compact public profile', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(screen.getByTestId('profile-compact-shell')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // The desktop surface is SSR'd alongside the compact surface; CSS picks
    // the visible one per breakpoint so no loading interstitial exists.
    expect(
      screen.getByTestId('mock-profile-desktop-surface')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('profile-desktop-loading')).toBeNull();
  });

  it('switches the public profile to the desktop surface at 1180px+', async () => {
    const restoreViewport = mockViewport('desktop');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
        'data-layout',
        'desktop'
      );
      expect(mockProfileDesktopSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: mockArtist,
          activeMode: 'profile',
          presentation: 'modal',
        })
      );
    });

    restoreViewport();
  });

  it('forwards catalog load failure to the desktop surface', async () => {
    const restoreViewport = mockViewport('desktop');

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        catalogLoadFailed
      />
    );

    await waitFor(() => {
      expect(mockProfileDesktopSurface).toHaveBeenCalledWith(
        expect.objectContaining({
          catalogLoadFailed: true,
          activeMode: 'listen',
        })
      );
    });

    restoreViewport();
  });

  it('forwards catalog load failure to the compact Music panel', async () => {
    const restoreViewport = mockViewport('mobile');

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        catalogLoadFailed
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-primary-tab-panel')).toHaveAttribute(
        'data-catalog-load-failed',
        'true'
      );
    });

    restoreViewport();
  });

  it('publishes and removes the hydrated interaction-ready contract', () => {
    const html = renderToString(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );
    expect(html).not.toContain('data-interactive-ready="true"');
    // JOV-6452: cold desktop loads must paint the real desktop surface straight
    // from server markup — no "Loading profile…" interstitial between skeleton
    // and usable profile, and no mobile-shell-only first paint.
    expect(html).toContain('data-testid="mock-profile-desktop-surface"');
    expect(html).not.toContain('data-testid="profile-desktop-loading"');
    expect(html).not.toContain('Loading profile');
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('data-testid="profile-compact-shell"');
    const view = render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    const shell = screen.getByTestId('profile-compact-shell');
    expect(shell).toHaveAttribute('data-interactive-ready', 'true');

    view.unmount();
    expect(screen.queryByTestId('profile-compact-shell')).toBeNull();
  });

  it('keeps desktop variants on the desktop surface', async () => {
    const restoreViewport = mockViewport('desktop');

    const variantProps = {
      artist: mockArtist,
      socialLinks: [
        {
          id: 'venmo-1',
          artist_id: mockArtist.id,
          platform: 'venmo' as const,
          url: 'https://venmo.com/testartist',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      contacts: mockContacts,
      showPayButton: true,
      latestRelease: {
        title: "Don't Look Down",
        slug: 'dont-look-down',
        artworkUrl: 'https://example.com/release.jpg',
        releaseDate: '2026-04-01T00:00:00.000Z',
        releaseType: 'single' as const,
      },
      tourDates: [
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
          ticketStatus: 'onsale' as const,
          timezone: 'America/Los_Angeles',
          latitude: null,
          longitude: null,
          source: 'manual' as const,
          sourceEventId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      releases: mockReleases,
    };

    const view = render(
      <ProfileCompactTemplate mode='pay' {...variantProps} />
    );

    await waitFor(() => {
      expect(mockProfileDesktopSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeMode: 'pay' })
      );
    });

    view.rerender(
      <ProfileCompactTemplate mode='subscribe' {...variantProps} />
    );

    await waitFor(() => {
      expect(mockProfileDesktopSurface).toHaveBeenLastCalledWith(
        expect.objectContaining({ activeMode: 'subscribe' })
      );
    });

    restoreViewport();
  });

  it('keeps an explicit embedded preview compact at desktop widths', async () => {
    const restoreViewport = mockViewport('desktop');

    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        embeddedPreview
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
        'data-layout',
        'compact'
      );
      expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
        'data-profile-preview',
        'true'
      );
      expect(mockProfileDesktopSurface).not.toHaveBeenCalled();
    });

    restoreViewport();
  });

  describe('drawer view stability under data churn (JOV-4848)', () => {
    // Regression: the drawer open/close sync effect used to re-run whenever a
    // data-derived capability (hasContacts/hasTip/hasReleases) flipped, so a
    // background refetch that transiently emptied `contacts` closed the drawer
    // and the resolving refetch re-opened it — an intermittent close/reopen
    // cycle visible to the user. Drawer open state must be keyed to the
    // requested mode (stable intent), never to data object identity or
    // transient loading states.

    function renderContactDrawer(contacts: PublicContact[]) {
      return (
        <ProfileCompactTemplate
          mode='contact'
          artist={mockArtist}
          socialLinks={[]}
          contacts={contacts}
        />
      );
    }

    function drawerOpenHistory(): boolean[] {
      const history = mockProfileUnifiedDrawer.mock.calls.map(
        call => (call[0] as { readonly open: boolean }).open
      );
      // The compact drawer stays closed until hydration resolves the layout
      // (JOV-6452); the invariant is that it never closes again once open.
      const firstOpen = history.indexOf(true);
      return firstOpen === -1 ? history : history.slice(firstOpen);
    }

    it('keeps the drawer open across a refetch that transiently empties data', async () => {
      const { rerender } = render(renderContactDrawer(mockContacts));

      const drawer = () => screen.getByTestId('mock-profile-unified-drawer');
      await waitFor(() => {
        expect(drawer()).toHaveAttribute('data-open', 'true');
        expect(drawer()).toHaveAttribute('data-view', 'contact');
      });

      // Background refetch transiently returns empty data (loading state).
      rerender(renderContactDrawer([]));

      // Refetch resolves with new object identities for the same entity.
      rerender(renderContactDrawer(mockContacts.map(c => ({ ...c }))));

      await waitFor(() => {
        expect(drawer()).toHaveAttribute('data-open', 'true');
        expect(drawer()).toHaveAttribute('data-view', 'contact');
      });

      // No render may have observed a closed drawer — no close/reopen cycle.
      const history = drawerOpenHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history).not.toContain(false);
    });

    it('does not yank the in-drawer view back to the mode view when data churns', async () => {
      const { rerender } = render(renderContactDrawer(mockContacts));

      const drawer = () => screen.getByTestId('mock-profile-unified-drawer');
      await waitFor(() => {
        expect(drawer()).toHaveAttribute('data-view', 'contact');
      });

      // Visitor navigates inside the drawer to the root menu (a view with no
      // associated profile mode).
      fireEvent.click(screen.getByTestId('mock-profile-unified-drawer-menu'));
      await waitFor(() => {
        expect(drawer()).toHaveAttribute('data-view', 'menu');
      });

      // Data churn: refetch empties contacts, then resolves with fresh objects.
      rerender(renderContactDrawer([]));
      rerender(renderContactDrawer(mockContacts.map(c => ({ ...c }))));

      // The drawer stays open and the visitor's chosen view is preserved.
      expect(drawer()).toHaveAttribute('data-open', 'true');
      expect(drawer()).toHaveAttribute('data-view', 'menu');
      expect(drawerOpenHistory()).not.toContain(false);
    });
  });

  describe('hydration-safe profile mode sync', () => {
    // Bounded query modes now arrive from the private ISR renderer. The client
    // still needs this fallback for history-only changes and stale in-app RSC
    // payloads, while the first render must honor a server-supplied mode.

    it('opens an available pay drawer on the first render', () => {
      render(
        <ProfileCompactTemplate
          mode='pay'
          artist={mockArtist}
          socialLinks={[
            {
              id: 'venmo-1',
              artist_id: mockArtist.id,
              platform: 'venmo',
              url: 'https://venmo.com/testartist',
              clicks: 0,
              created_at: '2024-01-01T00:00:00.000Z',
            },
          ]}
          contacts={[]}
          showPayButton
        />
      );

      expect(mockProfileUnifiedDrawer).toHaveBeenLastCalledWith(
        expect.objectContaining({ open: true, view: 'pay' })
      );
      expect(mockUseProfileShell.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ modeOverride: 'pay' })
      );
    });

    it('starts ?mode=listen from the server mode, then syncs after hydration', async () => {
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

      const firstCallArgs = mockUseProfileShell.mock.calls[0]?.[0];
      expect(firstCallArgs).toMatchObject({ modeOverride: 'profile' });

      await waitFor(() => {
        expect(mockUseProfileShell).toHaveBeenLastCalledWith(
          expect.objectContaining({ modeOverride: 'listen' })
        );
      });
    });

    it('starts ?mode=subscribe from the server mode, then syncs after hydration', async () => {
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

      const firstCallArgs = mockUseProfileShell.mock.calls[0]?.[0];
      expect(firstCallArgs).toMatchObject({ modeOverride: 'profile' });

      await waitFor(() => {
        expect(mockUseProfileShell).toHaveBeenLastCalledWith(
          expect.objectContaining({ modeOverride: 'subscribe' })
        );
      });
    });

    it('starts on the server compact surface, then transfers desktop ownership after hydration', async () => {
      const restoreViewport = mockViewport('desktop');

      render(
        <ProfileCompactTemplate
          mode='profile'
          artist={mockArtist}
          socialLinks={[]}
          contacts={[]}
        />
      );

      const firstDrawerCall = mockProfileUnifiedDrawer.mock.calls[0]?.[0] as
        | { presentation?: string }
        | undefined;
      expect(firstDrawerCall?.presentation).toBe('standalone');

      await waitFor(() => {
        expect(
          screen.getByTestId('public-profile-layout-shell')
        ).toHaveAttribute('data-layout', 'desktop');
        expect(
          screen.getByTestId('public-profile-layout-shell')
        ).toHaveAttribute('data-desktop-ready', 'true');
        expect(screen.queryByTestId('profile-compact-shell')).toBeNull();
        expect(mockProfileDesktopSurface).toHaveBeenCalled();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(
          screen.getByRole('navigation', { name: 'Profile Navigation' })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Home' })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: 'Music' })
        ).toBeInTheDocument();
      });

      restoreViewport();
    });
  });

  describe('with the desktop surface flag off (shipped default)', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_FEATURE_PROFILE_DESKTOP_SURFACE', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('server-renders only the compact surface, with no desktop hand-off class', () => {
      const html = renderToString(
        <ProfileCompactTemplate
          mode='profile'
          artist={mockArtist}
          socialLinks={[]}
          contacts={[]}
          profileBanner={<div data-testid='mock-banner'>Banner</div>}
        />
      );

      expect(html).toContain('data-testid="profile-compact-shell"');
      expect(html).not.toContain('mock-profile-desktop-surface');
      expect(html).not.toContain('data-testid="profile-desktop-shell"');
      expect(html).not.toContain('data-testid="profile-desktop-banner"');
      expect(html).not.toContain('profile-viewport--desktop-surface');
      expect(html).toContain('data-layout="compact"');
      expect(mockProfileDesktopSurface).not.toHaveBeenCalled();
    });

    it('keeps desktop widths on the compact surface in the centered phone column', async () => {
      const restoreViewport = mockViewport('desktop');

      render(
        <ProfileCompactTemplate
          mode='profile'
          artist={mockArtist}
          socialLinks={[]}
          contacts={[]}
          profileBanner={<div data-testid='mock-banner'>Banner</div>}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-compact-shell')).toHaveAttribute(
          'data-interactive-ready',
          'true'
        );
      });

      const viewport = screen.getByTestId('public-profile-layout-shell');
      expect(viewport).toHaveAttribute('data-layout', 'compact');
      expect(viewport).not.toHaveAttribute('data-desktop-ready');
      expect(viewport).not.toHaveClass('profile-viewport--desktop-surface');
      // The compact shell keeps the centered phone-column contract
      // (max-width: --profile-shell-max-width, md:mx-auto card framing).
      const compactShell = screen.getByTestId('profile-compact-shell');
      expect(compactShell).toHaveClass('public-profile-compact-shell');
      expect(compactShell).toHaveClass('md:mx-auto');
      expect(screen.queryByTestId('profile-desktop-shell')).toBeNull();
      expect(mockProfileDesktopSurface).not.toHaveBeenCalled();
      // The banner stays inside the column instead of the desktop shell.
      expect(
        within(compactShell).getByTestId('profile-shell-banner')
      ).toHaveTextContent('Banner');
      // Drawers and sheets stay inside the column (embedded presentation),
      // never the viewport-wide desktop modal.
      const lastDrawerCall = mockProfileUnifiedDrawer.mock.calls.at(-1)?.[0] as
        | { presentation?: string }
        | undefined;
      expect(lastDrawerCall?.presentation).toBe('embedded');
      expect(
        screen.getByRole('navigation', { name: 'Profile Navigation' })
      ).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

      restoreViewport();
    });

    it('keeps mobile widths on the standalone compact presentation', async () => {
      const restoreViewport = mockViewport('mobile');

      render(
        <ProfileCompactTemplate
          mode='profile'
          artist={mockArtist}
          socialLinks={[]}
          contacts={[]}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('profile-compact-shell')).toHaveAttribute(
          'data-interactive-ready',
          'true'
        );
      });
      const lastDrawerCall = mockProfileUnifiedDrawer.mock.calls.at(-1)?.[0] as
        | { presentation?: string }
        | undefined;
      expect(lastDrawerCall?.presentation).toBe('standalone');
      expect(mockProfileDesktopSurface).not.toHaveBeenCalled();

      restoreViewport();
    });
  });

  it('forwards the proof-to-claim footer onto the public layout shell', () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        showClaimFooter
        claimFooterHref='/waitlist?campaign=proof-to-claim'
        claimFooterLabel='Request access'
        proofClaim
      />
    );

    const cta = screen.getByTestId('profile-claim-footer-cta');
    expect(cta).toHaveAttribute('href', '/waitlist?campaign=proof-to-claim');
    expect(cta).toHaveTextContent('Request access');
    expect(screen.queryByText(/unclaimed/i)).toBeNull();
  });

  it('routes selected credits into the About destination surfaces (JOV-6199)', () => {
    const creditSegments = [
      { type: 'text' as const, text: 'Credited on "' },
      {
        type: 'release' as const,
        text: 'Neon Circuit',
        href: '/timwhite/neon-circuit',
      },
      { type: 'text' as const, text: '".' },
    ];

    render(
      <ProfileCompactTemplate
        mode='about'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
        creditSegments={creditSegments}
      />
    );

    const panelCall = mockProfilePrimaryTabPanel.mock.calls.at(-1)?.[0] as
      | { creditSegments?: unknown }
      | undefined;
    expect(panelCall?.creditSegments).toBe(creditSegments);
    const drawerCall = mockProfileUnifiedDrawer.mock.calls.at(-1)?.[0] as
      | { creditSegments?: unknown }
      | undefined;
    expect(drawerCall?.creditSegments).toBe(creditSegments);
  });
});
