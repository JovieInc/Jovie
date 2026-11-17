import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TippingEmptyState, TippingMetricsSkeleton } from './EmptyStates';

vi.mock('next/image', () => ({
  default: ({
    fill: _fill,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { readonly fill?: boolean }) => (
    <img {...props} alt={props.alt ?? ''} />
  ),
}));

describe('TippingEmptyState', () => {
  it.each([
    ['no-venmo', 'No Venmo Account Connected'],
    ['pending-metrics', 'Payment Metrics Coming Soon'],
  ] as const)('renders the %s empty state axe-clean', async (type, heading) => {
    const { container } = render(
      <TippingEmptyState type={type} animate={false} />
    );

    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByTestId('tipping-empty-state')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('paints the glass card with on-media tokens instead of raw white and black', () => {
    const { container } = render(
      <TippingEmptyState type='no-venmo' animate={false} className='mt-4' />
    );
    const card = container.firstElementChild as HTMLElement;

    expect(card).toHaveClass(
      'bg-on-media/60',
      'dark:bg-on-media/5',
      'shadow-ink-on-media/5',
      'mt-4'
    );
    expect(card.className).not.toMatch(/bg-white|shadow-black/);
  });

  it('renders the same token card with the default mount animation', async () => {
    // The test setup renders motion elements as passthroughs.
    const { container } = render(<TippingEmptyState type='pending-metrics' />);

    expect(container.querySelector('.rounded-2xl')).toHaveClass(
      'bg-on-media/60'
    );
    expect(screen.getByText('Payment Metrics Coming Soon')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TippingEmptyState type='no-venmo' animate={false} />
      </div>
    );

    expect(screen.getByText('No Venmo Account Connected')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('TippingMetricsSkeleton', () => {
  it('draws the requested table rows on token surfaces, hidden from assistive tech', async () => {
    const { container } = render(<TippingMetricsSkeleton rows={2} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelectorAll('.grid.grid-cols-3.py-2')).toHaveLength(2);
    for (const card of root.querySelectorAll('.rounded-2xl')) {
      expect(card).toHaveClass('bg-on-media/60', 'dark:bg-on-media/5');
    }
    await expectNoA11yViolations(container);
  });
});
