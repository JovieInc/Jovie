import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryCTA } from '@/features/profile/ProfilePrimaryCTA';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('next/dynamic', () => ({
  default: (
    _loader: unknown,
    options?: { loading?: () => React.ReactNode }
  ) => {
    const Loading = options?.loading;
    return function DynamicComponent() {
      return Loading ? Loading() : null;
    };
  },
}));

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

describe('ProfilePrimaryCTA loading fallback', () => {
  it('renders the subscription skeleton while dynamic CTA loads', () => {
    render(
      <ProfilePrimaryCTA
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        showCapture
      />
    );

    expect(screen.getByText('Loading subscription form')).toBeInTheDocument();
  });
});
