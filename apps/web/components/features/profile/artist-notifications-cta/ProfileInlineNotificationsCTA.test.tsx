import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ProfileInlineNotificationsCTA } from './ProfileInlineNotificationsCTA';

const mockUseSubscriptionForm = vi.fn();
const mockUseProfileNotifications = vi.fn();

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({ user: null }),
}));

vi.mock('motion/react', () => ({
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
}));

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    useProfileNotifications: () => mockUseProfileNotifications(),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/useSubscriptionForm',
  () => ({
    useSubscriptionForm: () => mockUseSubscriptionForm(),
  })
);

const idleMutation = () => ({
  isPending: false,
  mutateAsync: vi.fn().mockResolvedValue(undefined),
});

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUpdateSubscriberNameMutation: () => idleMutation(),
  useUpdateSubscriberBirthdayMutation: () => idleMutation(),
  useUpdateContentPreferencesMutation: () => idleMutation(),
}));

const ARTIST = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'testartist',
  spotify_id: 'spotify-1',
  name: 'Test Artist',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

function buildProfileNotifications(): ProfileNotificationsContextValue {
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
  };
}

function buildFormState() {
  return {
    emailInput: '',
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
  };
}

describe('ProfileInlineNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileNotifications.mockReturnValue(buildProfileNotifications());
    mockUseSubscriptionForm.mockReturnValue(buildFormState());
  });

  it('renders the trigger as a plain button with the default label', async () => {
    const { container } = render(
      <ProfileInlineNotificationsCTA artist={ARTIST} variant='button' />
    );

    const trigger = screen.getByTestId('profile-inline-notifications-trigger');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveTextContent('Get alerts');
    await expectNoA11yViolations(container);
  });

  it('opens the flow when the trigger is pressed', async () => {
    const user = userEvent.setup();
    render(<ProfileInlineNotificationsCTA artist={ARTIST} />);

    expect(screen.queryByTestId('mobile-email-input')).not.toBeInTheDocument();
    await user.click(
      screen.getByTestId('profile-inline-notifications-trigger')
    );

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('shows a caller-supplied trigger label', () => {
    render(
      <ProfileInlineNotificationsCTA artist={ARTIST} triggerLabel='Turn on' />
    );

    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it('shows the inline form with no trigger when presented inline', async () => {
    const { container } = render(
      <ProfileInlineNotificationsCTA artist={ARTIST} presentation='inline' />
    );

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    expect(
      screen.queryByTestId('profile-inline-notifications-trigger')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('hides the trigger when hideTrigger is set', () => {
    render(<ProfileInlineNotificationsCTA artist={ARTIST} hideTrigger />);

    expect(
      screen.queryByTestId('profile-inline-notifications-trigger')
    ).not.toBeInTheDocument();
  });

  it('renders nothing when notifications are disabled', () => {
    mockUseSubscriptionForm.mockReturnValue({
      ...buildFormState(),
      notificationsEnabled: false,
    });
    const { container } = render(
      <ProfileInlineNotificationsCTA artist={ARTIST} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a skeleton, not the trigger, while hydration is checking', async () => {
    mockUseSubscriptionForm.mockReturnValue({
      ...buildFormState(),
      hydrationStatus: 'checking',
    });
    const { container } = render(
      <ProfileInlineNotificationsCTA artist={ARTIST} />
    );

    expect(
      screen.queryByTestId('profile-inline-notifications-trigger')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
