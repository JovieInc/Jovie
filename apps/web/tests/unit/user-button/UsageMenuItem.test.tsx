import { act, render, screen } from '@testing-library/react';
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

  it('expands to exactly one weekly meter without an unexplained warning marker', async () => {
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
    expect(track.querySelectorAll('[data-threshold]')).toHaveLength(0);
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
    expect(screen.getByText('Usage may be out of date')).toBeInTheDocument();
    expect(screen.getByText('Last Known Weekly Messages')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
  it('does not claim a fresh balance after a failed refresh and exposes retry', async () => {
    const refetch = vi.fn().mockResolvedValue({ error: new Error('offline') });
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: new Error('offline'),
      refetch,
    });
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);
    expect(screen.getByText('7% (cached)')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /usage remaining/i })
    );
    expect(screen.queryByText('Updated now')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('usage-meter-state-label')
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry Usage' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
  it.each([
    { remaining: 1, stale: true },
    { remaining: 0, stale: true },
    { remaining: 1, stale: false },
    { remaining: 0, stale: false },
  ])(
    'does not urge upgrading from cached balance %j',
    async ({ remaining, stale }) => {
      mockUseChatUsageQuery.mockReturnValue({
        data: { ...baseUsage, remaining, used: 15 - remaining, _stale: stale },
        isLoading: false,
        error: stale ? null : new Error('offline'),
      });
      render(
        <UsageMenuItem
          usageStatsUrl={APP_ROUTES.SETTINGS_USAGE}
          onUpgrade={vi.fn()}
        />
      );
      await userEvent.click(
        screen.getByRole('button', { name: /usage remaining/i })
      );
      expect(
        screen.queryByRole('button', { name: /upgrade/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /upgrade|plans/i })
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('Last Known Weekly Messages')
      ).toBeInTheDocument();
    }
  );

  it.each(['success', 'failure', 'outside', 'stale'] as const)(
    'preserves intentional focus during retry: %s',
    async outcome => {
      let finish!: (value: unknown) => void;
      const refetch = vi.fn(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const query = {
        data: { ...baseUsage, _stale: true },
        error: null,
        isLoading: false,
        refetch,
      };
      mockUseChatUsageQuery.mockImplementation(() => query);
      const view = render(
        <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
      );
      const user = userEvent.setup();
      const toggle = screen.getByRole('button', { name: /usage remaining/i });
      await user.click(toggle);
      const retry = screen.getByRole('button', { name: 'Retry Usage' });
      retry.focus();
      await user.keyboard('{Enter}{Enter}');
      expect(refetch).toHaveBeenCalledOnce();
      expect(retry).toHaveFocus();
      expect(retry).toHaveAttribute('aria-disabled', 'true');
      const outside = screen.getByRole('link', { name: /learn more/i });
      if (outcome === 'outside') outside.focus();
      if (outcome === 'success' || outcome === 'outside') {
        query.data = { ...baseUsage, _stale: false };
        view.rerender(
          <UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />
        );
        expect(retry).toBeInTheDocument();
      }
      await act(async () => {
        finish(
          outcome === 'failure'
            ? { error: new Error('offline') }
            : { data: query.data, error: null }
        );
      });
      if (outcome === 'success') {
        expect(toggle).toHaveFocus();
        expect(
          screen.queryByRole('button', { name: 'Retry Usage' })
        ).not.toBeInTheDocument();
      } else if (outcome === 'outside') {
        expect(outside).toHaveFocus();
      } else {
        expect(retry).toHaveFocus();
        expect(
          screen.getByText('Last Known Weekly Messages')
        ).toBeInTheDocument();
      }
    }
  );
  it('retains cached counts and retry focus when refetch rejects', async () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: { ...baseUsage, _stale: true },
      isLoading: false,
      error: null,
      refetch: vi.fn().mockRejectedValue(new Error('offline')),
    });
    render(<UsageMenuItem usageStatsUrl={APP_ROUTES.SETTINGS_USAGE} />);
    await userEvent.click(
      screen.getByRole('button', { name: /usage remaining/i })
    );
    const retry = screen.getByRole('button', { name: 'Retry Usage' });
    await userEvent.click(retry);
    expect(retry).toHaveFocus();
    expect(screen.getByText('Last Known Weekly Messages')).toBeInTheDocument();
  });
});
