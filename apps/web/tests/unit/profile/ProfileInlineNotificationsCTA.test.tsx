import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import { ProfileInlineNotificationsCTA } from '@/features/profile/artist-notifications-cta/ProfileInlineNotificationsCTA';
import type { Artist } from '@/types/db';

const mockUseProfileNotifications = vi.fn();
const mockUseSubscriptionForm = vi.fn();
const mockUseUserSafe = vi.fn();
const mockUpdateSubscriberNameMutation = vi.fn();
const mockUpdateSubscriberBirthdayMutation = vi.fn();
const mockUpdateContentPreferencesMutation = vi.fn();

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
    useReducedMotion: () => true,
  };
});

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: (...args: unknown[]) => mockUseUserSafe(...args),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

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
  useUpdateContentPreferencesMutation: () =>
    mockUpdateContentPreferencesMutation(),
  useUpdateSubscriberBirthdayMutation: () =>
    mockUpdateSubscriberBirthdayMutation(),
  useUpdateSubscriberNameMutation: () => mockUpdateSubscriberNameMutation(),
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
    subscriptionDetails: {},
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
    emailInput: '',
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

describe('ProfileInlineNotificationsCTA', () => {
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

  it('opens the shared full-screen flow from the trigger', async () => {
    const formState = buildFormState();
    mockUseSubscriptionForm.mockReturnValue(formState);

    render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

    fireEvent.click(
      screen.getByRole('button', { name: /turn on notifications/i })
    );

    expect(formState.handleChannelChange).toHaveBeenCalledWith('email');
    expect(formState.openSubscription).toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Turn On Alerts')).toBeInTheDocument();
  });

  it('routes subscribed users into manage mode when a handler is provided', () => {
    const onManageNotifications = vi.fn();

    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        subscribedChannels: { email: true },
      })
    );

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onManageNotifications={onManageNotifications}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /manage alerts/i }));

    expect(onManageNotifications).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByTestId('profile-mobile-notifications-flow')
    ).not.toBeInTheDocument();
  });

  it('renders the split Jovie vs artist alerts screen for inline manage mode', async () => {
    mockUseProfileNotifications.mockReturnValue(
      buildProfileNotifications({
        subscriptionDetails: { email: 'fan@test.com' },
        artistEmail: {
          optedIn: true,
          pendingProvider: true,
          visibleToArtist: false,
        },
      })
    );
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        subscribedChannels: { email: true },
      })
    );

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        presentation='inline'
      />
    );

    expect(await screen.findByText('Alerts')).toBeInTheDocument();
    expect(screen.getByText('Sent from Jovie')).toBeInTheDocument();
    expect(screen.getByText('Sent by Test Artist')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: /subscribe to other alerts/i })
    ).toBeChecked();
  });

  it('submits Jovie preferences and artist email consent together', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUpdateContentPreferencesMutation.mockReturnValue({
      isPending: false,
      mutateAsync,
    });
    mockUseProfileNotifications.mockReturnValue(
      buildProfileNotifications({
        subscriptionDetails: { email: 'fan@test.com' },
        contentPreferences: {
          newMusic: false,
          tourDates: true,
          merch: false,
          general: true,
        },
      })
    );
    mockUseSubscriptionForm.mockReturnValue(
      buildFormState({
        notificationsState: 'success',
        subscribedChannels: { email: true },
      })
    );

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist({
          settings: { notifications: { artistEmailReady: false } },
        })}
        presentation='inline'
      />
    );

    await screen.findByText('Alerts');

    fireEvent.click(
      screen.getByRole('switch', { name: /subscribe to other alerts/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /save & finish/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        artistId: 'artist-1',
        email: 'fan@test.com',
        phone: undefined,
        preferences: {
          newMusic: false,
          tourDates: true,
          merch: false,
        },
        artistEmailOptIn: true,
      });
    });
  });
});
