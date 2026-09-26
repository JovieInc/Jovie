import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  TippingEmptyState,
  TippingMetricsSkeleton,
} from '@/components/features/pay/EmptyStates';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { readonly fill?: boolean }) => {
    return <img {...props} alt={props.alt ?? ''} />;
  },
}));

describe('TippingEmptyState', () => {
  it('renders no-venmo empty state correctly', () => {
    render(<TippingEmptyState type='no-venmo' animate={false} />);

    expect(screen.getByText('No Venmo Account Connected')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Connect your Venmo account to start receiving payments from your fans.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByAltText('Illustration of a disconnected Venmo account')
    ).toBeInTheDocument();
  });

  it('renders pending-metrics empty state correctly', () => {
    render(<TippingEmptyState type='pending-metrics' animate={false} />);

    expect(screen.getByText('Payment Metrics Coming Soon')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your payment metrics will appear here once you receive your first payment.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByAltText('Illustration of pending payment metrics')
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

  it('composes the canonical EmptyState molecule', () => {
    render(<TippingEmptyState type='no-venmo' animate={false} />);

    expect(screen.getByTestId('tipping-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('tipping-empty-state')).toHaveTextContent(
      'No Venmo Account Connected'
    );
  });

  it('keeps each tipping illustration inside the 36px EmptyState icon slot', () => {
    const { unmount } = render(
      <TippingEmptyState type='no-venmo' animate={false} />
    );
    assertIllustrationFitsSlot('Illustration of a disconnected Venmo account');
    unmount();

    render(<TippingEmptyState type='pending-metrics' animate={false} />);
    assertIllustrationFitsSlot('Illustration of pending payment metrics');
  });
});

function assertIllustrationFitsSlot(alt: string) {
  const image = screen.getByAltText(alt);
  const frame = image.parentElement;
  const slot = screen
    .getByTestId('tipping-empty-state')
    .querySelector('.h-9.w-9');

  expect(frame).not.toBeNull();
  expect(frame?.className).toContain('h-9');
  expect(frame?.className).toContain('w-9');
  expect(frame?.className).toContain('overflow-hidden');
  expect(frame?.className).not.toContain('h-24');
  expect(frame?.className).not.toContain('w-24');
  expect(slot).not.toBeNull();
  expect(slot?.contains(image)).toBe(true);
}

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
