import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const mockUseProfileNotifications = vi.fn();
const mockUseSubscriptionForm = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();
const mockUpdateContentPreferencesMutation = vi.fn();

let ArtistNotificationsCTA: typeof import('@/features/profile/artist-notifications-cta/ArtistNotificationsCTA').ArtistNotificationsCTA;

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    useProfileNotifications: (...args: unknown[]) =>
      mockUseProfileNotifications(...args),
  })
);

vi.mock('@/features/auth/atoms/otp-input', () => ({
  OtpInput: ({
    value,
    onChange,
    'aria-label': ariaLabel,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly 'aria-label': string;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  ),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({
    user: null,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateContentPreferencesMutation: () =>
    mockUpdateContentPreferencesMutation(),
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
  useUpdateSubscriberNameMutation: () => mockUpdateSubscriberNameMutation(),
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
    useReducedMotion: () => false,
  };
});

const artist = {
  id: 'artist-1',
  handle: 'testartist',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date().toISOString(),
  settings: null,
  theme: null,
} as Artist;

function buildProfileNotifications(overrides: Record<string, unknown> = {}) {
  return {
    contentPreferences: {
      newMusic: true,
      tourDates: false,
      merch: true,
      general: true,
    },
    artistEmail: {
      optedIn: false,
      pendingProvider: false,
      visibleToArtist: false,
    },
    subscriptionDetails: {},
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
    handleSubscribe: vi.fn().mockResolvedValue(undefined),
    handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
    handleResendOtp: vi.fn().mockResolvedValue(undefined),
    openSubscription: vi.fn(),
    hydrationStatus: 'done' as const,
    ...overrides,
  };
}

async function renderCTA(props: Record<string, unknown> = {}) {
  return render(<ArtistNotificationsCTA artist={artist} autoOpen {...props} />);
}

describe('ArtistNotificationsCTA SMS manage flow', () => {
  beforeAll(async () => {
    ({ ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    ));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileNotifications.mockReturnValue(buildProfileNotifications());
    mockUseSubscriptionForm.mockReturnValue(buildFormState());
    mockUpdateSubscriberNameMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdateSubscriberBirthdayMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdateContentPreferencesMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('removes the retired inline phone composer from the auto-open flow', async () => {
    await renderCTA();

    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.queryByTestId('country-selector')).not.toBeInTheDocument();
    expect(screen.queryByText('Stay in the Loop')).not.toBeInTheDocument();
  });

  it('keeps SMS subscribers on Jovie-only alert preferences', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUpdateContentPreferencesMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    mockUseProfileNotifications.mockReturnValue(
      buildProfileNotifications({
        subscriptionDetails: { sms: '+15551234567' },
      })
    );
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        subscribedChannels: { sms: true },
      })
    );

    await renderCTA();

    expect(await screen.findByText('Sent from Jovie')).toBeInTheDocument();
    expect(screen.queryByText('Sent by Test Artist')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save & Finish' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        artistId: 'artist-1',
        email: undefined,
        phone: '+15551234567',
        preferences: {
          newMusic: true,
          tourDates: false,
          merch: true,
        },
        artistEmailOptIn: undefined,
      });
    });
  });
});
