import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const mockUseProfileNotifications = vi.fn();
const mockUseSubscriptionForm = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();
const mockUpdateContentPreferencesMutation = vi.fn();

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

vi.mock('motion/react', async importOriginal => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
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
      tourDates: true,
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
  const { ArtistNotificationsCTA } = await import(
    '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
  );
  return render(<ArtistNotificationsCTA artist={artist} autoOpen {...props} />);
}

describe('ArtistNotificationsCTA full-screen alert flow states', () => {
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

  it('renders nothing during hydration status checks to avoid SSR mismatch', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ hydrationStatus: 'checking' })
    );

    const { container } = await renderCTA();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not render the retired fallback CTA when notifications are disabled', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ notificationsEnabled: false })
    );

    await renderCTA();

    expect(screen.queryByText('Listen Now')).not.toBeInTheDocument();
    expect(screen.queryByText('Stay in the Loop')).not.toBeInTheDocument();
  });

  it('opens directly to manage alerts with toggles off for unsubscribed fans', async () => {
    await renderCTA();

    expect(await screen.findByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('Sent from Jovie')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'New Music' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Shows' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Merch' })).not.toBeChecked();
  });

  it('prompts for email only after an unsubscribed fan toggles an alert', async () => {
    const handleSubscribe = vi.fn().mockResolvedValue('pending_confirmation');
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        emailInput: 'fan@example.com',
        handleSubscribe,
      })
    );

    await renderCTA();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'New Music' }));

    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-email-input')).toHaveAttribute(
      'type',
      'email'
    );

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(handleSubscribe).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Enter the code')).toBeInTheDocument();
  });

  it('shows email validation errors inside the full-screen email step', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        error: 'Please enter a valid email address',
      })
    );

    await renderCTA();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'New Music' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address'
    );
  });

  it('verifies OTP from the full-screen OTP step', async () => {
    const handleSubscribe = vi.fn().mockResolvedValue('pending_confirmation');
    const handleVerifyOtp = vi.fn().mockResolvedValue('subscribed');
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        emailInput: 'fan@example.com',
        otpCode: '123456',
        handleSubscribe,
        handleVerifyOtp,
      })
    );

    await renderCTA();

    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: 'New Music' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('Enter the code');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => {
      expect(handleVerifyOtp).toHaveBeenCalledTimes(1);
    });
  });
});
