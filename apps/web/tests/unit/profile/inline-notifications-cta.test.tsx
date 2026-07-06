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
    phoneInput: '',
    country: { code: 'US', dialCode: '+1', label: 'United States' },
    error: null,
    otpCode: '',
    isSubmitting: false,
    resendCooldownEnd: 0,
    isResending: false,
    handleChannelChange: vi.fn(),
    handleEmailChange: vi.fn(),
    handlePhoneChange: vi.fn(),
    handleOtpChange: vi.fn(),
    handleSubscribe: vi.fn().mockResolvedValue('error'),
    handleVerifyOtp: vi.fn().mockResolvedValue('error'),
    handleResendOtp: vi.fn().mockResolvedValue(true),
    notificationsState: 'idle',
    notificationsEnabled: true,
    channel: 'email',
    subscribedChannels: {},
    openSubscription: vi.fn(),
    hydrationStatus: 'done',
    isCountryOpen: false,
    setCountry: vi.fn(),
    setIsCountryOpen: vi.fn(),
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

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

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

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^verify$/i }));

    expect(await screen.findByTestId('mobile-name-input')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'First Name' })
    ).toBeInTheDocument();

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

  it('reports overlay open state through onFlowOpenChange', async () => {
    const onFlowOpenChange = vi.fn();

    render(
      <ProfileInlineNotificationsCTA
        artist={makeArtist()}
        onFlowOpenChange={onFlowOpenChange}
      />
    );

    expect(onFlowOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));
    expect(onFlowOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(onFlowOpenChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('keeps action labels visible without a dark ancestor and uses themed birthday selects', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));
    fireEvent.click(screen.getByRole('button', { name: /^submit$/i }));

    // Regression #13391: the primary action label color must not be
    // dark:-gated — it renders on the always-dark profile stage regardless of
    // any `.dark` ancestor class.
    const verify = await screen.findByRole('button', { name: /^verify$/i });
    expect(verify.className).toContain('text-white');
    expect(verify.className).not.toContain('dark:text-white');

    fireEvent.click(verify);
    expect(await screen.findByTestId('mobile-name-input')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    // Regression #13391: birthday inputs are themed Radix Select triggers, not
    // native <select> elements that pop an unstyled OS listbox.
    for (const testId of [
      'mobile-birthday-month',
      'mobile-birthday-day',
      'mobile-birthday-year',
    ]) {
      const trigger = await screen.findByTestId(testId);
      expect(trigger.tagName).toBe('BUTTON');
    }
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

  // JOV-1986: alert mode consistency across all three entry points.
  // The preference labels in ProfileMobileNotificationsFlow map as:
  //   newMusic → 'New Music', tourDates → 'Shows', merch → 'Merch'
  describe('alert mode consistency (JOV-1986)', () => {
    it('initializes alertPrefs from server contentPreferences when already subscribed (overlay entry)', async () => {
      // Subscriber has tourDates disabled on the server (rendered as 'Shows' label)
      mockUseProfileNotifications.mockReturnValue(
        buildProfileNotifications({
          contentPreferences: {
            newMusic: true,
            tourDates: false,
            merch: true,
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

      render(<ProfileInlineNotificationsCTA artist={makeArtist()} />);

      fireEvent.click(screen.getByRole('button', { name: /manage alerts/i }));

      // Preferences step must show the saved server value, not the all-true default
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: 'Shows' })).not.toBeChecked();
      });
      // Other preferences remain as saved
      expect(screen.getByRole('switch', { name: 'New Music' })).toBeChecked();
    });

    it('seeds alertPrefs from context at mount when already subscribed (inline entry)', async () => {
      // Subscriber has merch disabled on the server
      mockUseProfileNotifications.mockReturnValue(
        buildProfileNotifications({
          contentPreferences: {
            newMusic: true,
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
          artist={makeArtist()}
          presentation='inline'
        />
      );

      // Inline flows go directly to preferences for subscribed users
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: 'Merch' })).not.toBeChecked();
      });
      expect(screen.getByRole('switch', { name: 'New Music' })).toBeChecked();
    });

    it('syncs alertPrefs from server when hydration resolves to subscribed mid-flow (subscribe-drawer entry)', async () => {
      // Start as unsubscribed (hydration pending)
      mockUseProfileNotifications.mockReturnValue(
        buildProfileNotifications({
          contentPreferences: {
            newMusic: true,
            tourDates: false,
            merch: true,
            general: true,
          },
        })
      );
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'idle',
          subscribedChannels: {},
        })
      );

      const { rerender } = render(
        <ProfileInlineNotificationsCTA
          artist={makeArtist()}
          presentation='inline'
          autoOpen
        />
      );

      // Initially shows email step for unsubscribed user
      await waitFor(() => {
        expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
      });

      // Hydration completes: user is now subscribed
      mockUseSubscriptionForm.mockReturnValue(
        buildFormState({
          notificationsState: 'success',
          subscribedChannels: { email: true },
        })
      );

      rerender(
        <ProfileInlineNotificationsCTA
          artist={makeArtist()}
          presentation='inline'
          autoOpen
        />
      );

      // Must transition to preferences with saved server prefs (tourDates/Shows = off)
      await waitFor(() => {
        expect(screen.getByRole('switch', { name: 'Shows' })).not.toBeChecked();
      });
      expect(screen.getByRole('switch', { name: 'New Music' })).toBeChecked();
    });
  });
});
