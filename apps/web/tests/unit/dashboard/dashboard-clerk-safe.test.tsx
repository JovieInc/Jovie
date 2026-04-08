import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettingsSection } from '@/features/dashboard/organisms/account-settings/AccountSettingsSection';
import { DashboardOverviewMetricsClient } from '@/features/dashboard/organisms/DashboardOverviewMetricsClient';
import { useProfileForm } from '@/features/dashboard/organisms/profile-form/useProfileForm';
import type { Artist } from '@/types/db';

vi.mock(
  '@/features/dashboard/organisms/DashboardOverviewControlsProvider',
  () => ({
    useDashboardOverviewControls: () => ({
      range: 'all',
      refreshSignal: 0,
    }),
  })
);

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

vi.mock('@/features/dashboard/molecules/FirstFanCelebration', () => ({
  FirstFanCelebration: ({
    subscriberCount,
  }: {
    subscriberCount: number;
    userId: string;
  }) => <div data-testid='first-fan'>subs:{subscriberCount}</div>,
}));

vi.mock('@/features/dashboard/organisms/DashboardAnalyticsCards', () => ({
  DashboardAnalyticsCards: () => <div data-testid='analytics-cards' />,
}));

vi.mock('@/features/dashboard/organisms/dashboard-activity-feed', () => ({
  DashboardActivityFeed: () => <div data-testid='activity-feed' />,
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
  it('renders DashboardOverviewMetricsClient without a Clerk provider', () => {
    render(
      <DashboardOverviewMetricsClient
        profileId='profile-1'
        showActivity={true}
      />
    );

    expect(screen.queryByTestId('first-fan')).not.toBeInTheDocument();
    expect(screen.getByTestId('analytics-cards')).toBeInTheDocument();
    expect(screen.getByTestId('activity-feed')).toBeInTheDocument();
  });

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
      hideBranding: false,
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
