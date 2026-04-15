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

vi.mock('@/features/profile/notifications', () => ({
  CountrySelector: (props: Record<string, unknown>) => (
    <div data-testid='country-selector' />
  ),
  COUNTRY_OPTIONS: [
    { code: 'US', dialCode: '+1', label: 'United States', flag: 'US' },
  ],
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
    notificationsState: 'editing',
    notificationsEnabled: true,
    channel: 'sms' as const,
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
    smsEnabled: true,
    ...overrides,
  };
}

async function renderCTA(props: Record<string, unknown> = {}) {
  const { ArtistNotificationsCTA } = await import(
    '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
  );
  return render(<ArtistNotificationsCTA artist={artist} autoOpen {...props} />);
}

describe('ArtistNotificationsCTA SMS subscribe flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders phone input with numeric inputMode when channel is sms', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState({ channel: 'sms' }));
    await renderCTA();

    const input = screen.getByTestId('subscription-input');
    expect(input).toHaveAttribute('inputMode', 'numeric');
    expect(input).toHaveAttribute('placeholder', '(555) 123-4567');
  });

  it('renders channel toggle when sms is enabled', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ smsEnabled: true, channel: 'email' })
    );
    await renderCTA();

    const toggle = screen.getByRole('button', {
      name: 'Switch to text updates',
    });
    expect(toggle).toBeInTheDocument();
  });

  it('shows country selector when phone has digits', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ channel: 'sms', phoneInput: '555' })
    );
    await renderCTA();

    expect(screen.getByTestId('country-selector')).toBeInTheDocument();
  });

  it('hides country selector when phone is empty', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ channel: 'sms', phoneInput: '' })
    );
    await renderCTA();

    expect(screen.queryByTestId('country-selector')).not.toBeInTheDocument();
  });

  it('shows phone validation error', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        channel: 'sms',
        error: 'Phone number is required',
      })
    );
    await renderCTA();

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('calls handleSubscribe on Get Notified click in SMS mode', async () => {
    const handleSubscribe = vi.fn().mockResolvedValue(undefined);
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ channel: 'sms', handleSubscribe })
    );
    await renderCTA();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Get Notified' }));

    expect(handleSubscribe).toHaveBeenCalledTimes(1);
  });
});
