import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();
const mockUseUserSafe = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();

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
  useUserSafe: (...args: unknown[]) => mockUseUserSafe(...args),
}));

vi.mock('@/features/auth/atoms/otp-input', () => ({
  OtpInput: ({
    value,
    onChange,
    onComplete,
    'aria-label': ariaLabel,
    error,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onComplete?: (value: string) => void;
    readonly 'aria-label': string;
    readonly error?: boolean;
  }) => (
    <input
      aria-label={ariaLabel}
      value={value}
      data-error={error ? 'true' : 'false'}
      onChange={event => {
        onChange(event.target.value);
        if (event.target.value.length === 6 && onComplete)
          onComplete(event.target.value);
      }}
    />
  ),
}));

vi.mock('@/features/profile/artist-notifications-cta/BirthdayInput', () => ({
  BirthdayInput: ({
    value,
    onChange,
    onComplete,
    onSubmit,
  }: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly onComplete?: (value: string) => void;
    readonly onSubmit?: () => void;
  }) => (
    <input
      data-testid='inline-birthday-input'
      value={value}
      onChange={event => {
        onChange(event.target.value);
        if (event.target.value.length === 8 && onComplete)
          onComplete(event.target.value);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') onSubmit?.();
      }}
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
    useReducedMotion: () => true,
  };
});

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

vi.mock('@/lib/queries', () => ({
  useUpdateSubscriberNameMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useSubscribeNotificationsMutation: () => ({ mutateAsync: vi.fn() }),
  useVerifyEmailOtpMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberNameMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
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

function buildFormState(overrides = {}) {
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
    resendCooldownEnd: 0,
    isResending: false,
    ...overrides,
  };
}

describe('ProfileInlineNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSafe.mockReturnValue({ user: null });
    mockUpdateSubscriberBirthdayMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('renders "Turn on notifications" button in cta step', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(<ProfileInlineNotificationsCTA artist={artist} />);

    expect(
      screen.getByRole('button', { name: /turn on notifications/i })
    ).toBeInTheDocument();
  });

  it('clicking CTA reveals email input', async () => {
    const formState = buildFormState();
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click the CTA button
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // openSubscription and handleChannelChange should have been called
    expect(formState.openSubscription).toHaveBeenCalled();
    expect(formState.handleChannelChange).toHaveBeenCalledWith('email');

    // Re-render — the component now has internal step='email'
    // The form state stays the same, the step transition is internal
    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    expect(screen.getByTestId('inline-email-input')).toBeInTheDocument();
  });

  it('shows OTP step when pending confirmation', async () => {
    // Start with email step visible (idle state, then click to email)
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to advance to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Now simulate pending_confirmation after email submit
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '',
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // OTP input should be visible
    expect(
      screen.getByLabelText('Enter 6-digit verification code')
    ).toBeInTheDocument();
  });

  it('shows name capture after successful verification', async () => {
    // Start idle → click to email → then jump to success
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to get to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Simulate success after OTP verification
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        emailInput: 'fan@test.com',
        subscribedChannels: { email: true },
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // Name input should appear with placeholder
    const nameInput = screen.getByTestId('inline-name-input');
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveAttribute('placeholder', "What's your name?");
  });

  it('shows birthday input after name step', async () => {
    // Start idle → click to email → success → name → submit name → birthday
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Jump to success (triggers name step)
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        emailInput: 'fan@test.com',
        subscribedChannels: { email: true },
      })
    );
    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // We should be on name step — submit with empty name to skip to birthday
    const nameInput = screen.getByTestId('inline-name-input');
    expect(nameInput).toBeInTheDocument();

    // Press Enter on the name input to submit (empty name skips to birthday)
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    // Re-render to pick up the step change
    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    const birthdayInput = screen.getByTestId('inline-birthday-input');
    expect(birthdayInput).toBeInTheDocument();
  });

  it('submits the completed birthday value from onComplete', async () => {
    const birthdayMutation = vi.fn().mockResolvedValue(undefined);
    mockUpdateSubscriberBirthdayMutation.mockReturnValue({
      isPending: false,
      mutateAsync: birthdayMutation,
    });

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ notificationsState: 'idle' })
    );

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        emailInput: 'fan@test.com',
        subscribedChannels: { email: true },
      })
    );
    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    const nameInput = screen.getByTestId('inline-name-input');
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    const birthdayInput = screen.getByTestId('inline-birthday-input');
    fireEvent.change(birthdayInput, { target: { value: '01021990' } });

    await waitFor(() => {
      expect(birthdayMutation).toHaveBeenCalledWith({
        artistId: artist.id,
        email: 'fan@test.com',
        birthday: '1990-01-02',
      });
    });
  });

  it('shows "Notifications on" in done step', async () => {
    // When already subscribed on mount, the component jumps straight to done
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        subscribedChannels: { email: true },
      })
    );

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(<ProfileInlineNotificationsCTA artist={artist} />);

    expect(screen.getByText('Notifications on')).toBeInTheDocument();
  });

  it('returns null when notifications disabled', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ notificationsEnabled: false })
    );

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { container } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows skeleton during hydration', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ hydrationStatus: 'checking' })
    );

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(<ProfileInlineNotificationsCTA artist={artist} />);

    expect(screen.getByText('Loading subscription form')).toBeInTheDocument();
  });

  it('wraps content in fixed h-[72px] container', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(<ProfileInlineNotificationsCTA artist={artist} />);

    const container = screen.getByTestId('profile-inline-cta');
    expect(container.className).toContain('h-[72px]');
  });

  it('keeps OTP submit enabled when the code is complete, even with an error', async () => {
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Simulate pending confirmation (OTP step)
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '123456',
        error: 'Code expired. Request a new code.',
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // Submit button stays available so the corrected code can replace in place.
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    expect(submitBtn).toBeEnabled();
  });

  it('auto-verifies a new completed OTP code once and ignores the same failed code on re-entry', async () => {
    const handleVerifyOtp = vi.fn().mockResolvedValue(undefined);
    const formState = buildFormState({
      notificationsState: 'idle',
      handleVerifyOtp,
    });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '',
        handleVerifyOtp,
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    fireEvent.change(screen.getByLabelText('Enter 6-digit verification code'), {
      target: { value: '123456' },
    });

    expect(handleVerifyOtp).toHaveBeenCalledTimes(1);
    expect(handleVerifyOtp).toHaveBeenLastCalledWith('123456');

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '123456',
        error: 'Invalid verification code',
        handleVerifyOtp,
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    fireEvent.change(screen.getByLabelText('Enter 6-digit verification code'), {
      target: { value: '123456' },
    });

    expect(handleVerifyOtp).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Enter 6-digit verification code'), {
      target: { value: '123457' },
    });

    expect(handleVerifyOtp).toHaveBeenCalledTimes(2);
    expect(handleVerifyOtp).toHaveBeenLastCalledWith('123457');
  });

  it('shows resend link when OTP error is present', async () => {
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Simulate OTP error
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '123456',
        error: 'Invalid verification code',
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // Resend link should be visible
    expect(
      screen.getByRole('button', { name: /resend code/i })
    ).toBeInTheDocument();
  });

  it('shows cooldown text when resend is on cooldown', async () => {
    const formState = buildFormState({ notificationsState: 'idle' });
    mockUseSubscriptionForm.mockReturnValue(formState);

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Simulate OTP error with active cooldown
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'pending_confirmation',
        emailInput: 'fan@test.com',
        otpCode: '123456',
        error: 'Code expired',
        resendCooldownEnd: Date.now() + 15_000,
      })
    );

    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    // Should show cooldown text instead of resend button
    expect(screen.getByText(/resend in/i)).toBeInTheDocument();
  });

  it('prefills email from Clerk session', async () => {
    const handleEmailChange = vi.fn();
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'idle',
        handleEmailChange,
      })
    );
    mockUseUserSafe.mockReturnValue({
      user: {
        primaryEmailAddress: { emailAddress: 'clerk@example.com' },
      },
    });

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={artist} />
    );

    // Click the CTA to advance to email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Re-render to trigger the useEffect that prefills from Clerk
    rerender(<ProfileInlineNotificationsCTA artist={artist} />);

    expect(handleEmailChange).toHaveBeenCalledWith('clerk@example.com');
  });
});
