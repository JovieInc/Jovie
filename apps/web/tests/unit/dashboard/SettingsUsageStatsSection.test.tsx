import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsUsageStatsSection } from '@/features/dashboard/organisms/SettingsUsageStatsSection';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const mockUseChatUsageQuery = vi.fn();

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
  useChatUsageQuery: () => mockUseChatUsageQuery(),
}));

const baseUsage: ChatUsageData = {
  plan: 'free',
  dailyLimit: 10,
  used: 4,
  remaining: 6,
  resetAt: '2026-05-23T07:00:00.000Z',
  monthlyLimit: 310,
  monthlyUsed: 24,
  monthlyRemaining: 286,
  monthlyResetAt: '2026-06-01T00:00:00.000Z',
  isExhausted: false,
  warningThreshold: 2,
  isNearLimit: false,
};

describe('SettingsUsageStatsSection', () => {
  it('reserves one stable usage panel while loading', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(screen.getByTestId('settings-usage-panel').className).toContain(
      'min-h-[342px]'
    );
  });

  it('renders an empty state without changing the panel geometry', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(screen.getByText('No usage recorded')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel').className).toContain(
      'min-h-[342px]'
    );
  });

  it('renders an error state without changing the panel geometry', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('No usage'),
    });

    render(<SettingsUsageStatsSection />);

    expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel').className).toContain(
      'min-h-[342px]'
    );
  });

  it('renders daily and monthly progress for a free plan', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(
      screen.getByText("You're within today's chat limit")
    ).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Daily Messages usage' })
    ).toHaveAttribute('aria-valuenow', '4');
    expect(
      screen.getByRole('progressbar', { name: 'Monthly Capacity usage' })
    ).toHaveAttribute('aria-valuenow', '24');
    expect(screen.getByText('6 left')).toBeInTheDocument();
    expect(screen.getByText('286 left')).toBeInTheDocument();
  });

  it('renders pro plan state and plan action when near the limit', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...baseUsage,
        plan: 'pro',
        dailyLimit: 100,
        used: 96,
        remaining: 4,
        monthlyLimit: 3100,
        monthlyUsed: 1400,
        monthlyRemaining: 1700,
        warningThreshold: 5,
        isNearLimit: true,
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(
      screen.getByText("You're almost out of messages")
    ).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });
});
