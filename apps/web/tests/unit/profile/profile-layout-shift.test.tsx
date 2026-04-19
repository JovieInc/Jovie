import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@/types/db';

/**
 * CLS-prevention tests: verify that fixed-height wrapper classes are present
 * on wrapper containers in all component states. jsdom can't measure
 * pixels, so we assert class presence instead.
 */

const mockUseSubscriptionForm = vi.fn();
const mockUseUserSafe = vi.fn();

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
  useUpdateSubscriberBirthdayMutation: () => ({
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
  useUpdateSubscriberBirthdayMutation: () => ({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
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

describe('CLS-prevention: min-h CSS classes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserSafe.mockReturnValue({ user: null });
  });

  it('ArtistNotificationsCTA wraps skeleton in min-h-[180px]', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({ hydrationStatus: 'checking' })
    );

    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    const { container } = render(
      <ArtistNotificationsCTA artist={artist} autoOpen />
    );

    expect(container.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
  });

  it('ArtistNotificationsCTA wraps form in min-h-[180px]', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'editing',
        notificationsEnabled: true,
      })
    );

    const { ArtistNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA'
    );

    const { container } = render(
      <ArtistNotificationsCTA artist={artist} autoOpen />
    );

    expect(container.querySelector('.min-h-\\[180px\\]')).toBeInTheDocument();
  });

  it('ProfileInlineNotificationsCTA has h-[72px] on wrapper', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const { ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    );

    render(<ProfileInlineNotificationsCTA artist={artist} />);

    const wrapper = screen.getByTestId('profile-inline-cta');
    expect(wrapper.className).toContain('h-[72px]');
  });
});
