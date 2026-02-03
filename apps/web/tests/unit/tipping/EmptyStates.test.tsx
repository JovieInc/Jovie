import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TippingEmptyState,
  TippingMetricsSkeleton,
} from '@/components/tipping/EmptyStates';

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- Mock for next/image
    return <img {...props} />;
  },
}));

describe('TippingEmptyState', () => {
  it('renders no-venmo empty state correctly', () => {
    render(<TippingEmptyState type='no-venmo' animate={false} />);

    expect(screen.getByText('No Venmo Account Connected')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Connect your Venmo account to start receiving tips from your fans.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByAltText('Illustration of a disconnected Venmo account')
    ).toBeInTheDocument();
  });

  it('renders pending-metrics empty state correctly', () => {
    render(<TippingEmptyState type='pending-metrics' animate={false} />);

    expect(screen.getByText('Tipping Metrics Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your tipping metrics will appear here once you receive your first tip.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByAltText('Illustration of pending tipping metrics')
    ).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <TippingEmptyState
        type='no-venmo'
        animate={false}
        className='custom-class'
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('TippingMetricsSkeleton', () => {
  it('renders skeleton with default rows', () => {
    const { container } = render(<TippingMetricsSkeleton />);

    // Check that we have the expected number of skeleton rows (default is 3)
    const rows = container.querySelectorAll('.grid.grid-cols-3.gap-4.py-2');
    expect(rows.length).toBe(3);
  });

  it('renders skeleton with custom rows', () => {
    const { container } = render(<TippingMetricsSkeleton rows={5} />);

    // Check that we have the expected number of skeleton rows
    const rows = container.querySelectorAll('.grid.grid-cols-3.gap-4.py-2');
    expect(rows.length).toBe(5);
  });

  it('applies custom className', () => {
    const { container } = render(
      <TippingMetricsSkeleton className='custom-class' />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});
