import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';
import { SettingsUsageStatsSection } from '../../../components/features/dashboard/organisms/SettingsUsageStatsSection';

const mockUseChatUsageQuery = vi.fn();
const APP_ROOT = resolve(import.meta.dirname, '../../..');
const COMPONENT_PATH = 'components/molecules/UsageMeter.tsx';
const LEGACY_GEIST_VAR_PATTERN = new RegExp(['--', 'geist-'].join(''));

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
  resetAt: '2026-05-30T07:00:00.000Z',
  isExhausted: false,
  warningThreshold: 3,
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
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass(
      'min-h-64',
      'sm:min-h-56'
    );
  });

  it('renders empty and error states without changing panel geometry', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    const { rerender } = render(<SettingsUsageStatsSection />);
    expect(screen.getByText('No usage recorded')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass(
      'min-h-64',
      'sm:min-h-56'
    );

    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('No usage'),
    });
    rerender(<SettingsUsageStatsSection />);
    expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass(
      'min-h-64',
      'sm:min-h-56'
    );
  });

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

  it('renders exactly one healthy weekly meter', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: baseUsage,
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(
      screen.getByText("You're within this week's chat limit")
    ).toBeInTheDocument();
    const meter = screen.getByRole('progressbar', {
      name: 'Weekly Messages remaining',
    });
    expect(meter).toHaveAttribute('value', '11');
    expect(meter).toHaveAttribute('max', '15');
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(
      screen
        .getByTestId('usage-meter-track')
        .querySelectorAll('[data-threshold]')
    ).toHaveLength(1);
    expect(screen.getByText('Within Weekly Limit')).toHaveAttribute(
      'data-variant',
      'outline'
    );
  });

  it('shows stale state without hiding the verified weekly snapshot', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: { ...baseUsage, _stale: true },
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);
    expect(
      screen.getByText(/usage counts may be cached while billing syncs/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Weekly Messages')).toBeInTheDocument();
  });

  it('turns the meter warning at the single 20 percent boundary', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...baseUsage,
        plan: 'pro',
        weeklyLimit: 70,
        used: 56,
        remaining: 14,
        warningThreshold: 14,
        isNearLimit: true,
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);
    const meter = screen.getByRole('progressbar', {
      name: 'Weekly Messages remaining',
    });
    const track = screen.getByTestId('usage-meter-track');
    expect(meter).toHaveAttribute('value', '14');
    expect(screen.getByTestId('usage-meter-fill')).toHaveClass('bg-warning');
    expect(track.querySelector('[data-threshold="warning"]')).toHaveStyle({
      left: '20%',
    });
    expect(screen.getByText('Near Weekly Limit')).toHaveAttribute(
      'data-variant',
      'outline'
    );
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });

  it('turns the meter error only when exhausted', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...baseUsage,
        used: 15,
        remaining: 0,
        isExhausted: true,
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);
    expect(
      screen.getByText("You've reached this week's chat limit")
    ).toBeInTheDocument();
    expect(screen.getByText('Weekly Limit Reached')).toHaveAttribute(
      'data-variant',
      'outline'
    );
    const meter = screen.getByRole('progressbar', {
      name: 'Weekly Messages remaining',
    });
    expect(meter).toHaveAttribute('value', '0');
    expect(screen.getByTestId('usage-meter-fill')).toHaveClass('bg-error');
  });

  it('keeps usage tones and the warning line on semantic tokens', () => {
    const source = readFileSync(resolve(APP_ROOT, COMPONENT_PATH), 'utf8');

    expect(source).not.toMatch(LEGACY_GEIST_VAR_PATTERN);
    expect(source).toContain('bg-accent');
    expect(source).toContain('bg-warning');
    expect(source).toContain('bg-error');
    expect(source).toContain("data-threshold='warning'");
  });
});
