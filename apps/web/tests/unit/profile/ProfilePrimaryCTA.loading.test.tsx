import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    useProfileNotifications: () => ({
      state: 'idle',
      setState: vi.fn(),
      hydrationStatus: 'idle',
      hasStoredContacts: false,
      notificationsEnabled: true,
      channel: 'email',
      setChannel: vi.fn(),
      subscribedChannels: { email: false, sms: false },
      setSubscribedChannels: vi.fn(),
      subscriptionDetails: { email: '' },
      setSubscriptionDetails: vi.fn(),
      openSubscription: vi.fn(),
      registerInputFocus: vi.fn(),
    }),
  })
);

vi.mock('@/components/organisms/profile-shell', () => ({
  useProfileNotifications: () => ({
    state: 'idle',
    setState: vi.fn(),
    hydrationStatus: 'idle',
    hasStoredContacts: false,
    notificationsEnabled: true,
    channel: 'email',
    setChannel: vi.fn(),
    subscribedChannels: { email: false, sms: false },
    setSubscribedChannels: vi.fn(),
    subscriptionDetails: { email: '' },
    setSubscriptionDetails: vi.fn(),
    openSubscription: vi.fn(),
    registerInputFocus: vi.fn(),
  }),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => (
      <div data-testid='artist-notifications-cta'>ArtistNotificationsCTA</div>
    ),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: () => (
      <div data-testid='two-step-notifications-cta'>
        TwoStepNotificationsCTA
      </div>
    ),
  })
);

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'testartist',
    spotify_id: 'spotify-1',
    name: 'Test Artist',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProfilePrimaryCTA notifications branch', () => {
  // Previously this test asserted the `SubscriptionFormSkeleton` "Loading
  // subscription form" copy because `ArtistNotificationsCTA` was dynamically
  // imported with `ssr: false` and the test mocked `next/dynamic` to surface
  // the loading fallback. After JOV-2273 the dynamic import was removed —
  // the CTA renders synchronously without an SSR bailout — so the loading
  // fallback no longer appears in the first render and the assertion has
  // been updated to verify the CTA renders directly instead.
  it('renders the ArtistNotificationsCTA when capture is enabled', () => {
    render(
      <ProfilePrimaryCTA
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        showCapture
      />
    );

    expect(screen.getByTestId('artist-notifications-cta')).toBeInTheDocument();
  });
});
