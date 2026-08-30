import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketingMetricCard } from './MarketingMetricCard';

describe('MarketingMetricCard', () => {
  it('renders the metric label and value without optional asides', () => {
    render(
      <MarketingMetricCard
        icon={<span aria-hidden='true'>•</span>}
        label='Next drop'
        value='Friday'
        className='metric-card'
        testId='next-drop-metric'
        valueClassName='metric-value'
      />
    );

    const card = screen.getByTestId('next-drop-metric');
    expect(card).toHaveClass('homepage-surface-card', 'metric-card');
    expect(screen.getByText('Next drop')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toHaveClass('metric-value');
    expect(card.querySelector('.text-tertiary-token')).toBeNull();
  });

  it('places valueAside beside the metric value', () => {
    render(
      <MarketingMetricCard
        icon={<span aria-hidden='true'>•</span>}
        label='Momentum'
        value='Building'
        valueAside='Presave is open'
        valueAsideClassName='metric-aside'
      />
    );

    const aside = screen.getByText('Presave is open');
    expect(aside).toHaveClass('metric-aside', 'text-xs');
    expect(aside.parentElement).toHaveClass('items-end', 'justify-between');
  });

  it('renders description copy under the metric value', () => {
    render(
      <MarketingMetricCard
        icon={<span aria-hidden='true'>•</span>}
        label='Fan action'
        value='Join in'
        description='Capture intent before release day.'
      />
    );

    const description = screen.getByText('Capture intent before release day.');
    expect(description).toHaveClass('text-xs', 'text-tertiary-token');
    expect(screen.queryByText('Presave is open')).not.toBeInTheDocument();
  });
});
