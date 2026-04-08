import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { Artist } from '@/types/db';

const mockCanonicalProfileDSPs = vi.fn(() => []);
const mockUseProfileShell = vi.fn();

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
  useProfileShell: (...args: unknown[]) => mockUseProfileShell(...args),
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

describe('ProfileCompactTemplate', () => {
  beforeEach(() => {
    mockCanonicalProfileDSPs.mockReturnValue([]);
    mockUseProfileShell.mockReset();
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

  it('does not push an intermediate profile URL when deep-linked into a mode', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);
    window.history.replaceState(null, '', '/test-artist?mode=listen');
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

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

    expect(window.location.search).toBe('?mode=listen');
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(mockUseProfileShell).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modeOverride: 'listen',
      })
    );

    pushStateSpy.mockRestore();
  });

  it('uses the mode prop as the fallback when the URL has no mode param', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

    const { ProfileCompactTemplate } = await import(
      '@/features/profile/templates/ProfileCompactTemplate'
    );

    render(
      <ProfileCompactTemplate
        mode='listen'
        artist={mockArtist}
        socialLinks={[]}
        contacts={[]}
      />
    );

    expect(mockUseProfileShell).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modeOverride: 'listen',
      })
    );
  });

  it('keeps modeOverride in sync when user interactions open a mode drawer', async () => {
    mockCanonicalProfileDSPs.mockReturnValue([{ platform: 'spotify' }]);

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
});
