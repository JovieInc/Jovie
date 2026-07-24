import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderUsagePill } from '@/features/dashboard/atoms/HeaderUsagePill';
import { fastRender } from '@/tests/utils/fast-render';

const mockUseUsageSummaryQuery = vi.fn();
const mockUsePathname = vi.fn(() => '/app');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock('@/lib/queries', () => ({
  useUsageSummaryQuery: () => mockUseUsageSummaryQuery(),
}));

const SUMMARY = {
  plan: 'pro' as const,
  planDisplayName: 'Pro',
  suggestions: {
    used: 12,
    limit: 75,
    remaining: 63,
    remainingPercent: 84,
    resetAt: '2026-07-06T00:00:00.000Z',
  },
  liveActions: {
    used: 3,
    limit: 25,
    remaining: 22,
    resetAt: '2026-07-02T16:00:00.000Z',
  },
  remainingPercent: 84,
};

describe('HeaderUsagePill', () => {
  it('renders the overall remaining percent in the pill', () => {
    mockUseUsageSummaryQuery.mockReturnValue({ data: SUMMARY });

    const { getByTestId } = fastRender(<HeaderUsagePill />);

    expect(getByTestId('usage-pill').textContent).toContain('84%');
  });

  it('reserves the pill footprint while loading (no layout shift)', () => {
    mockUseUsageSummaryQuery.mockReturnValue({ data: undefined });

    const { getByTestId, queryByTestId } = fastRender(<HeaderUsagePill />);

    expect(getByTestId('usage-pill-loading')).toBeDefined();
    expect(queryByTestId('usage-pill')).toBeNull();
  });

  it('opens the limits popover with plan, weekly, 5-hr, and learn-more rows', () => {
    mockUseUsageSummaryQuery.mockReturnValue({ data: SUMMARY });

    const { getByTestId, getByText, getByRole } = fastRender(
      <HeaderUsagePill />
    );

    fireEvent.click(getByTestId('usage-pill'));

    expect(getByText('Jovie Usage · Pro')).toBeDefined();
    expect(getByText('Suggestions')).toBeDefined();
    expect(getByText(/This week · 84% left/)).toBeDefined();
    expect(getByText(/Resets Mon/)).toBeDefined();
    expect(getByText('Live actions')).toBeDefined();
    expect(getByText(/5-hr window · 3\/25/)).toBeDefined();
    expect(
      getByRole('link', { name: 'Learn more about limits' })
    ).toBeDefined();
  });

  it('renders nothing on demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase');
    mockUseUsageSummaryQuery.mockReturnValue({ data: SUMMARY });

    const { queryByTestId } = fastRender(<HeaderUsagePill />);

    expect(queryByTestId('usage-pill')).toBeNull();
    expect(queryByTestId('usage-pill-loading')).toBeNull();
  });
});
