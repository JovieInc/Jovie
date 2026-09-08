import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UsageMenuItem } from '@/components/organisms/user-button/UsageMenuItem';
import { APP_ROUTES } from '@/constants/routes';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries', () => ({
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

const baseUsage: ChatUsageData = {
  plan: 'free',
  weeklyLimit: 15,
  used: 14,
  remaining: 1,
  resetAt: '2026-05-30T19:27:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: true,
};

function mockUsage(data: ChatUsageData | undefined = baseUsage) {
  mockUseChatUsageQuery.mockReturnValue({
    data,
    isLoading: false,
    error: data ? null : new Error('usage unavailable'),
  });
}

describe('UsageMenuItem', () => {
  it('shows the weekly remaining percentage in the collapsed menu', () => {
    mockUsage();
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);

    const usageButton = screen.getByRole('button', {
      name: /usage remaining/i,
    });
    expect(usageButton).toHaveClass('min-h-8');
    expect(usageButton.querySelector('svg.lucide-gauge')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('expands to exactly one weekly meter with one warning marker', async () => {
    mockUsage();
    const user = userEvent.setup();
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);

    await user.click(screen.getByRole('button', { name: /usage remaining/i }));

    const meter = screen.getByRole('progressbar', {
      name: 'Weekly Messages remaining',
    });
    expect(meter).toHaveAttribute('value', '1');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    const track = screen.getByTestId('usage-meter-track');
    expect(track.querySelectorAll('[data-threshold]')).toHaveLength(1);
    expect(track.querySelector('[data-threshold="warning"]')).toHaveStyle({
      left: '20%',
    });
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_USAGE
    );
  });

  it('surfaces the free-plan upsell when the weekly balance is low', async () => {
    mockUsage();
    const onUpgrade = vi.fn();
    const user = userEvent.setup();
    render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={onUpgrade}
        upgradeLabel='Upgrade to Pro'
      />
    );

    await user.click(screen.getByRole('button', { name: /usage remaining/i }));
    await user.click(screen.getByRole('button', { name: /upgrade to pro/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the disclosure from the keyboard', async () => {
    mockUsage();
    const user = userEvent.setup();
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);

    await user.tab();
    const toggle = screen.getByRole('button', { name: /usage remaining/i });
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('labels a stale weekly snapshot without inventing another metric', async () => {
    mockUsage({ ...baseUsage, _stale: true });
    const user = userEvent.setup();
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);

    await user.click(screen.getByRole('button', { name: /usage remaining/i }));
    expect(screen.getByText('Sync delayed')).toBeInTheDocument();
    expect(screen.getByText('Weekly Messages')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
});
