import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { Artist } from '@/types/db';

vi.mock('next/dynamic', () => ({
  default: () => () => null,
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

vi.mock('@/components/organisms/profile-shell', () => ({
  ProfileNotificationsContext: React.createContext(null),
  useProfileShell: () => ({
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
  }),
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: null,
    isEnabled: false,
  }),
}));

vi.mock('@/lib/queries', () => ({
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
  sortDSPsByGeoPopularity: () => [],
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [],
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

describe('ProfileCompactTemplate', () => {
  it('links the top-left Jovie mark to the artist profiles landing page', async () => {
    const { ProfileCompactTemplate } = await import(
      '@/features/profile/templates/ProfileCompactTemplate'
    );

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
});
