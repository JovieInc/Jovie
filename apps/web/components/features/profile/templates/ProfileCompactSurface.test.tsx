import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { DynamicOptions } from 'next/dist/shared/lib/app-dynamic';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';
import { ProfileCompactSurface } from './ProfileCompactSurface';
import { PublicProfileLayoutShell } from './PublicProfileLayoutShell';

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

const lazyOverlays = vi.hoisted(() => ({
  pending: new Map<
    string,
    {
      promise: Promise<{ default: React.ComponentType }>;
      resolve: (value: { default: React.ComponentType }) => void;
    }
  >(),
}));

// Execute the App Router's actual lazy/Suspense implementation. Only module
// arrival is controlled; preserve each source call's loading/SSR options.
vi.mock('next/dynamic', async () => {
  const { default: appDynamic } = await vi.importActual<
    typeof import('next/dist/shared/lib/app-dynamic')
  >('next/dist/shared/lib/app-dynamic');
  return {
    default: (loader: () => Promise<unknown>, options?: DynamicOptions) => {
      const kind = String(loader).includes('ProfileUnifiedDrawer')
        ? 'drawer'
        : 'notifications';
      return appDynamic(
        () =>
          lazyOverlays.pending.get(kind)?.promise ??
          Promise.resolve({ default: () => null }),
        options
      );
    },
  };
});

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

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: null,
    isEnabled: false,
  }),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA',
  () => ({
    ProfileInlineNotificationsCTA: () => null,
  })
);

vi.mock('@/features/profile/ProfileHomeRail', () => ({
  ProfileHomeRail: ({
    featuredAccent,
  }: {
    readonly featuredAccent?: { accent: string; strength: string };
  }) => (
    <div
      data-testid='mock-profile-home-rail'
      data-featured-accent={featuredAccent?.accent}
      data-featured-strength={featuredAccent?.strength}
    />
  ),
}));

vi.mock('@/features/profile/ProfilePrimaryTabPanel', () => ({
  ProfilePrimaryTabPanel: ({
    mode,
    catalogLoadFailed,
    visitorAssignmentResolved,
    creditSegments,
    contacts,
    modeCardAccents,
  }: {
    readonly mode: string;
    readonly catalogLoadFailed?: boolean;
    readonly visitorAssignmentResolved?: boolean;
    readonly creditSegments?: readonly { readonly type: string }[];
    readonly contacts?: readonly { readonly id: string }[];
    readonly modeCardAccents?: Record<string, { accent: string }>;
  }) => (
    <div
      data-testid={`mock-primary-tab-panel-${mode}`}
      data-catalog-load-failed={catalogLoadFailed ? 'true' : 'false'}
      data-visitor-assignment-resolved={
        visitorAssignmentResolved === false ? 'false' : 'true'
      }
      data-credit-segments={(creditSegments ?? [])
        .map(segment => segment.type)
        .join('|')}
      data-contacts={(contacts ?? []).map(contact => contact.id).join('|')}
      data-accents={
        modeCardAccents
          ? ['listen', 'events', 'payments', 'stay-close']
              .map(kind => modeCardAccents[kind]?.accent)
              .join(',')
          : undefined
      }
    />
  ),
}));

vi.mock('@/features/profile/nav/BottomTabBar', () => ({
  BottomTabBar: ({ aboveNav }: { readonly aboveNav?: React.ReactNode }) => (
    <div data-testid='profile-tab-bar'>
      {aboveNav}
      <nav data-testid='profile-bottom-nav' aria-label='Profile Navigation' />
    </div>
  ),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/dsp', () => ({
  sortDSPsByGeoPopularity: (value: unknown) => value,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [],
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

const tiktokLink = {
  id: 'tt-1',
  artist_id: artist.id,
  platform: 'tiktok',
  url: 'https://www.tiktok.com/@timwhite',
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
};

function renderSurface(
  overrides: Partial<React.ComponentProps<typeof ProfileCompactSurface>> = {}
) {
  return render(
    <ProfileCompactSurface
      artist={artist}
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
      profileHref='/timwhite'
      renderInteractiveOverlays={false}
      {...overrides}
    />
  );
}

describe('ProfileCompactSurface', () => {
  beforeEach(() => {
    mockUseIsAuthenticated.mockReturnValue(false);
  });

  it.each(['drawer', 'notifications'])(
    'keeps the mounted profile and focused claim available while the %s module loads',
    async kind => {
      let releaseModule!: (value: { default: React.ComponentType }) => void;
      const promise = new Promise<{ default: React.ComponentType }>(resolve => {
        releaseModule = resolve;
      });
      lazyOverlays.pending.set(kind, { promise, resolve: releaseModule });
      const Overlay = () => <button type='button'>{kind} ready</button>;
      const profile = (ready: boolean) => (
        <React.Suspense fallback={<div role='status'>Loading profile</div>}>
          <PublicProfileLayoutShell
            artistName={artist.name}
            heroImageUrl={null}
            heroImageError={false}
            isDesktopLayout={false}
            shouldRenderHeading={false}
            profileAccentStyle={{}}
            compactSurface={
              <ProfileCompactSurface
                artist={artist}
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
                profileHref='/timwhite'
                proofClaimCta={{ href: '/start', label: 'Claim yours' }}
                renderInteractiveOverlays={kind === 'drawer' ? ready : true}
                visitorAssignmentResolved={
                  kind === 'notifications' ? ready : false
                }
              />
            }
          />
        </React.Suspense>
      );
      const view = render(profile(false));
      // The already-present closed drawer may resolve before the per-visitor
      // assignment enables the separate notifications module.
      await act(async () => {});
      const heading = screen.getByRole('heading', { name: artist.name });
      const claim = screen.getByRole('link', { name: /Claim yours/ });
      const dock = screen.getByTestId('profile-tab-bar');
      claim.focus();
      expect(claim).toHaveFocus();
      view.rerender(profile(true));
      try {
        expect(heading).toBeVisible();
        expect(claim).toBeVisible();
        expect(dock).toBeVisible();
        expect(claim).toHaveFocus();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      } finally {
        await act(async () => releaseModule({ default: Overlay }));
        lazyOverlays.pending.delete(kind);
      }
      expect(
        screen.getByRole('button', { name: `${kind} ready` })
      ).toBeVisible();
      expect(screen.getByRole('heading', { name: artist.name })).toBe(heading);
      expect(screen.getByRole('link', { name: /Claim yours/ })).toBe(claim);
      expect(claim).toHaveFocus();
    }
  );

  it('renders the floating bottom tab bar on the interactive profile', () => {
    renderSurface();

    expect(screen.getByTestId('profile-bottom-nav')).toBeTruthy();
  });

  it('shows the phone claim bar above the dock on proof profiles (JOV-7114)', () => {
    renderSurface({ proofClaimCta: { href: '/start', label: 'Claim yours' } });

    const bar = screen.getByTestId('profile-proof-claim-bar');
    expect(bar).toHaveClass('md:hidden');
    expect(screen.getByTestId('profile-proof-claim-bar-cta')).toHaveAttribute(
      'href',
      '/start'
    );
    // Rides inside the dock, directly above the nav, so it moves with it.
    expect(bar.nextElementSibling).toBe(
      screen.getByTestId('profile-bottom-nav')
    );
  });

  it('omits the claim bar on regular profiles', () => {
    renderSurface();

    expect(screen.queryByTestId('profile-proof-claim-bar')).toBeNull();
  });

  it('hides the bottom tab bar in static previews so it cannot cover clipped content (JOV-7192)', () => {
    renderSurface({ renderMode: 'preview', presentation: 'embedded' });

    expect(screen.queryByTestId('profile-bottom-nav')).toBeNull();
  });

  it('uses pearlQuiet top chrome without IconButton restyle classes', () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    renderSurface({ allowSignedInEscape: true });

    const back = screen.getByRole('button', { name: 'Back' });
    const menu = screen.getByRole('button', { name: 'Menu' });

    expect(back).not.toHaveClass('profile-top-chrome-icon');
    expect(menu).not.toHaveClass('profile-top-chrome-icon');
    expect(back).toHaveClass('bg-transparent', 'text-primary-token/78');
    expect(menu).toHaveClass('bg-transparent', 'text-primary-token/78');
  });

  it('shows the back control on the public profile root for a signed-in session', () => {
    mockUseIsAuthenticated.mockReturnValue(true);
    const onBack = vi.fn();

    renderSurface({ onBack, allowSignedInEscape: true });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the back control on the public profile root first landing for logged-out visitors', () => {
    renderSurface();

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('keeps the signed-in back control subject to hideBackButton', () => {
    mockUseIsAuthenticated.mockReturnValue(true);

    renderSurface({ hideBackButton: true, allowSignedInEscape: true });

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });

  it('does not treat embedded marketing previews as signed-in live profiles', () => {
    mockUseIsAuthenticated.mockReturnValue(true);

    renderSurface({ presentation: 'embedded' });

    expect(
      screen.queryByRole('button', { name: 'Back' })
    ).not.toBeInTheDocument();
  });
  // Regression: hero social labels must use registry brand casing
  // (tiktok -> 'TikTok'), not naive title case ('Tiktok').
  it('forwards catalog load failure into the Music panel instead of an empty catalog', () => {
    renderSurface({
      activeMode: 'listen',
      catalogLoadFailed: true,
      releases: [],
    });

    expect(screen.getByTestId('mock-primary-tab-panel-listen')).toHaveAttribute(
      'data-catalog-load-failed',
      'true'
    );
  });

  // JOV-6453: the subscribe CTA must stay a skeleton until the per-user
  // experiment assignment resolves, so the flag is forwarded verbatim.
  it('forwards an unresolved visitor assignment into the subscribe panel', () => {
    renderSurface({
      activeMode: 'subscribe',
      visitorAssignmentResolved: false,
    });

    expect(
      screen.getByTestId('mock-primary-tab-panel-subscribe')
    ).toHaveAttribute('data-visitor-assignment-resolved', 'false');
  });

  it('defaults to a resolved visitor assignment for surfaces without bootstrap', () => {
    renderSurface({ activeMode: 'subscribe' });

    expect(
      screen.getByTestId('mock-primary-tab-panel-subscribe')
    ).toHaveAttribute('data-visitor-assignment-resolved', 'true');
  });

  it('routes selected credits into the About panel (JOV-6199)', () => {
    renderSurface({
      activeMode: 'about',
      creditSegments: [
        { type: 'text', text: 'Credited on "' },
        {
          type: 'release',
          text: 'Neon Circuit',
          href: '/timwhite/neon-circuit',
        },
        { type: 'text', text: '".' },
      ],
    });

    const panel = screen.getByTestId('mock-primary-tab-panel-about');
    expect(panel).toHaveAttribute('data-credit-segments', 'text|release|text');
  });

  it('renders registry-cased hero social aria labels for TikTok', () => {
    renderSurface({ socialLinks: [tiktokLink] });

    // Scoped via role+name: the hero social row is the only place rendering
    // this aria label, so screen-level queries are unambiguous here.
    expect(
      screen.getByRole('link', { name: 'Follow Tim White on TikTok' })
    ).toHaveAttribute('href', 'https://www.tiktok.com/@timwhite');
    expect(
      screen.queryByRole('link', { name: 'Follow Tim White on Tiktok' })
    ).toBeNull();
  });

  // JOV-6198/JOV-7123: fan-capture gates the Get Updates action on the
  // identity header — there is no separate alerts card on the home surface.
  it('hides the home Get Updates action when fan capture is disabled', () => {
    renderSurface({ allowFanCapture: false });

    expect(
      screen.queryByTestId('profile-identity-get-updates')
    ).not.toBeInTheDocument();
  });

  it('shows the home Get Updates action when fan capture is enabled', () => {
    renderSurface({ allowFanCapture: true });

    expect(
      screen.getByTestId('profile-identity-get-updates')
    ).toBeInTheDocument();
  });

  it('leads the identity header with Get Updates and opens the subscribe flow', () => {
    const onModeSelect = vi.fn();
    renderSurface({
      allowFanCapture: true,
      renderMode: 'interactive',
      onModeSelect,
    });

    const identity = screen.getByTestId('profile-identity-header');
    expect(
      within(identity).queryByTestId('profile-identity-listen')
    ).toBeNull();
    fireEvent.click(
      within(identity).getByRole('button', { name: 'Get Updates' })
    );
    expect(onModeSelect).toHaveBeenCalledWith('subscribe');
  });

  it('reads Updates On for a subscribed viewer', () => {
    renderSurface({ allowFanCapture: true, isSubscribed: true });

    expect(screen.getByRole('button', { name: 'Updates On' })).toHaveAttribute(
      'data-subscribed',
      'true'
    );
  });

  it('marks only the active public home surface for mobile overflow scoping', () => {
    const { unmount } = renderSurface();
    const homeSurface = screen.getByTestId('profile-compact-surface');

    expect(homeSurface.parentElement).toHaveAttribute(
      'data-profile-home-mode',
      'true'
    );
    expect(homeSurface).not.toHaveAttribute('data-profile-overflow-mode');

    unmount();
    renderSurface({ activeMode: 'listen' });
    const listenSurface = screen.getByTestId('profile-compact-surface');

    expect(listenSurface.parentElement).not.toHaveAttribute(
      'data-profile-home-mode'
    );
    expect(listenSurface).not.toHaveAttribute('data-profile-overflow-mode');
  });

  it('bleeds the Music scrollport to the shell edge and locks horizontal panning', () => {
    renderSurface({ activeMode: 'listen' });

    const scrollRegion = screen.getByTestId('profile-content-scroll');
    expect(scrollRegion.className).toContain('-mx-(--page-pad)');
    expect(scrollRegion.className).toContain('px-(--page-pad)');
    expect(scrollRegion.className).toContain('overflow-x-clip');
    expect(scrollRegion.className).toContain('touch-pan-y');
    expect(scrollRegion.className).toContain('overflow-y-auto');
  });

  it('keeps the chrome, identity header, and content regions in the responsive layout contract', () => {
    renderSurface();

    // Floating chrome over the identity header; the header scrolls with
    // the content instead of occupying a fixed hero band.
    expect(screen.getByTestId('profile-cover')).toHaveClass(
      'pointer-events-none',
      'absolute',
      'inset-x-0',
      'top-0'
    );
    const scroll = screen.getByTestId('profile-content-scroll');
    expect(
      within(scroll).getByTestId('profile-identity-header')
    ).toBeInTheDocument();
    expect(screen.getByTestId('profile-content-scroll')).toHaveClass(
      'profile-home-content-scroll',
      'min-h-0',
      'flex-1',
      'flex',
      'flex-col',
      'overflow-y-auto',
      'overscroll-contain',
      // JOV-7412: md+ the document scrolls, so the pane must chain overscroll
      // to the page instead of trapping the wheel at its own edges.
      'md:overscroll-auto'
    );
  });

  it('anchors the mode-card accents on the featured artwork, matching the Pen', () => {
    renderSurface({
      latestRelease: {
        title: 'Never Say A Word',
        slug: 'never-say-a-word',
        artworkUrl: '/art.jpg',
        releaseDate: '2026-08-01T00:00:00.000Z',
        releaseType: 'single',
      },
    });

    const rail = screen.getByTestId('mock-profile-home-rail');
    expect(rail).toHaveAttribute('data-featured-accent', 'ultra');
    expect(rail).toHaveAttribute('data-featured-strength', 'art');
  });

  it('rotates positionally and mounts the About panel without a payments card', () => {
    // JOV-7810: the pay surface lives on the pay intent URL, not the About tab.
    renderSurface({
      activeMode: 'about',
      socialLinks: [
        {
          id: 'venmo-1',
          artist_id: artist.id,
          platform: 'venmo',
          url: 'https://venmo.com/u/timwhite',
          clicks: 0,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const panel = screen.getByTestId('mock-primary-tab-panel-about');
    // No release art and no photo: no image anchor, plain visual order.
    expect(panel).toHaveAttribute('data-accents', 'ion,ultra,pulse,orange');
    expect(screen.queryByTestId('profile-payments-card')).toBeNull();
  });

  it('forwards the release credits opener to the overflow menu drawer', () => {
    const source = readFileSync(
      resolve(__dirname, './ProfileCompactSurface.tsx'),
      'utf8'
    );
    expect(source).toContain('onOpenReleaseCredits={onOpenReleaseCredits}');
  });
});
