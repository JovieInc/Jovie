import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountSettingsSection } from './AccountSettingsSection';

const useUserSafe = vi.fn();

vi.mock('@/hooks/useJovieAuth', () => ({
  useUserSafe: () => useUserSafe(),
}));

vi.mock('@/features/dashboard/organisms/SettingsAppearanceSection', () => ({
  SettingsAppearanceSection: () => <div data-testid='appearance-section' />,
}));

vi.mock('@/features/dashboard/organisms/SettingsNotificationsSection', () => ({
  SettingsNotificationsSection: () => (
    <div data-testid='notifications-section' />
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

    render(<AccountSettingsSection />);

    expect(screen.getByTestId('account-identity-summary')).toBeTruthy();
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
    expect(screen.queryByText(/^sessions$/i)).toBeNull();
  });

  it('shows a loading skeleton while the session is pending', () => {
    useUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });

    render(<AccountSettingsSection />);
    expect(screen.getByTestId('account-identity-loading')).toBeTruthy();
  });
});
