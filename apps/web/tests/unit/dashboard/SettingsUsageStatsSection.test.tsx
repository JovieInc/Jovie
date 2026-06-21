import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsUsageStatsSection } from '@/features/dashboard/organisms/SettingsUsageStatsSection';
import type { ChatUsageData } from '@/lib/queries/useChatUsageQuery';

const mockUseChatUsageQuery = vi.fn();
const APP_ROOT = resolve(import.meta.dirname, '../../..');
const COMPONENT_PATH =
  'components/features/dashboard/organisms/SettingsUsageStatsSection.tsx';
const LEGACY_GEIST_VAR_PATTERN = new RegExp(['--', 'geist-'].join(''));

function readComponentSource() {
  return readFileSync(resolve(APP_ROOT, COMPONENT_PATH), 'utf8');
}

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
      'min-h-86'
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
      'min-h-86'
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
      'min-h-86'
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
    ).toHaveAttribute('value', '4');
    expect(
      screen.getByRole('progressbar', { name: 'Daily Messages usage' })
        .className
    ).toContain('[&::-webkit-progress-value]:bg-success');
    expect(
      screen.getByRole('progressbar', { name: 'Monthly Capacity usage' })
    ).toHaveAttribute('value', '24');
    expect(screen.getByText('Within Daily Limit')).toHaveClass(
      'border-success/25',
      'bg-success/10',
      'text-success'
    );
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
    expect(screen.getByText('Near Daily Limit')).toHaveClass(
      'border-warning/25',
      'bg-warning/10',
      'text-warning'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Daily Messages usage' })
        .className
    ).toContain('[&::-webkit-progress-value]:bg-warning');
    expect(screen.getByRole('link', { name: /view plans/i })).toHaveAttribute(
      'href',
      '/pricing'
    );
  });

  it('renders exhausted state on semantic error tokens', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: {
        ...baseUsage,
        used: 10,
        remaining: 0,
        monthlyUsed: 310,
        monthlyRemaining: 0,
        isExhausted: true,
      },
      isLoading: false,
      error: null,
    });

    render(<SettingsUsageStatsSection />);

    expect(
      screen.getByText("You've reached today's chat limit")
    ).toBeInTheDocument();
    expect(screen.getByText('Daily Limit Reached')).toHaveClass(
      'border-error/25',
      'bg-error/10',
      'text-error'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Daily Messages usage' })
    ).toHaveAttribute('value', '10');
    expect(
      screen.getByRole('progressbar', { name: 'Daily Messages usage' })
        .className
    ).toContain('[&::-webkit-progress-value]:bg-error');
  });

  it('keeps usage tones on semantic tokens instead of legacy Geist variables', () => {
    const source = readComponentSource();

    expect(source).not.toMatch(LEGACY_GEIST_VAR_PATTERN);
    expect(source).toContain('border-success/25');
    expect(source).toContain('border-warning/25');
    expect(source).toContain('border-error/25');
    expect(source).toContain('[&::-webkit-progress-value]:bg-success');
    expect(source).toContain('[&::-webkit-progress-value]:bg-warning');
    expect(source).toContain('[&::-webkit-progress-value]:bg-error');
  });
});
