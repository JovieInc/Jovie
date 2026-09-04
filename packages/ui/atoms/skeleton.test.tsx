import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSkeleton, Skeleton } from './skeleton';

const skeleton = () => screen.getByTestId('skeleton');

describe('Skeleton', () => {
  it('renders the canonical decorative shimmer owner', () => {
    render(<Skeleton data-testid='skeleton' />);

    expect(skeleton()).toMatchObject({ tagName: 'DIV' });
    expect(skeleton()).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton()).toHaveAttribute('data-slot', 'skeleton');
    expect(skeleton()).toHaveAttribute('data-state', 'shimmer');
    expect(skeleton()).toHaveClass('skeleton', 'rounded-sm');
  });

  it('renders the static token fill without shimmer', () => {
    render(<Skeleton data-testid='skeleton' shimmer={false} />);

    expect(skeleton()).toHaveAttribute('data-state', 'static');
    expect(skeleton()).toHaveClass('bg-surface-1');
    expect(skeleton()).not.toHaveClass('skeleton');
  });

  it('keeps canonical semantics when caller attrs conflict', () => {
    render(
      <Skeleton
        aria-hidden='false'
        data-state='static'
        data-testid='skeleton'
      />
    );

    expect(skeleton()).toHaveAttribute('aria-hidden', 'true');
    expect(skeleton()).toHaveAttribute('data-state', 'shimmer');
  });

  it.each([
    'none',
    'sm',
    'md',
    'lg',
    'full',
  ] as const)('renders the %s radius token', rounded => {
    render(<Skeleton data-testid='skeleton' rounded={rounded} />);
    expect(skeleton()).toHaveClass(`rounded-${rounded}`);
  });
});

describe('LoadingSkeleton', () => {
  it('renders one named owner with canonical defaults', () => {
    render(<LoadingSkeleton />);

    const owner = screen.getByRole('status', { name: 'Loading content' });
    expect(owner).toHaveAttribute('aria-busy', 'true');
    expect(owner).toHaveAttribute('aria-live', 'polite');
    expect(owner).toHaveAttribute('aria-atomic', 'true');
    expect(owner).toHaveAttribute('data-slot', 'loading-skeleton');
    expect(owner).toHaveAttribute('data-lines', '1');
    expect(owner).toHaveAttribute('data-height', 'h-4');
    expect(owner).toHaveAttribute('data-width', 'w-full');
    expect(owner).toHaveAttribute('data-rounded', 'sm');
    expect(owner.querySelector('[data-slot="skeleton"]')).toHaveClass(
      'h-4',
      'w-full',
      'rounded-sm'
    );
  });

  it('renders tokenized custom geometry on every line', () => {
    render(
      <LoadingSkeleton
        className='shrink-0'
        height='h-6'
        label='Loading audience'
        lines={3}
        rounded='lg'
        width='w-48'
      />
    );

    const owner = screen.getByRole('status', { name: 'Loading audience' });
    const lines = owner.querySelectorAll('[data-slot="skeleton"]');
    expect(lines).toHaveLength(3);
    expect(owner).toHaveClass('space-y-2');
    expect(owner.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(owner.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
    for (const line of lines) {
      expect(line).toHaveClass('h-6', 'rounded-lg', 'shrink-0');
    }
    expect(lines[0]).toHaveClass('w-48');
    expect(lines[1]).toHaveClass('w-48');
    expect(lines[2]).toHaveClass('w-3/4');
  });

  it.each([
    ['   '],
    [null as unknown as string],
  ])('falls back from an invalid label', label => {
    render(<LoadingSkeleton label={label} />);
    expect(
      screen.getByRole('status', { name: 'Loading content' })
    ).toHaveAttribute('aria-label', 'Loading content');
  });

  it('can be decorative beneath a shared loading owner', () => {
    const { container } = render(<LoadingSkeleton announce={false} />);
    const owner = container.querySelector('[data-slot="loading-skeleton"]');

    expect(owner).not.toHaveAttribute('role');
    expect(owner).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    [0, 1],
    [-4, 1],
    [Number.NaN, 1],
    [2.9, 2],
  ])('normalizes %s lines to %s visible rows', (lines, expected) => {
    render(<LoadingSkeleton lines={lines} />);
    const owner = screen.getByRole('status');
    expect(owner.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(
      expected
    );
    expect(owner).toHaveAttribute('data-lines', String(expected));
  });

  it('removes caller geometry while preserving non-geometry classes', () => {
    render(
      <LoadingSkeleton
        className='!h-[13px] sm:!w-[29px] min-h-24 max-w-0 shrink-0'
        height='h-6'
        width='w-48'
      />
    );

    const line = document.querySelector('[data-slot="skeleton"]');
    expect(line).toHaveClass('h-6', 'w-48', 'shrink-0');
    expect(line).not.toHaveClass(
      '!h-[13px]',
      'sm:!w-[29px]',
      'min-h-24',
      'max-w-0'
    );
  });
});
