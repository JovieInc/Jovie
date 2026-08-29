import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingMetricCard } from './MarketingMetricCard';

function renderMetric(
  overrides: Partial<React.ComponentProps<typeof MarketingMetricCard>> = {}
) {
  return render(
    <MarketingMetricCard
      icon={<span data-testid='metric-icon' aria-hidden='true' />}
      label='Release reach'
      value='12,480'
      {...overrides}
    />
  );
}

describe('MarketingMetricCard', () => {
  it('renders the icon, label, and primary metric in the canonical card surface', () => {
    renderMetric({ testId: 'metric-card' });

    const card = screen.getByTestId('metric-card');
    expect(card).toHaveClass('homepage-surface-card', 'rounded-xl');
    expect(screen.getByTestId('metric-icon')).toBeInTheDocument();
    expect(screen.getByText('Release reach')).toBeInTheDocument();
    expect(screen.getByText('12,480')).toBeInTheDocument();
  });

  it('renders optional comparison and description content with caller class hooks', () => {
    renderMetric({
      className: 'metric-card-hook',
      valueClassName: 'metric-value-hook',
      valueAside: <span data-testid='metric-aside'>+18%</span>,
      valueAsideClassName: 'metric-aside-hook',
      description: (
        <span data-testid='metric-description'>
          Compared with last release.
        </span>
      ),
    });

    expect(screen.getByText('Release reach').parentElement).toHaveClass(
      'metric-card-hook'
    );
    expect(screen.getByText('12,480')).toHaveClass('metric-value-hook');
    expect(screen.getByTestId('metric-aside').parentElement).toHaveClass(
      'metric-aside-hook'
    );
    expect(screen.getByTestId('metric-description')).toBeInTheDocument();
  });

  it('omits optional comparison and description slots when they are not provided', () => {
    renderMetric();

    expect(screen.queryByTestId('metric-aside')).not.toBeInTheDocument();
    expect(screen.queryByTestId('metric-description')).not.toBeInTheDocument();
  });
});
