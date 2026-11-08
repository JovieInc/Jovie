import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsSection } from './AccountSettingsSection';

const useUserSafe = vi.fn();
const useSessionSafe = vi.fn();

vi.mock('@/hooks/useJovieAuth', () => ({
  useUserSafe: () => useUserSafe(),
  useSessionSafe: () => useSessionSafe(),
}));

vi.mock('@/features/dashboard/organisms/SettingsAppearanceSection', () => ({
  SettingsAppearanceSection: () => <div data-testid='appearance-section' />,
}));

vi.mock('@/features/dashboard/organisms/SettingsNotificationsSection', () => ({
  SettingsNotificationsSection: () => (
    <div data-testid='notifications-section' />
  ),
}));

vi.mock('./SessionManagementCard', () => ({
  SessionManagementCard: () => <div data-testid='session-management-card' />,
  SessionManagementSkeleton: () => (
    <div data-testid='session-management-skeleton' />
  ),
}));

describe('AccountSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Better Auth identity without Clerk resource controls', () => {
    useUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'ba_user_1',
        emailAddresses: [
          { id: 'ba_email_1', emailAddress: 'artist@example.com' },
        ],
        primaryEmailAddress: {
          id: 'ba_email_1',
          emailAddress: 'artist@example.com',
        },
        imageUrl: null,
        fullName: 'Ada Artist',
        firstName: 'Ada',
        lastName: 'Artist',
        username: 'ada',
      },
    });
    useSessionSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      session: { id: 'ba_session_1', userId: 'ba_user_1' },
    });

    render(<AccountSettingsSection />);

    const identitySummary = screen.getByTestId('account-identity-summary');
    expect(identitySummary).toHaveClass('min-h-32');

    const bodyWrapper = identitySummary.parentElement;
    expect(bodyWrapper).not.toBeNull();
    expect(bodyWrapper).toHaveClass('px-4', 'py-4', 'sm:px-5');

    const outerPanel = bodyWrapper?.parentElement;
    expect(outerPanel).not.toBeNull();
    expect(outerPanel).toHaveClass('rounded-xl', 'border', 'bg-surface-1');
    expect(outerPanel).not.toHaveClass('px-4', 'py-4', 'sm:px-5');
    expect(outerPanel?.children).toHaveLength(1);

    expect(screen.getByTestId('account-identity-email').textContent).toBe(
      'artist@example.com'
    );
    expect(screen.getByTestId('account-identity-name').textContent).toBe(
      'Ada Artist'
    );
    expect(screen.getByTestId('account-identity-username').textContent).toBe(
      '@ada'
    );
    expect(screen.getByTestId('appearance-section')).toBeTruthy();
    expect(screen.getByTestId('notifications-section')).toBeTruthy();
    expect(screen.queryByText(/connected accounts/i)).toBeNull();
    expect(screen.getByText('Active Sessions')).toBeTruthy();
    // One sessions card; it owns its fixed loading geometry (no CLS).
    expect(screen.getAllByTestId('session-management-card')).toHaveLength(1);
  });

  it('shows a loading skeleton while the session is pending', () => {
    useUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });
    useSessionSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      session: null,
    });

    render(<AccountSettingsSection />);
    expect(screen.getByTestId('account-identity-loading')).toHaveClass(
      'min-h-32'
    );
  });

  it('sizes each identity skeleton line to one inherited text line', () => {
    // text-app sets no line-height, so a fixed em height guessed the
    // inherited one; 1lh is that line, whatever it is.
    useUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });
    useSessionSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      session: null,
    });

    render(<AccountSettingsSection />);
    const loading = screen.getByTestId('account-identity-loading');
    const lines = loading.querySelectorAll(':scope > div > div');
    expect(lines).toHaveLength(6);
    for (const line of lines) expect(line).toHaveClass('h-[1lh]');
  });

  it('holds the Active Sessions panel in place until the session loads', () => {
    // In production the page renders before the client session loads; the
    // panel appearing later pushed everything below it down (phone CLS).
    useUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });
    useSessionSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      session: null,
    });

    render(<AccountSettingsSection />);
    expect(screen.getByText('Active Sessions')).toBeTruthy();
    expect(screen.getByTestId('session-management-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('session-management-card')).toBeNull();
  });

  it('preserves identity geometry when loading resolves signed out', () => {
    useUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });
    useSessionSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      session: null,
    });

    const { rerender } = render(<AccountSettingsSection />);
    expect(screen.getByTestId('account-identity-loading')).toHaveClass(
      'min-h-32'
    );

    useUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
    useSessionSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      session: null,
    });
    rerender(<AccountSettingsSection />);

    expect(screen.getByTestId('account-identity-unsigned')).toHaveClass(
      'min-h-32'
    );
    expect(screen.queryByTestId('session-management-card')).toBeNull();
  });
});
