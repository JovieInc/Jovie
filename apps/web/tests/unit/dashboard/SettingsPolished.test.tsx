import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPolished } from '@/features/dashboard/organisms/SettingsPolished';
import type { Artist } from '@/types/db';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock('@/features/dashboard/atoms/DashboardCard', () => ({
  DashboardCard: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/features/dashboard/organisms/account-settings', () => ({
  AccountSettingsSection: () => <div>Account Settings</div>,
}));
vi.mock('@/features/dashboard/organisms/DataPrivacySection', () => ({
  DataPrivacySection: () => <div>Data Privacy</div>,
}));

vi.mock('@/features/dashboard/organisms/SettingsAdPixelsSection', () => ({
  SettingsAdPixelsSection: () => <div>Pixels</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsAnalyticsSection', () => ({
  SettingsAnalyticsSection: () => <div>Analytics</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsAudienceSection', () => ({
  SettingsAudienceSection: () => <div>Audience</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsBillingSection', () => ({
  SettingsBillingSection: () => <div>Billing</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsContactsSection', () => ({
  SettingsContactsSection: () => <div>Contacts</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsPaymentsSection', () => ({
  SettingsPaymentsSection: () => <div>Payments</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsUsageStatsSection', () => ({
  SettingsUsageStatsSection: () => <div>Usage Stats Section</div>,
}));
vi.mock('@/features/dashboard/organisms/SettingsTouringSection', () => ({
  SettingsTouringSection: () => <div>Touring</div>,
}));
vi.mock(
  '@/features/dashboard/organisms/settings-artist-profile-section',
  () => ({
    SettingsArtistProfileSection: () => <div>Profile</div>,
  })
);

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_123',
  },
}));

vi.mock('@/lib/flags/client', () => ({
  useAppFlag: () => false,
}));

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: () => ({
    data: {
      isPro: false,
      plan: 'free',
    },
  }),
}));

describe('SettingsPolished', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders settings sections without a second in-content navigation', () => {
    const { container } = render(
      <SettingsPolished
        artist={{ id: 'artist_1' } as Artist}
        onArtistUpdate={vi.fn()}
      />
    );

    // AuthShell owns Settings navigation. This content component must never
    // recreate a second sidebar beside the global shell rail.
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();

    // Account section should be rendered
    const firstSection = document.getElementById('account');
    expect(firstSection).toBeTruthy();
    expect(
      container.querySelectorAll('section[aria-label$="settings group"] > h3')
    ).toHaveLength(0);
    expect(screen.queryByText('ACCOUNT')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Account', level: 2 })
    ).toBeVisible();
  });

  it('renders only the focused section without recreating settings navigation', () => {
    render(
      <SettingsPolished
        artist={{ id: 'artist_1' } as Artist}
        onArtistUpdate={vi.fn()}
        focusSection='contacts'
      />
    );

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(document.getElementById('contacts')).toBeTruthy();
    expect(document.getElementById('touring')).toBeNull();
  });
});
