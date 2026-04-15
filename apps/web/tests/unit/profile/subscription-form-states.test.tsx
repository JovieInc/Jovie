import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({
    user: null,
  }),
}));

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

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberNameMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

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

function buildFormState(overrides: Record<string, unknown> = {}) {
  return {
    country: { code: 'US', dialCode: '+1', label: 'United States', flag: 'US' },
    setCountry: vi.fn(),
    phoneInput: '',
    emailInput: '',
    error: null,
    errorOrigin: null,
    otpCode: '',
    otpStep: 'input' as const,
    isSubmitting: false,
    isCountryOpen: false,
    setIsCountryOpen: vi.fn(),
    resendCooldownEnd: 0,
    isResending: false,
    notificationsState: 'idle',
    notificationsEnabled: true,
    channel: 'email' as const,
    subscribedChannels: {},
    handleChannelChange: vi.fn(),
    handlePhoneChange: vi.fn(),
    handleEmailChange: vi.fn(),
    handleFieldBlur: vi.fn(),
    handleOtpChange: vi.fn(),
    handleSubscribe: vi.fn().mockResolvedValue(undefined),
    handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
    handleResendOtp: vi.fn().mockResolvedValue(undefined),
    handleKeyDown: vi.fn(),
    openSubscription: vi.fn(),
    registerInputFocus: vi.fn(),
    hydrationStatus: 'done' as const,
    smsEnabled: false,
    ...overrides,
  };
}

async function renderCTA(props: Record<string, unknown> = {}) {
  const { ArtistNotificationsCTA } = await import(
    '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
  );
  return render(<ArtistNotificationsCTA artist={artist} autoOpen {...props} />);
}

describe('ArtistNotificationsCTA subscription form states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hydration and loading', () => {
    it('renders skeleton during hydration', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({ hydrationStatus: 'checking' })
      );
      const { container } = await renderCTA();

      // SubscriptionFormSkeleton renders animated pulse placeholders
      // The component early-returns with the skeleton wrapper
      expect(container.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
      // Should not render any form elements
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('subscription-input')
      ).not.toBeInTheDocument();
    });
  });

  describe('fallback CTA', () => {
    it('renders ListenNowCTA when notifications disabled', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({ notificationsEnabled: false })
      );
      await renderCTA();

      expect(screen.getByText('Listen Now')).toBeInTheDocument();
      expect(screen.getByText('Listen Now').closest('a')).toHaveAttribute(
        'href',
        '/testartist?mode=listen'
      );
    });
  });

  describe('email input form', () => {
    it('renders email form when notifications enabled and editing', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'editing',
          notificationsEnabled: true,
          emailInput: 'fan@example.com',
        })
      );
      await renderCTA();

      expect(screen.getByTestId('subscription-input')).toBeInTheDocument();
      expect(screen.getByTestId('subscription-input')).toHaveAttribute(
        'type',
        'email'
      );
      expect(screen.getByText('Never miss a release.')).toBeInTheDocument();
    });

    it('shows email validation error for empty email', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'editing',
          notificationsEnabled: true,
          error: 'Email address is required',
        })
      );
      await renderCTA();

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('shows email validation error for malformed email', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'editing',
          notificationsEnabled: true,
          error: 'Please enter a valid email address',
        })
      );
      await renderCTA();

      // Error text appears in the sr-only span and the tooltip content
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      // Tooltip renders the error in multiple DOM nodes; verify at least one exists
      const matches = screen.getAllByText('Please enter a valid email address');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('OTP verification', () => {
    it('shows OTP verify UI when pending confirmation', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          otpStep: 'verify',
          notificationsState: 'pending_confirmation',
        })
      );
      await renderCTA();

      expect(
        screen.getByText('Check your inbox. Enter your code.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Verify Code' })
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText('Enter 6-digit verification code')
      ).toBeInTheDocument();
    });

    it('disables verify button while submitting', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          otpStep: 'verify',
          notificationsState: 'pending_confirmation',
          isSubmitting: true,
        })
      );
      await renderCTA();

      const button = screen.getByRole('button', { name: 'Working\u2026' });
      expect(button).toBeDisabled();
    });

    it('shows OTP error via alert role', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          otpStep: 'verify',
          notificationsState: 'pending_confirmation',
          error: 'Invalid verification code',
        })
      );
      await renderCTA();

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Invalid verification code');
    });
  });

  describe('success state', () => {
    it('renders success state when subscribed', async () => {
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'success',
          subscribedChannels: { email: true },
        })
      );
      await renderCTA();

      // SubscriptionSuccess renders for the subscribed state
      // Should not show the form elements
      expect(
        screen.queryByTestId('subscription-input')
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Never miss a release.')
      ).not.toBeInTheDocument();
    });
  });

  describe('user interactions', () => {
    it('calls handleSubscribe on Get Notified click', async () => {
      const handleSubscribe = vi.fn().mockResolvedValue(undefined);
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'editing',
          notificationsEnabled: true,
          handleSubscribe,
        })
      );
      await renderCTA();

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Get Notified' }));

      expect(handleSubscribe).toHaveBeenCalledTimes(1);
    });

    it('calls handleVerifyOtp on Verify Code click', async () => {
      const handleVerifyOtp = vi.fn().mockResolvedValue(undefined);
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          otpStep: 'verify',
          notificationsState: 'pending_confirmation',
          handleVerifyOtp,
        })
      );
      await renderCTA();

      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Verify Code' }));

      expect(handleVerifyOtp).toHaveBeenCalledTimes(1);
    });
  });

  describe('CLS prevention', () => {
    it('wraps all states in min-h-[180px] container', async () => {
      // Hydration state
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({ hydrationStatus: 'checking' })
      );
      const { container: c1, unmount: u1 } = await renderCTA();
      expect(c1.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
      u1();

      // Fallback CTA state
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({ notificationsEnabled: false })
      );
      const { container: c2, unmount: u2 } = await renderCTA();
      expect(c2.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
      u2();

      // Success state
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'success',
          subscribedChannels: { email: true },
        })
      );
      const { container: c3, unmount: u3 } = await renderCTA();
      expect(c3.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
      u3();

      // Editing state (form)
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'editing',
          notificationsEnabled: true,
        })
      );
      const { container: c4 } = await renderCTA();
      expect(c4.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
    });
  });
});
