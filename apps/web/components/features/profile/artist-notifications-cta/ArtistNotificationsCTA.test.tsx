import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { ArtistNotificationsCTA } from './ArtistNotificationsCTA';

// ArtistNotificationsCTA is a thin presentation resolver over the real
// ProfileInlineNotificationsCTA, which is rendered for real here. Only its data
// hooks (profile notifications context, the subscription form, Clerk and the
// subscriber mutations) are stubbed, so no provider tree or network is needed.
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

describe('ArtistNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProfileNotifications.mockReturnValue(buildProfileNotifications());
    mockUseSubscriptionForm.mockReturnValue(buildFormState());
  });

  it('renders a closed overlay trigger by default', async () => {
    const { container } = render(<ArtistNotificationsCTA artist={ARTIST} />);

    expect(
      screen.getByRole('button', { name: /get alerts/i })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-email-input')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the subscription flow when the trigger is pressed', async () => {
    render(<ArtistNotificationsCTA artist={ARTIST} />);

    fireEvent.click(screen.getByRole('button', { name: /get alerts/i }));

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    // The overlay flow may portal outside the render container, so audit the
    // whole document body for the opened state.
    await expectNoA11yViolations(document.body);
  });

  it('uses a caller-supplied trigger label', () => {
    render(
      <ArtistNotificationsCTA artist={ARTIST} triggerLabel='Turn on alerts' />
    );

    expect(
      screen.getByRole('button', { name: 'Turn on alerts' })
    ).toBeInTheDocument();
  });

  it('renders the form inline, with no trigger, when forceExpanded', async () => {
    const { container } = render(
      <ArtistNotificationsCTA artist={ARTIST} forceExpanded />
    );

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get alerts/i })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('auto-opens inline when autoOpen is set', () => {
    render(<ArtistNotificationsCTA artist={ARTIST} autoOpen />);

    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get alerts/i })
    ).not.toBeInTheDocument();
  });

  it('lets an explicit presentation win over autoOpen', () => {
    render(
      <ArtistNotificationsCTA
        artist={ARTIST}
        autoOpen
        presentation='overlay'
        hideTrigger
      />
    );

    // Overlay presentation is honoured: no inline trigger fallback, but the
    // auto-opened flow is still shown.
    expect(
      screen.queryByRole('button', { name: /get alerts/i })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
  });

  it('suppresses the trigger when hideTrigger is set', () => {
    render(<ArtistNotificationsCTA artist={ARTIST} hideTrigger />);

    expect(
      screen.queryByRole('button', { name: /get alerts/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-email-input')).not.toBeInTheDocument();
  });
});
