import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { expectFlatState } from '@/tests/utils/flat-state';
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

  it('sits flat with no glass card, fill, border or shadow', () => {
    const { container } = render(
      <TippingEmptyState type='no-venmo' animate={false} className='mt-4' />
    );
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveClass('p-8', 'text-center', 'mt-4');
    expectFlatState(container);
  });

  it('renders the same flat state with the default mount animation', async () => {
    // The test setup renders motion elements as passthroughs.
    const { container } = render(<TippingEmptyState type='pending-metrics' />);

    expectFlatState(container);
    expect(container.querySelector('.rounded-2xl')).toBeNull();
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
  it('draws the requested table rows flat, hidden from assistive tech', async () => {
    const { container } = render(<TippingMetricsSkeleton rows={2} />);
    const root = container.firstElementChild as HTMLElement;

    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.querySelectorAll('.grid.grid-cols-3.py-2')).toHaveLength(2);
    expect(root.querySelectorAll('.rounded-2xl')).toHaveLength(0);
    expectFlatState(root);
    await expectNoA11yViolations(container);
  });
});
