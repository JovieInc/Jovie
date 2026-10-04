import { act, render, screen, waitFor } from '@testing-library/react';
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
  refetch.mockResolvedValue({ data: undefined, error: new Error('offline') });
});

describe('SettingsUsageStatsSection', () => {
  it('keeps Retry available and focused after a failed keyboard retry', async () => {
    const user = userEvent.setup();
    let rejectRetry!: (reason: Error) => void;
    const refetch = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectRetry = reject;
        })
    );
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Offline'),
      refetch,
    });
    render(<SettingsUsageStatsSection />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    retry.focus();
    await user.keyboard('{Enter}');
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retrying…' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByText('Checking your latest usage…')).toBeVisible();
    expect(screen.queryByText('No usage recorded')).not.toBeInTheDocument();
    await act(async () => rejectRetry(new Error('Still offline')));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(retry).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Usage unavailable');
  });

  it('focuses the verified usage result after Retry succeeds', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (result: { data: ChatUsageData; error: null }) => void;
    const refetch = vi.fn(
      () =>
        new Promise<{ data: ChatUsageData; error: null }>(resolve => {
          resolveRetry = resolve;
        })
    );
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Unavailable'),
      refetch,
    });
    const view = render(<SettingsUsageStatsSection />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
      refetch,
    });
    await act(async () => resolveRetry({ data: baseUsage, error: null }));
    view.rerender(<SettingsUsageStatsSection />);
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Weekly Usage' })).toHaveFocus()
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '11');
    expect(
      screen.queryByRole('button', { name: /retry/i })
    ).not.toBeInTheDocument();
  });

  it('preserves focus outside the panel when Retry completes', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (result: { data: ChatUsageData; error: null }) => void;
    const refetch = vi.fn(
      () =>
        new Promise<{ data: ChatUsageData; error: null }>(resolve => {
          resolveRetry = resolve;
        })
    );
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Offline'),
      refetch,
    });
    const content = (
      <>
        <SettingsUsageStatsSection />
        <button type='button'>Next Setting</button>
      </>
    );
    const view = render(content);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Next Setting' })).toHaveFocus();
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
      refetch,
    });
    await act(async () => resolveRetry({ data: baseUsage, error: null }));
    view.rerender(
      <>
        <SettingsUsageStatsSection />
        <button type='button'>Next Setting</button>
      </>
    );
    expect(screen.getByRole('button', { name: 'Next Setting' })).toHaveFocus();
    expect(
      screen.getByRole('region', { name: 'Weekly Usage' })
    ).not.toHaveFocus();
  });

  it('does not move focus when a failed retry later recovers in the background', async () => {
    const user = userEvent.setup();
    const error = new Error('Still unavailable');
    const refetch = vi.fn().mockResolvedValue({ data: undefined, error });
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
      refetch,
    });
    const view = render(<SettingsUsageStatsSection />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();

    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
      refetch,
    });
    view.rerender(<SettingsUsageStatsSection />);
    expect(
      screen.getByRole('region', { name: 'Weekly Usage' })
    ).not.toHaveFocus();
  });

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
  it('retains the last known counts and focus while a retry fails, then accepts background recovery without stealing focus', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (value: { data: ChatUsageData; error: Error }) => void;
    refetch.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRetry = resolve;
        })
    );
    mockUsage(baseUsage, { error: new Error('Offline') });
    const view = render(<SettingsUsageStatsSection />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    await user.click(retry);
    expect(screen.getByText('4 of 15 used')).toBeVisible();
    expect(screen.getByText('Last Known Weekly Messages')).toBeVisible();
    expect(screen.getByText('Checking your latest usage…')).toBeVisible();
    expect(retry).toHaveFocus();
    await act(async () =>
      resolveRetry({ data: baseUsage, error: new Error('Offline') })
    );
    expect(screen.getByText('4 of 15 used')).toBeVisible();
    expect(retry).toHaveFocus();
    mockUsage({ ...baseUsage });
    view.rerender(<SettingsUsageStatsSection />);
    expect(screen.getByTestId('usage-meter-state-label')).toHaveTextContent(
      'Available'
    );
    expect(
      screen.getByRole('region', { name: 'Weekly Usage' })
    ).not.toHaveFocus();
  });

  it('keeps the retry control mounted if fresh query data arrives before refetch settles', async () => {
    const user = userEvent.setup();
    let resolveRetry!: (value: { data: ChatUsageData; error: null }) => void;
    refetch.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveRetry = resolve;
        })
    );
    mockUsage(undefined, { data: undefined, error: new Error('Offline') });
    const view = render(<SettingsUsageStatsSection />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    await user.click(retry);
    mockUsage(baseUsage);
    view.rerender(<SettingsUsageStatsSection />);
    expect(screen.getByRole('button', { name: 'Retrying…' })).toBe(retry);
    expect(retry).toHaveFocus();
    await act(async () => resolveRetry({ data: baseUsage, error: null }));
    expect(screen.getByRole('region', { name: 'Weekly Usage' })).toHaveFocus();
  });

  it('does not call a cached response a verified successful retry', async () => {
    const cached = { ...baseUsage, _stale: true };
    refetch.mockResolvedValue({ data: cached, error: null });
    mockUsage(cached);
    render(<SettingsUsageStatsSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Last Known Weekly Messages')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
    expect(
      screen.getByRole('region', { name: 'Weekly Usage' })
    ).not.toHaveFocus();
  });

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
