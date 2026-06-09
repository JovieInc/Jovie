import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsCard } from '@/components/features/dashboard/atoms/AnalyticsCard';

describe('AnalyticsCard', () => {
  it('renders the default card variant with ContentMetricCard chrome', () => {
    const { container } = render(
      <AnalyticsCard title='Active listeners' value={128} />
    );

    expect(screen.getByText('Active listeners')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('renders the hero variant without card chrome and with hero typography', () => {
    render(
      <AnalyticsCard
        variant='hero'
        title='Monthly Recurring Revenue'
        value='$847.00'
        ariaLabel='Monthly recurring revenue: $847.00'
      />
    );

    const value = screen.getByText('$847.00');
    expect(value).toHaveClass('text-[36px]');
    expect(value).toHaveClass('font-bold');
    expect(value).toHaveClass('tracking-[-0.03em]');
    expect(
      screen.getByLabelText('Monthly recurring revenue: $847.00')
    ).toBeInTheDocument();
  });
});
