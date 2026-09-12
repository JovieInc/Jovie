import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ContentMetricStat,
  ContentMetricStatSkeleton,
} from './ContentMetricStat';

describe('ContentMetricStat', () => {
  it('renders an unframed metric stat with tabular value styling', () => {
    render(<ContentMetricStat label='Current DAU' value='1,240' />);

    expect(screen.getByText('Current DAU')).toBeInTheDocument();
    expect(screen.getByText('1,240')).toHaveClass('tabular-nums');
  });

  it('renders a geometry-stable skeleton for chart stat loading', () => {
    const { container } = render(
      <ContentMetricStatSkeleton
        labelWidthClassName='w-24'
        valueWidthClassName='w-20'
      />
    );

    const skeleton = container.firstElementChild;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton?.querySelector('.w-24')).toBeInTheDocument();
    expect(skeleton?.querySelector('.w-20')).toBeInTheDocument();
  });
});
