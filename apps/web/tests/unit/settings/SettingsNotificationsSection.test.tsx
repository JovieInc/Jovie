import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsAudienceSection } from '@/features/dashboard/organisms/SettingsAudienceSection';
import { SettingsNotificationsSection } from '@/features/dashboard/organisms/SettingsNotificationsSection';

interface ToggleConfig {
  readonly initialValue: boolean;
  readonly syncKey?: string | number | null;
  readonly mutateAsync: (enabled: boolean) => Promise<unknown>;
  readonly errorMessage: string;
  readonly showErrorToast?: boolean;
}

const {
  dashboardState,
  toggleConfigs,
  updateNotificationsAsync,
  updateSelectedProfileSettings,
} = vi.hoisted(() => ({
  dashboardState: {
    selectedProfile: {
      id: 'profile-1',
      settings: { require_double_opt_in: false },
    },
  },
  toggleConfigs: [] as ToggleConfig[],
  updateNotificationsAsync: vi.fn(),
  updateSelectedProfileSettings: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    ...dashboardState,
    updateSelectedProfileSettings,
  }),
}));

vi.mock('@/features/dashboard/hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: (config: ToggleConfig) => {
    toggleConfigs.push(config);
    return {
      checked: config.initialValue,
      handleToggle: vi.fn(),
    };
  },
}));

vi.mock('@/lib/queries', () => ({
  useNotificationSettingsMutation: () => ({
    updateNotificationsAsync,
    isPending: false,
  }),
}));

describe('SettingsNotificationsSection', () => {
  beforeEach(() => {
    dashboardState.selectedProfile = {
      id: 'profile-1',
      settings: { require_double_opt_in: false },
    };
    toggleConfigs.length = 0;
    updateNotificationsAsync.mockReset();
    updateSelectedProfileSettings.mockReset();
  });

  it('wires Double Opt-in to its persisted setting and mutation payload', async () => {
    render(<SettingsNotificationsSection isGrowth />);

    const toggle = screen.getByRole('switch', {
      name: 'Double Opt-in Verification',
    });
    const config = toggleConfigs[0];
    expect(config).toMatchObject({
      initialValue: false,
      syncKey: 'profile-1',
      errorMessage: 'Failed to update notification settings. Please try again.',
      showErrorToast: false,
    });
    await config?.mutateAsync(true);

    expect(updateNotificationsAsync).toHaveBeenCalledExactlyOnceWith({
      require_double_opt_in: true,
    });
    expect(updateSelectedProfileSettings).toHaveBeenCalledExactlyOnceWith(
      'profile-1',
      { require_double_opt_in: true }
    );
    expect(toggle.closest('.px-4')).toHaveClass('py-4', 'sm:px-5');
  });

  it('defaults Double Opt-in on when the stored setting is absent', () => {
    dashboardState.selectedProfile = {
      id: 'profile-2',
      settings: {},
    };
    render(<SettingsNotificationsSection isGrowth />);

    expect(toggleConfigs[0]).toMatchObject({
      initialValue: true,
      syncKey: 'profile-2',
    });
  });

  it('presents Max as the canonical upgrade for non-entitled accounts', () => {
    render(
      <TooltipProvider>
        <SettingsNotificationsSection />
      </TooltipProvider>
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('uses the same entitlement gate on the Audience surface', () => {
    const { rerender } = render(
      <TooltipProvider>
        <SettingsAudienceSection />
      </TooltipProvider>
    );
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <SettingsAudienceSection isGrowth />
      </TooltipProvider>
    );
    expect(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    ).toBeEnabled();
  });
});
