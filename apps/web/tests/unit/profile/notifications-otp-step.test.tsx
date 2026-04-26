import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const artist = {
  id: 'artist-1',
  handle: 'testartist',
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

function buildFormState() {
  return {
    emailInput: 'fan@example.com',
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
    handleSubscribe: vi.fn().mockResolvedValue('pending_confirmation'),
    handleVerifyOtp: vi.fn().mockResolvedValue('error'),
    handleResendOtp: vi.fn().mockResolvedValue(true),
    openSubscription: vi.fn(),
    hydrationStatus: 'done',
  };
}

describe('public profile notifications OTP step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileNotifications.mockReturnValue(buildProfileNotifications());
    mockUseSubscriptionForm.mockReturnValue(buildFormState());
  });

  it('renders OTP verification UI in ArtistNotificationsCTA after the alerts and email steps', async () => {
    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    render(<ArtistNotificationsCTA artist={artist} autoOpen />);

    fireEvent.click(await screen.findByRole('switch', { name: /new music/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter the code')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /^verify$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-mobile-notifications-step-otp')
    ).toBeInTheDocument();
  });

  it('renders OTP verification UI in TwoStepNotificationsCTA after the alerts and email steps', async () => {
    const { TwoStepNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA'
    );

    render(<TwoStepNotificationsCTA artist={artist} startExpanded />);

    fireEvent.click(await screen.findByRole('switch', { name: /new music/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(screen.getByText('Enter the code')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('button', { name: /^verify$/i })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('profile-mobile-notifications-step-otp')
    ).toBeInTheDocument();
  });
});
