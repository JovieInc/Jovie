import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings/AccountSettingsSection';
import { useProfileForm } from '@/features/dashboard/organisms/profile-form/useProfileForm';
import type { Artist } from '@/types/db';

vi.mock('@/lib/queries', () => ({
  useDashboardAnalyticsQuery: () => ({
    data: { subscribers: 5 },
  }),
  useProfileMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn(),
  }),
}));

vi.mock(
  '@/features/dashboard/organisms/account-settings/ConnectedAccountsCard',
  () => ({
    ConnectedAccountsCard: () => <div data-testid='connected-accounts-card' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/account-settings/EmailManagementCard',
  () => ({
    EmailManagementCard: () => <div data-testid='email-management-card' />,
  })
);

vi.mock(
  '@/features/dashboard/organisms/account-settings/SessionManagementCard',
  () => ({
    SessionManagementCard: () => <div data-testid='session-management-card' />,
  })
);

vi.mock('@/features/dashboard/organisms/SettingsAppearanceSection', () => ({
  SettingsAppearanceSection: () => <div>Appearance section</div>,
}));

vi.mock('@/features/dashboard/organisms/SettingsNotificationsSection', () => ({
  SettingsNotificationsSection: () => <div>Notifications section</div>,
}));

describe('dashboard clerk-safe rendering', () => {
  it('renders AccountSettingsSection without a Clerk provider', () => {
    render(<AccountSettingsSection />);

    expect(screen.getByTestId('account-settings-section')).toBeInTheDocument();
    expect(screen.getByText('Appearance section')).toBeInTheDocument();
    expect(screen.getByText('Notifications section')).toBeInTheDocument();
    expect(
      screen.queryByTestId('connected-accounts-card')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('email-management-card')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('session-management-card')
    ).not.toBeInTheDocument();
  });

  it('initializes profile form safely without a Clerk provider', () => {
    const artist = {
      id: 'artist-1',
      name: 'Tim White',
      tagline: '',
      imageUrl: '',
    } as unknown as Artist;

    const { result } = renderHook(() =>
      useProfileForm({
        artist,
        onUpdate: vi.fn(),
      })
    );

    expect(result.current.formData.name).toBe('Tim White');
    expect(result.current.formData).toEqual({
      imageUrl: '',
      name: 'Tim White',
      tagline: '',
    });
  });
});
