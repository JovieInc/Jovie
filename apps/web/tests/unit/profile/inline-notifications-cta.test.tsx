import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import type { Artist } from '@/types/db';

const mockUseSubscriptionForm = vi.fn();
const mockUseProfileNotifications = vi.fn();
const mockUseUserSafe = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateContentPreferencesMutation = vi.fn();

let ProfileInlineNotificationsCTA: typeof import('@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA').ProfileInlineNotificationsCTA;

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: (...args: unknown[]) => mockUseUserSafe(...args),
}));

vi.mock('motion/react', async () => {
  await import('react');

  return {
    AnimatePresence: ({ children }: { readonly children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: ({
        children,
        ...props
      }: React.HTMLAttributes<HTMLDivElement> & {
        readonly children?: React.ReactNode;
      }) => <div {...props}>{children}</div>,
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
  useUpdateSubscriberNameMutation: () => mockUpdateSubscriberNameMutation(),
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
  useUpdateContentPreferencesMutation: () =>
    mockUpdateContentPreferencesMutation(),
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
    settings: null,
    theme: null,
    ...overrides,
  } as Artist;
}

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
    subscriptionDetails: { email: 'fan@test.com' },
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
    emailInput: 'fan@test.com',
    error: null,
    otpCode: '',
    isSubmitting: false,
    resendCooldownEnd: 0,
    isResending: false,
    handleChannelChange: vi.fn(),
    handleEmailChange: vi.fn(),
    handleOtpChange: vi.fn(),
    handleSubscribe: vi.fn().mockResolvedValue('error'),
    handleVerifyOtp: vi.fn().mockResolvedValue('error'),
    handleResendOtp: vi.fn().mockResolvedValue(true),
    notificationsState: 'idle',
    notificationsEnabled: true,
    subscribedChannels: {},
    openSubscription: vi.fn(),
    hydrationStatus: 'done',
    ...overrides,
  };
}

describe('ProfileInlineNotificationsCTA flow', () => {
  beforeAll(async () => {
    ({ ProfileInlineNotificationsCTA } = await import(
      '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA'
    ));
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';

    mockUseUserSafe.mockReturnValue({ user: null });
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

  it('prefills the email step from Clerk when the flow opens', async () => {
    const handleEmailChange = vi.fn();
    mockUseUserSafe.mockReturnValue({
      user: { primaryEmailAddress: { emailAddress: 'clerk@example.com' } },
    });
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        emailInput: '',
        handleEmailChange,
      })
    );

    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }));

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    expect(handleEmailChange).toHaveBeenCalledWith('clerk@example.com');
  });

  it('moves from email entry into OTP when subscribe returns pending confirmation', async () => {
    const handleSubscribe = vi.fn().mockResolvedValue('pending_confirmation');
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        handleSubscribe,
      })
    );

    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    await waitFor(() => {
      expect(handleSubscribe).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Enter the code')).toBeInTheDocument();
  });

  it('does not reset inline auto-open flow back to email on rerender', async () => {
    mockUseSubscriptionForm.mockReturnValue(buildFormState());

    const view = render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        presentation='inline'
      />
    );

    expect(await screen.findByTestId('mobile-email-input')).toBeInTheDocument();

    mockUseSubscriptionForm.mockReturnValue({
      ...buildFormState(),
      handleChannelChange: vi.fn(),
      openSubscription: vi.fn(),
    });

    view.rerender(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        presentation='inline'
      />
    );

    expect(await screen.findByTestId('mobile-email-input')).toBeInTheDocument();
    expect(screen.queryByText('Sent from Jovie')).not.toBeInTheDocument();
  });

  it('progresses from OTP through name and birthday into activated state', async () => {
    const handleSubscribe = vi.fn().mockResolvedValue('pending_confirmation');
    const handleVerifyOtp = vi.fn().mockResolvedValue('subscribed');

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        handleSubscribe,
        handleVerifyOtp,
        otpCode: '123456',
      })
    );

    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^verify$/i }));

    expect(await screen.findByTestId('mobile-name-input')).toBeInTheDocument();
    expect(screen.getByText('Alerts activated')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(
      await screen.findByTestId('mobile-birthday-month')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(
      await screen.findByText('Enter a full date to save it.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    expect(await screen.findByText('Back to Profile')).toBeInTheDocument();
    expect(screen.queryByText('Sent from Jovie')).not.toBeInTheDocument();
    expect(screen.queryByText('Sent by Test Artist')).not.toBeInTheDocument();
  });

  it('renders nothing while notification hydration is checking', async () => {
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        hydrationStatus: 'checking',
      })
    );

    const { container } = render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        presentation='inline'
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
