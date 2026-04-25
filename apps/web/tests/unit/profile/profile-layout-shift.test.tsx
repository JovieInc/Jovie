import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();
const mockUseProfileNotifications = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({ user: null }),
}));

vi.mock('motion/react', async () => {
  await import('react');

  return {
    AnimatePresence: ({ children }: { readonly children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
        <div {...props}>{children}</div>
      ),
    },
    useReducedMotion: () => true,
  };
});

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    useProfileNotifications: (...args: unknown[]) =>
      mockUseProfileNotifications(...args),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberNameMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
  useUpdateSubscriberBirthdayMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
  useUpdateContentPreferencesMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  }),
}));

const artist: Artist = {
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
} as Artist;

function buildProfileNotifications(
  overrides: Partial<ProfileNotificationsContextValue> = {}
): ProfileNotificationsContextValue {
  return {
    state: 'idle',
    setState: vi.fn(),
    hydrationStatus: 'done',
    hasStoredContacts: false,
    notificationsEnabled: true,
    channel: 'email',
    setChannel: vi.fn(),
    subscribedChannels: {},
    setSubscribedChannels: vi.fn(),
    subscriptionDetails: { email: 'fan@example.com' },
    setSubscriptionDetails: vi.fn(),
    contentPreferences: {
      newMusic: true,
      tourDates: true,
      merch: true,
      general: true,
    },
    artistEmail: {
      optedIn: false,
      pendingProvider: false,
      visibleToArtist: false,
    },
    openSubscription: vi.fn(),
    registerInputFocus: vi.fn(),
    smsEnabled: false,
    ...overrides,
  };
}

function buildFormState(overrides: Record<string, unknown> = {}) {
  return {
    emailInput: '',
    error: null,
    otpCode: '',
    isSubmitting: false,
    resendCooldownEnd: 0,
    isResending: false,
    notificationsState: 'idle',
    notificationsEnabled: true,
    subscribedChannels: {},
    handleChannelChange: vi.fn(),
    handleEmailChange: vi.fn(),
    handleOtpChange: vi.fn(),
    handleSubscribe: vi.fn().mockResolvedValue('error'),
    handleVerifyOtp: vi.fn().mockResolvedValue('error'),
    handleResendOtp: vi.fn().mockResolvedValue(true),
    openSubscription: vi.fn(),
    hydrationStatus: 'done',
    ...overrides,
  };
}

describe('notification flow shell sizing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileNotifications.mockReturnValue(buildProfileNotifications());
  });

  it('ArtistNotificationsCTA suppresses inline hydration chrome', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ hydrationStatus: 'checking' })
    );

    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    const { container } = render(
      <ArtistNotificationsCTA artist={artist} autoOpen />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('ArtistNotificationsCTA uses the full-height inline flow shell when expanded', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    render(<ArtistNotificationsCTA artist={artist} autoOpen />);

    const shell = await screen.findByTestId(
      'profile-mobile-notifications-flow'
    );
    expect(shell.className).toContain('min-h-[640px]');
  });

  it('ProfileInlineNotificationsCTA reuses the same full-height inline shell', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(
      <ProfileInlineNotificationsCTA artist={artist} presentation='inline' />
    );

    const shell = await screen.findByTestId(
      'profile-mobile-notifications-flow'
    );
    expect(shell.className).toContain('min-h-[640px]');
  });
});
