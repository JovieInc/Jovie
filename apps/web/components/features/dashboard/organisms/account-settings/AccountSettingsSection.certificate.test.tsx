import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AccountSettingsSection } from './AccountSettingsSection';

const { useUserSafe, useSessionSafe, notifications } = vi.hoisted(() => ({
  useUserSafe: vi.fn(),
  useSessionSafe: vi.fn(),
  notifications: vi.fn(),
}));

vi.mock('@/hooks/useJovieAuth', () => ({
  useUserSafe: () => useUserSafe(),
  useSessionSafe: () => useSessionSafe(),
}));
vi.mock('@/features/dashboard/organisms/SettingsAppearanceSection', () => ({
  SettingsAppearanceSection: () => <div data-testid='appearance-section' />,
}));
vi.mock('@/features/dashboard/organisms/SettingsNotificationsSection', () => ({
  SettingsNotificationsSection: ({ isGrowth }: { isGrowth: boolean }) => {
    notifications(isGrowth);
    return <div data-testid='notifications-section' />;
  },
}));
vi.mock('./SessionManagementCard', () => ({
  SessionManagementCard: ({ activeSessionId }: { activeSessionId: string }) => (
    <div data-testid='session-management-card'>{activeSessionId}</div>
  ),
  SessionManagementSkeleton: () => (
    <div data-testid='session-management-skeleton' />
  ),
}));

function signedIn(user: {
  email?: string | null;
  fullName?: string | null;
  username?: string | null;
}) {
  useUserSafe.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user-1',
      primaryEmailAddress:
        user.email === null
          ? null
          : { id: 'e1', emailAddress: user.email ?? 'artist@example.com' },
      fullName: user.fullName ?? null,
      username: user.username ?? null,
    },
  });
  useSessionSafe.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    session: { id: 'session-1', userId: 'user-1' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AccountSettingsSection certificate', () => {
  it('shows the signed-in identity and the active sessions panel', async () => {
    signedIn({ fullName: 'Ada Artist', username: 'ada' });
    const { container } = render(<AccountSettingsSection isGrowth />);

    expect(screen.getByTestId('account-identity-email')).toHaveTextContent(
      'artist@example.com'
    );
    expect(screen.getByTestId('account-identity-name')).toHaveTextContent(
      'Ada Artist'
    );
    expect(screen.getByTestId('account-identity-username')).toHaveTextContent(
      '@ada'
    );
    expect(screen.getByTestId('session-management-card')).toHaveTextContent(
      'session-1'
    );
    expect(notifications).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);
  });

  it('holds skeletons while the session loads', async () => {
    useUserSafe.mockReturnValue({ isLoaded: false, isSignedIn: false });
    useSessionSafe.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const { container } = render(<AccountSettingsSection />);

    expect(screen.getByTestId('account-identity-loading')).toBeInTheDocument();
    expect(
      screen.getByTestId('session-management-skeleton')
    ).toBeInTheDocument();
    expect(notifications).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(container);
  });

  it('explains an empty identity and a signed-out visitor', async () => {
    signedIn({ email: null });
    const empty = render(<AccountSettingsSection />);
    expect(screen.getByText('No email on this account')).toBeInTheDocument();
    expect(screen.queryByTestId('account-identity-name')).toBeNull();
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    useUserSafe.mockReturnValue({ isLoaded: true, isSignedIn: false });
    useSessionSafe.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const out = render(<AccountSettingsSection />);
    expect(
      screen.getByText('Sign in to view your account details.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Active Sessions')).toBeNull();
    await expectNoA11yViolations(out.container);
  });

  it('keeps a long identity and an RTL document accessible', async () => {
    const email =
      'bartholomew.maximilian.montgomery.fitzgerald@international-music-collective.example.com';
    signedIn({ email, fullName: 'Bartholomew Montgomery-Fitzgerald' });
    const { container } = render(
      <div dir='rtl'>
        <AccountSettingsSection />
      </div>
    );
    expect(screen.getByText(email)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
