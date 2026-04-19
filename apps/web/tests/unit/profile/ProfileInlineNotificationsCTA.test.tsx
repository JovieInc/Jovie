import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();
const mockUseReducedMotion = vi.fn(() => true);

vi.mock('motion/react', async () => {
  await import('react');

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        readonly children: React.ReactNode;
      }) => <div {...props}>{children}</div>,
    },
    useReducedMotion: () => false,
  };
});

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({
    user: null,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: (...args: unknown[]) => mockUseReducedMotion(...args),
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
  useUpdateSubscriberNameMutation: () => mockUpdateSubscriberNameMutation(),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: (...args: unknown[]) =>
      mockUseSubscriptionForm(...args),
  })
);

vi.mock('@/features/auth/atoms/otp-input', () => ({
  OtpInput: (props: {
    'aria-label'?: string;
    value?: string;
    onChange?: (v: string) => void;
    onComplete?: () => void;
    disabled?: boolean;
  }) => (
    <input
      data-testid='mock-otp-input'
      aria-label={props['aria-label'] ?? 'otp'}
      value={props.value}
      onChange={e => {
        const value = e.target.value;
        props.onChange?.(value);
        if (value.length === 6) {
          props.onComplete?.();
        }
      }}
      disabled={props.disabled}
    />
  ),
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

describe('ProfileInlineNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    mockUseReducedMotion.mockReturnValue(true);

    mockUseSubscriptionForm.mockReturnValue({
      emailInput: '',
      error: null,
      errorOrigin: null,
      otpCode: '',
      otpStep: 'input',
      isSubmitting: false,
      resendCooldownEnd: 0,
      isResending: false,
      handleChannelChange: vi.fn(),
      handleEmailChange: vi.fn(),
      handleFieldBlur: vi.fn(),
      handleOtpChange: vi.fn(),
      handleSubscribe: vi.fn().mockResolvedValue(undefined),
      handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
      handleResendOtp: vi.fn().mockResolvedValue(undefined),
      notificationsState: 'success',
      notificationsEnabled: true,
      openSubscription: vi.fn(),
      hydrationStatus: 'done',
      subscribedChannels: { email: true },
    });

    mockUpdateSubscriberNameMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });

    mockUpdateSubscriberBirthdayMutation.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a subscribed-state button with compact success copy', () => {
    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    expect(
      screen.getByRole('button', { name: /manage notifications/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Notifications on')).toBeInTheDocument();
    expect(
      screen.queryByText(/we'll notify you when/i)
    ).not.toBeInTheDocument();
  });

  it('opens preferences when the subscribed button is clicked', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /manage notifications/i })
    );

    expect(onManageNotifications).toHaveBeenCalledTimes(1);
  });

  it('opens preferences when keyboard focus tabs onto the subscribed button', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });

    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);

    expect(onManageNotifications).toHaveBeenCalledTimes(1);
  });

  it('focuses the email input after the reveal transition completes', () => {
    vi.useFakeTimers();
    mockUseReducedMotion.mockReturnValue(false);

    mockUseSubscriptionForm.mockReturnValue({
      emailInput: '',
      error: null,
      errorOrigin: null,
      otpCode: '',
      otpStep: 'input',
      isSubmitting: false,
      resendCooldownEnd: 0,
      isResending: false,
      handleChannelChange: vi.fn(),
      handleEmailChange: vi.fn(),
      handleFieldBlur: vi.fn(),
      handleOtpChange: vi.fn(),
      handleSubscribe: vi.fn().mockResolvedValue(undefined),
      handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
      handleResendOtp: vi.fn().mockResolvedValue(undefined),
      notificationsState: 'idle',
      notificationsEnabled: true,
      openSubscription: vi.fn(),
      hydrationStatus: 'done',
      subscribedChannels: {},
    });

    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    const emailInput = screen.getByTestId('inline-email-input');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(emailInput).toHaveFocus();
  });

  it('does not auto-open preferences on pointer focus alone', () => {
    const onManageNotifications = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });

    fireEvent.pointerDown(window);
    fireEvent.focus(button);

    expect(onManageNotifications).not.toHaveBeenCalled();
  });

  // Regression: OTP input never appeared when notificationsState became pending_confirmation
  // Found by /investigate on 2026-04-10
  it('renders OTP input when notificationsState is pending_confirmation after email submit', async () => {
    // Start in idle state so the CTA button appears
    mockUseSubscriptionForm.mockReturnValue({
      emailInput: '',
      error: null,
      errorOrigin: null,
      otpCode: '',
      otpStep: 'input',
      isSubmitting: false,
      resendCooldownEnd: 0,
      isResending: false,
      handleChannelChange: vi.fn(),
      handleEmailChange: vi.fn(),
      handleFieldBlur: vi.fn(),
      handleOtpChange: vi.fn(),
      handleSubscribe: vi.fn().mockResolvedValue(undefined),
      handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
      handleResendOtp: vi.fn().mockResolvedValue(undefined),
      notificationsState: 'idle',
      notificationsEnabled: true,
      openSubscription: vi.fn(),
      hydrationStatus: 'done',
      subscribedChannels: {},
    });

    const { rerender } = render(
      <ProfileInlineNotificationsCTA artist={makeArtist()} />
    );

    // Click "Turn on notifications" to advance to the email step
    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    // Now simulate the hook returning pending_confirmation after email submit
    mockUseSubscriptionForm.mockReturnValue({
      emailInput: 'test@example.com',
      error: null,
      errorOrigin: null,
      otpCode: '',
      otpStep: 'verify',
      isSubmitting: false,
      resendCooldownEnd: 0,
      isResending: false,
      handleChannelChange: vi.fn(),
      handleEmailChange: vi.fn(),
      handleFieldBlur: vi.fn(),
      handleOtpChange: vi.fn(),
      handleSubscribe: vi.fn().mockResolvedValue(undefined),
      handleVerifyOtp: vi.fn().mockResolvedValue(undefined),
      handleResendOtp: vi.fn().mockResolvedValue(undefined),
      notificationsState: 'pending_confirmation',
      notificationsEnabled: true,
      openSubscription: vi.fn(),
      hydrationStatus: 'done',
      subscribedChannels: {},
    });

    rerender(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    // The OTP input should be rendered
    const otpInput = screen.getByTestId('mock-otp-input');
    expect(otpInput).toBeInTheDocument();
    expect(
      screen.getByLabelText(/enter 6-digit verification code/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(otpInput).toHaveFocus();
    });
  });

  it('does not create a reopen loop when focus returns after closing the drawer', () => {
    const onManageNotifications = vi.fn();
    const drawer = document.createElement('div');
    drawer.setAttribute('data-testid', 'profile-menu-drawer');
    const drawerButton = document.createElement('button');
    drawer.appendChild(drawerButton);
    document.body.appendChild(drawer);

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    const button = screen.getByRole('button', {
      name: /manage notifications/i,
    });
    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);

    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(1);

    fireEvent.blur(button, { relatedTarget: drawerButton });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(1);

    fireEvent.blur(button, { relatedTarget: outsideButton });
    fireEvent.keyDown(window, { key: 'Tab' });
    fireEvent.focus(button);
    expect(onManageNotifications).toHaveBeenCalledTimes(2);
  });
});
