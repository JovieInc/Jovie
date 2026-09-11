import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Artist, LegacySocialLink } from '@/types/db';
import { ProfileCompactSurface } from './ProfileCompactSurface';

vi.mock('next/dynamic', () => ({
  default: () => () => null,
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

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: () => null,
    isEnabled: false,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  page: vi.fn(),
  track: vi.fn(),
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

const tiktokLink = {
  id: 'tt-1',
  artist_id: artist.id,
  platform: 'tiktok',
  url: 'https://www.tiktok.com/@timwhite',
  clicks: 0,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies LegacySocialLink;

describe('ProfileCompactSurface', () => {
  it('renders the compact surface shell and hero identity', () => {
    render(
      <ProfileCompactSurface
        artist={artist}
        socialLinks={[]}
        contacts={[]}
        drawerOpen={false}
        drawerView='menu'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onBack={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onShare={vi.fn()}
        profileHref='/timwhite'
      />
    );

    expect(screen.getByTestId('profile-compact-surface')).toBeInTheDocument();
    expect(screen.getByTestId('profile-cover')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('profile-hero-identity-block')).getByText(
        'Tim White'
      )
    ).toBeInTheDocument();
    // No social links -> the hero social row is not rendered at all.
    expect(
      screen.queryByTestId('profile-hero-social-row')
    ).not.toBeInTheDocument();
  });

  // Regression: hero social labels must use registry brand casing
  // (tiktok -> 'TikTok'), not naive title case ('Tiktok').
  it('renders registry-cased hero social aria labels for TikTok', () => {
    render(
      <ProfileCompactSurface
        artist={artist}
        socialLinks={[tiktokLink]}
        contacts={[]}
        drawerOpen={false}
        drawerView='menu'
        onDrawerOpenChange={vi.fn()}
        onDrawerViewChange={vi.fn()}
        onBack={vi.fn()}
        onOpenMenu={vi.fn()}
        onPlayClick={vi.fn()}
        onShare={vi.fn()}
        profileHref='/timwhite'
      />
    );

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
