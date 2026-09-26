import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentMetricDelta } from './ContentMetricDelta';

describe('ContentMetricDelta', () => {
  it('renders positive, negative, and flat deltas with semantic tone classes', () => {
    render(
      <div>
        <ContentMetricDelta direction='up' value='+12.5%' data-testid='up' />
        <ContentMetricDelta direction='down' value='-4.0%' data-testid='down' />
        <ContentMetricDelta direction='flat' value='+0.0%' data-testid='flat' />
      </div>
    );

    expect(screen.getByTestId('up')).toHaveClass('text-success');
    expect(screen.getByTestId('down')).toHaveClass('text-error');
    expect(screen.getByTestId('flat')).toHaveClass('text-tertiary-token');
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
    expect(screen.getByText('-4.0%')).toBeInTheDocument();
    expect(screen.getByText('+0.0%')).toBeInTheDocument();
  });

  it('uses hidden descriptive text instead of unsupported aria labeling', () => {
    render(
      <ContentMetricDelta
        direction='up'
        value='+12.5%'
        aria-label='Daily active users changed by 12.5%'
        data-testid='delta'
      />
    );

    expect(screen.getByTestId('delta')).not.toHaveAttribute('aria-label');
    expect(screen.getByText('Daily active users changed by 12.5%')).toHaveClass(
      'sr-only'
    );
    expect(screen.getByText('+12.5%')).toHaveAttribute('aria-hidden', 'true');
  });
});
