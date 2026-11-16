import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileNotificationsContextValue } from '@/components/organisms/profile-shell/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';
import { TwoStepNotificationsCTA } from './TwoStepNotificationsCTA';

const {
  mockUseProfileNotifications,
  mockUseSubscriptionForm,
  mockGetCaptureDismissalStatus,
} = vi.hoisted(() => ({
  mockUseProfileNotifications: vi.fn(),
  mockUseSubscriptionForm: vi.fn(),
  mockGetCaptureDismissalStatus: vi.fn(),
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: ({
      children,
      ...props
    }: HTMLAttributes<HTMLDivElement> & {
      readonly children: ReactNode;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({ user: null }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

vi.mock('@/lib/profile/capture-dismissal-client', () => ({
  getCaptureDismissalStatus: (...args: unknown[]) =>
    mockGetCaptureDismissalStatus(...args),
  handleCaptureDismissalResponse: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/queries/useNotificationStatusQuery', () => {
  const mutation = () => ({
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  return {
    useUpdateContentPreferencesMutation: mutation,
    useUpdateSubscriberBirthdayMutation: mutation,
    useUpdateSubscriberNameMutation: mutation,
  };
});

const ARTIST = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'tim',
  spotify_id: 'spotify-1',
  name: 'Tim White',
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-01-01T00:00:00.000Z',
} satisfies Artist;

function profileNotifications(): ProfileNotificationsContextValue {
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

// A stateful stand-in for useSubscriptionForm: it runs as a hook inside the
// CTA, so typed email is owned by the same state a real fan would type into.
function useFormState() {
  const [emailInput, setEmailInput] = useState('');
  return {
    emailInput,
    error: null,
    otpCode: '',
    isSubmitting: false,
    resendCooldownEnd: 0,
    isResending: false,
    handleChannelChange: vi.fn(),
    handleEmailChange: setEmailInput,
    handleFieldBlur: vi.fn(),
    handleOtpChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSubscribe: vi.fn().mockResolvedValue('error'),
    handleVerifyOtp: vi.fn().mockResolvedValue('error'),
    handleResendOtp: vi.fn().mockResolvedValue(true),
    notificationsState: 'idle',
    notificationsEnabled: true,
    subscribedChannels: {},
    openSubscription: vi.fn(),
    hydrationStatus: 'done',
  };
}

describe('TwoStepNotificationsCTA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCaptureDismissalStatus.mockResolvedValue(null);
    mockUseProfileNotifications.mockReturnValue(profileNotifications());
    mockUseSubscriptionForm.mockImplementation(useFormState);
  });

  it('renders the collapsed alerts button with no axe violations', async () => {
    const { container } = render(<TwoStepNotificationsCTA artist={ARTIST} />);
    expect(
      screen.getByRole('button', { name: 'Get alerts' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens the overlay flow from the button with no axe violations', async () => {
    const user = userEvent.setup();
    render(<TwoStepNotificationsCTA artist={ARTIST} />);
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    const dialog = await screen.findByRole('dialog');
    expect(screen.getByTestId('mobile-email-input')).toBeInTheDocument();
    await expectNoA11yViolations(dialog);
  });

  it('starts expanded as an inline flow with no axe violations', async () => {
    const { container } = render(
      <TwoStepNotificationsCTA artist={ARTIST} startExpanded />
    );
    expect(await screen.findByTestId('mobile-email-input')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps a typed email and focus when the parent rerenders', async () => {
    const user = userEvent.setup();
    const onFlowClosed = vi.fn();
    const { rerender } = render(
      <TwoStepNotificationsCTA
        artist={ARTIST}
        startExpanded
        onFlowClosed={onFlowClosed}
      />
    );
    const input = await screen.findByTestId('mobile-email-input');
    await user.click(input);
    await user.type(input, 'fan@example.com');
    expect(input).toHaveValue('fan@example.com');

    rerender(
      <TwoStepNotificationsCTA
        artist={{ ...ARTIST }}
        startExpanded
        onFlowClosed={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('mobile-email-input')).toHaveValue(
        'fan@example.com'
      )
    );
    expect(screen.getByTestId('mobile-email-input')).toHaveFocus();
  });
});
