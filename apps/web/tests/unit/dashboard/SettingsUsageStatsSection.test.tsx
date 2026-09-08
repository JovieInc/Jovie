import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass('min-h-96');
  });

  it('renders empty and error states without changing panel geometry', () => {
    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    const { rerender } = render(<SettingsUsageStatsSection />);
    expect(screen.getByText('No usage recorded')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass('min-h-96');

    mockUseChatUsageQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('No usage'),
    });
    rerender(<SettingsUsageStatsSection />);
    expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
    expect(screen.getByTestId('settings-usage-panel')).toHaveClass('min-h-96');
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
    expect(screen.getByText('Within Weekly Limit')).toHaveClass(
      'border-success/25'
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
    expect(screen.getByText('Near Weekly Limit')).toHaveClass(
      'border-warning/25'
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
    expect(screen.getByText('Weekly Limit Reached')).toHaveClass(
      'border-error/25',
      'bg-error/10',
      'text-error'
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
