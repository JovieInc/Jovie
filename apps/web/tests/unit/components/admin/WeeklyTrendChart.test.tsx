import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock next/dynamic to render children synchronously
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>, _opts?: unknown) => {
    // Return a placeholder component for the lazy-loaded chart
    function DynamicChart() {
      return <div data-testid='recharts-placeholder' />;
    }
    DynamicChart.displayName = 'DynamicChart';
    return DynamicChart;
  },
}));

import {
  formatWeekLabel,
  WeeklyTrendChart,
} from '@/features/admin/WeeklyTrendChart';

const mockData = [
  {
    weekStart: '2026-03-16',
    scraped: 100,
    contacted: 40,
    signups: 10,
    paid: 2,
  },
  {
    weekStart: '2026-03-23',
    scraped: 120,
    contacted: 50,
    signups: 15,
    paid: 3,
  },
  { weekStart: '2026-03-30', scraped: 80, contacted: 30, signups: 8, paid: 1 },
  {
    weekStart: '2026-04-06',
    scraped: 150,
    contacted: 60,
    signups: 20,
    paid: 5,
  },
];

describe('WeeklyTrendChart', () => {
  it('renders with data', () => {
    render(<WeeklyTrendChart data={mockData} />);
    expect(screen.getByTestId('weekly-trend-chart')).toBeInTheDocument();
  });

  it('renders with empty data without crashing', () => {
    render(<WeeklyTrendChart data={[]} />);
    expect(screen.getByTestId('weekly-trend-chart')).toBeInTheDocument();
  });

  it('renders legend items', () => {
    render(<WeeklyTrendChart data={mockData} />);
    expect(screen.getByText('Scraped')).toBeInTheDocument();
    expect(screen.getByText('Contacted')).toBeInTheDocument();
    expect(screen.getByText('Signups')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
  });
});

describe('formatWeekLabel', () => {
  it('formats ISO date as short month + day', () => {
    expect(formatWeekLabel('2026-03-16')).toBe('Mar 16');
    expect(formatWeekLabel('2026-04-06')).toBe('Apr 6');
    expect(formatWeekLabel('2026-12-25')).toBe('Dec 25');
  });

  it('handles month boundaries correctly', () => {
    expect(formatWeekLabel('2026-01-01')).toBe('Jan 1');
    expect(formatWeekLabel('2026-02-28')).toBe('Feb 28');
  });
});
