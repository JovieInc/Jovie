import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentMetricDelta } from './ContentMetricDelta';

describe('ContentMetricDelta', () => {
  it('renders positive, negative, and flat deltas with semantic tone classes', () => {
    render(
      <div>
        <ContentMetricDelta
          polarity='higher-is-better'
          direction='up'
          value='+12.5%'
          data-testid='up'
        />
        <ContentMetricDelta
          polarity='higher-is-better'
          direction='down'
          value='-4.0%'
          data-testid='down'
        />
        <ContentMetricDelta
          polarity='higher-is-better'
          direction='flat'
          value='+0.0%'
          data-testid='flat'
        />
      </div>
    );

    expect(screen.getByTestId('up')).toHaveClass('text-success-text');
    expect(screen.getByTestId('down')).toHaveClass('text-error-text');
    expect(screen.getByTestId('flat')).toHaveClass('text-tertiary-token');
    expect(screen.getByText('+12.5%')).toBeInTheDocument();
    expect(screen.getByText('-4.0%')).toBeInTheDocument();
    expect(screen.getByText('+0.0%')).toBeInTheDocument();
  });

  it('uses hidden descriptive text instead of unsupported aria labeling', () => {
    render(
      <ContentMetricDelta
        polarity='higher-is-better'
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

  it('colors by sentiment, so a falling cost reads as good news', () => {
    render(
      <div>
        <ContentMetricDelta
          polarity='lower-is-better'
          direction='down'
          value='-8%'
          data-testid='cost-down'
        />
        <ContentMetricDelta
          polarity='lower-is-better'
          direction='up'
          value='+8%'
          data-testid='cost-up'
        />
        <ContentMetricDelta
          polarity='neutral'
          direction='up'
          value='+8%'
          data-testid='neutral'
        />
      </div>
    );

    expect(screen.getByTestId('cost-down')).toHaveClass('text-success-text');
    expect(screen.getByTestId('cost-up')).toHaveClass('text-error-text');
    expect(screen.getByTestId('neutral')).toHaveClass('text-tertiary-token');
  });
});
