import { render, screen, waitFor, within } from '@testing-library/react';
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

function buildFormState() {
  return {
    country: { code: 'US', dialCode: '+1', label: 'United States', flag: 'US' },
    setCountry: vi.fn(),
    phoneInput: '',
    emailInput: 'fan@example.com',
    error: null,
    errorOrigin: null,
    otpCode: '',
    otpStep: 'verify' as const,
    isSubmitting: false,
    isCountryOpen: false,
    setIsCountryOpen: vi.fn(),
    resendCooldownEnd: 0,
    isResending: false,
    notificationsState: 'pending_confirmation',
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
  };
}

describe('public profile notifications OTP step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders OTP verification UI in ArtistNotificationsCTA during pending confirmation', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    const { container } = render(
      <ArtistNotificationsCTA artist={artist} autoOpen />
    );

    expect(
      within(container).getByText('Check your inbox. Enter your code.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Verify Code' })
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Enter 6-digit verification code')
    ).toBeInTheDocument();
    expect(screen.queryByText(/confirmation link/i)).not.toBeInTheDocument();
  }, 10000);

  it('renders OTP verification UI in TwoStepNotificationsCTA during pending confirmation', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { TwoStepNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA'
    );

    const { container } = render(<TwoStepNotificationsCTA artist={artist} />);

    await waitFor(() => {
      expect(
        within(container).getByText('Check your inbox. Enter your code.')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Verify' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('Enter 6-digit verification code')
    ).toBeInTheDocument();
    expect(screen.queryByText(/confirmation link/i)).not.toBeInTheDocument();
  }, 10000);
});
