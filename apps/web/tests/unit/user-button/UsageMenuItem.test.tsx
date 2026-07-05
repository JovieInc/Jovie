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
  dailyLimit: 10,
  used: 9,
  remaining: 1,
  resetAt: '2026-05-23T19:27:00.000Z',
  monthlyLimit: 310,
  monthlyUsed: 24,
  monthlyRemaining: 286,
  monthlyResetAt: '2026-06-01T00:00:00.000Z',
  isExhausted: false,
  warningThreshold: 2,
  isNearLimit: true,
};

describe('UsageMenuItem', () => {
  it('shows a collapsed usage remaining percent for authed menu users', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
    });

    render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={vi.fn()}
      />
    );

    expect(screen.getByText('Usage remaining')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('expands inline to daily and monthly breakdown without navigating away', async () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
    });

    const user = userEvent.setup();
    render(
      <UsageMenuItem
        usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
        onUpgrade={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /usage remaining/i }));

    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText(/10% ·/)).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('Monthly').closest('div')?.textContent).toMatch(
      /92% · (May 31|Jun 1)/
    );
    expect(screen.getByRole('link', { name: /learn more/i })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_USAGE
    );
  });

  it('surfaces a neutral upgrade nudge when near the limit', async () => {
    const onUpgrade = vi.fn();
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
    });

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
});
