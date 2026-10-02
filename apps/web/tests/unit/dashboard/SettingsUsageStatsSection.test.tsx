import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { SettingsUsageStatsSection } from '../../../components/features/dashboard/organisms/SettingsUsageStatsSection';

const mockUseChatUsageQuery = vi.fn();
const refetch = vi.fn();
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
  weeklyLimit: 15,
  used: 4,
  remaining: 11,
  resetAt: '2026-10-08T07:00:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
  isNearLimit: false,
};
function mockUsage(
  data: ChatUsageData | undefined = baseUsage,
  overrides = {}
) {
  mockUseChatUsageQuery.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch,
    isFetching: false,
    ...overrides,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsUsageStatsSection', () => {
  it('shows an accessible compact loading state without claiming a balance', () => {
    mockUsage(undefined, { data: undefined, isLoading: true });
    render(<SettingsUsageStatsSection />);
    expect(
      screen.getByRole('status', { name: 'Loading Usage' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel')).not.toHaveClass(
      'min-h-96'
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it.each([null, new Error('offline')])(
    'treats missing data as unavailable and supports retry: %s',
    async error => {
      mockUsage(undefined, { data: undefined, error });
      render(<SettingsUsageStatsSection />);
      expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
      expect(screen.queryByText('No usage recorded')).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledOnce();
    }
  );

  it('shows one status, count, remaining balance, real reset and existing plan control', () => {
    mockUsage();
    render(<SettingsUsageStatsSection />);
    expect(screen.getByText('AI Message Usage')).toBeInTheDocument();
    expect(screen.getByText('Free plan')).toBeInTheDocument();
    expect(screen.getByText('4 of 15 used')).toBeInTheDocument();
    expect(screen.getByText('11 left')).toBeInTheDocument();
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Available'
    );
    expect(screen.queryByText(/on pace/i)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '11');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Manage Plan' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
    expect(
      screen.getByTestId('usage-meter-track').querySelector('[data-threshold]')
    ).toBeNull();
    expect(screen.getByText(/^Resets /)).toBeInTheDocument();
  });

  it.each([{ _stale: true }, { error: new Error('refresh failed') }])(
    'labels cached observations and retries without asserting current status: %j',
    async state => {
      mockUsage(
        { ...baseUsage, _stale: '_stale' in state },
        { error: 'error' in state ? state.error : null }
      );
      render(<SettingsUsageStatsSection />);
      expect(screen.getByText('Usage may be out of date.')).toBeInTheDocument();
      expect(
        screen.getByText('Last Known Weekly Messages')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('usage-meter-state-label')
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(refetch).toHaveBeenCalledOnce();
    }
  );

  it('retains the paid plan CTA at the warning boundary', () => {
    mockUsage({
      ...baseUsage,
      plan: 'pro',
      weeklyLimit: 70,
      used: 56,
      remaining: 14,
      warningThreshold: 14,
    });
    render(<SettingsUsageStatsSection />);
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Near limit'
    );
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });

  it('shows over-limit usage without truncating consumption', () => {
    mockUsage({ ...baseUsage, used: 18, remaining: 0 });
    render(<SettingsUsageStatsSection />);
    expect(screen.getByText('18 of 15 used')).toBeInTheDocument();
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Limit reached'
    );
  });

  it('keeps zero allowance distinct from unlimited and unknown', () => {
    mockUsage({
      ...baseUsage,
      weeklyLimit: 0,
      used: 0,
      remaining: 0,
      resetAt: null,
    });
    render(<SettingsUsageStatsSection />);
    expect(screen.getByText('0 of 0 used')).toBeInTheDocument();
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'No allowance'
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('Reset timing unavailable')).toBeInTheDocument();
  });

  it('hides invalid balances rather than inventing an unlimited contract', () => {
    mockUsage({ ...baseUsage, weeklyLimit: Number.POSITIVE_INFINITY });
    render(<SettingsUsageStatsSection />);
    expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
