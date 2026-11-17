import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsAudienceSection } from './SettingsAudienceSection';

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => ({
    selectedProfile: {
      id: 'profile-1',
      settings: { require_double_opt_in: false },
    },
    updateSelectedProfileSettings: vi.fn(),
  }),
}));
vi.mock('@/lib/queries', () => ({
  useNotificationSettingsMutation: () => ({
    updateNotificationsAsync: vi.fn(),
    isPending: false,
  }),
}));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

function renderSection(isGrowth?: boolean) {
  return render(
    <TooltipProvider>
      <SettingsAudienceSection isGrowth={isGrowth} />
    </TooltipProvider>
  );
}

describe('SettingsAudienceSection certificate', () => {
  it('renders the verification panel with the live switch on Growth', async () => {
    const { container } = renderSection(true);
    expect(screen.getByText('Verification')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Double Opt-in Verification' })
    ).not.toBeChecked();
    await expectNoA11yViolations(container);
  });

  it('defaults to the gated row when the plan is not passed', async () => {
    const { container } = renderSection();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Upgrade to Max' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
