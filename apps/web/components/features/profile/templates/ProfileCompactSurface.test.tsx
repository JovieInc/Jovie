import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ProfileCompactSurface } from './ProfileCompactSurface';

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

vi.mock('next/dynamic', () => ({
  default: () => () => null,
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
  ProfileHomeRail: () => <div data-testid='mock-profile-home-rail' />,
}));

vi.mock('@/features/profile/ProfilePrimaryTabPanel', () => ({
  ProfilePrimaryTabPanel: ({ mode }: { readonly mode: string }) => (
    <div data-testid={`mock-primary-tab-panel-${mode}`} />
  ),
}));

vi.mock('@/features/profile/nav/BottomTabBar', () => ({
  BottomTabBar: () => null,
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
} satisfies LegacySocialLink;

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
  it('renders registry-cased hero social aria labels for TikTok', () => {
    renderSurface({ socialLinks: [tiktokLink] });

    const socialRow = screen.getByTestId('profile-hero-social-row');
    expect(
      within(socialRow).getByRole('link', {
        name: 'Follow Tim White on TikTok',
      })
    ).toHaveAttribute('href', 'https://www.tiktok.com/@timwhite');
    expect(
      within(socialRow).queryByRole('link', {
        name: 'Follow Tim White on Tiktok',
      })
    ).toBeNull();
  });
});
