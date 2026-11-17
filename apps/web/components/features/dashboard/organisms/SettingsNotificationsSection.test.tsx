import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsNotificationsSection } from './SettingsNotificationsSection';

const { dashboard, mutation, track } = vi.hoisted(() => ({
  dashboard: {
    selectedProfile: {
      id: 'profile-1',
      settings: { require_double_opt_in: true },
    } as null | { id: string; settings: Record<string, unknown> },
    updateSelectedProfileSettings: vi.fn(),
  },
  mutation: { updateNotificationsAsync: vi.fn(), isPending: false },
  track: vi.fn(),
}));

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  useDashboardData: () => dashboard,
}));
vi.mock('@/lib/queries', () => ({
  useNotificationSettingsMutation: () => mutation,
}));
vi.mock('@/lib/analytics', () => ({ track }));

const SWITCH = { name: 'Double Opt-in Verification' };

function renderSection(isGrowth: boolean, dir?: 'rtl') {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <SettingsNotificationsSection isGrowth={isGrowth} />
      </div>
    </TooltipProvider>
  );
}

beforeEach(() => {
  dashboard.selectedProfile = {
    id: 'profile-1',
    settings: { require_double_opt_in: true },
  };
  dashboard.updateSelectedProfileSettings.mockReset();
  mutation.updateNotificationsAsync.mockReset();
  mutation.isPending = false;
  track.mockReset();
});

describe('SettingsNotificationsSection certificate', () => {
  it('saves the double opt-in choice and syncs the profile', async () => {
    const user = userEvent.setup();
    mutation.updateNotificationsAsync.mockResolvedValue({});
    const { container } = renderSection(true);

    const control = screen.getByRole('switch', SWITCH);
    expect(control).toBeChecked();
    await user.click(control);

    await waitFor(() =>
      expect(mutation.updateNotificationsAsync).toHaveBeenCalledWith({
        require_double_opt_in: false,
      })
    );
    expect(dashboard.updateSelectedProfileSettings).toHaveBeenCalledWith(
      'profile-1',
      { require_double_opt_in: false }
    );
    expect(control).not.toBeChecked();
    await expectNoA11yViolations(container);
  });

  it('reverts the switch when the save fails', async () => {
    const user = userEvent.setup();
    mutation.updateNotificationsAsync.mockRejectedValue(new Error('offline'));
    const { container } = renderSection(true);

    const control = screen.getByRole('switch', SWITCH);
    await user.click(control);

    await waitFor(() => expect(control).toBeChecked());
    expect(dashboard.updateSelectedProfileSettings).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('disables the switch while saving or without a profile', async () => {
    mutation.isPending = true;
    const pending = renderSection(true);
    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
    await expectNoA11yViolations(pending.container);
    pending.unmount();

    mutation.isPending = false;
    dashboard.selectedProfile = null;
    renderSection(true);
    expect(screen.getByRole('switch', SWITCH)).toBeDisabled();
  });

  it('shows the Max upgrade gate instead of the switch below Growth', async () => {
    const user = userEvent.setup();
    const { container } = renderSection(false);

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    const upgrade = screen.getByRole('link', { name: 'Upgrade to Max' });
    await user.click(upgrade);
    expect(track).toHaveBeenCalledWith('upgrade_nudge_clicked', {
      feature: 'Double opt-in confirmation',
      plan_required: 'Max',
    });
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    const { container } = renderSection(true, 'rtl');
    expect(screen.getByRole('switch', SWITCH)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
