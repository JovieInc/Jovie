import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingSkeleton, Skeleton } from './skeleton';

describe('Skeleton', () => {
  describe('Basic Rendering', () => {
    it('renders as div element', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.tagName).toBe('DIV');
    });

    it('applies skeleton class', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('skeleton');
    });

    it('exposes shimmer loading state attrs', () => {
      render(<Skeleton data-testid='skeleton' shimmer />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('data-state', 'shimmer');
    });

    it('supports static placeholder without shimmer', () => {
      render(<Skeleton data-testid='skeleton' shimmer={false} />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('data-state', 'static');
      expect(skeleton.className.split(/\s+/)).not.toContain('skeleton');
      expect(skeleton.className).toContain('bg-surface-1');
    });

    it('is hidden from screen readers', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveAttribute('data-slot', 'skeleton');
    });

    it('keeps decorative semantics canonical when callers pass conflicting attrs', () => {
      render(
        <Skeleton
          data-testid='skeleton'
          aria-hidden='false'
          data-state='static'
        />
      );
      const skeleton = screen.getByTestId('skeleton');

      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).toHaveAttribute('data-state', 'shimmer');
    });
  });

  describe('Rounded Variants', () => {
    it('applies sm rounded by default', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-sm');
    });

    it('applies none rounded variant', () => {
      render(<Skeleton rounded='none' data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-none');
    });

    it('applies md rounded variant', () => {
      render(<Skeleton rounded='md' data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-md');
    });

    it('applies lg rounded variant', () => {
      render(<Skeleton rounded='lg' data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-lg');
    });

    it('applies full rounded variant', () => {
      render(<Skeleton rounded='full' data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('rounded-full');
    });
  });

  describe('Styling', () => {
    it('merges custom className', () => {
      render(<Skeleton className='h-4 w-full' data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('h-4');
      expect(skeleton.className).toContain('w-full');
      expect(skeleton.className).toContain('skeleton');
    });

    it('applies motion-reduce class', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton.className).toContain('motion-reduce:animate-none');
      expect(skeleton.className).toContain('motion-reduce:bg-none');
    });
  });

  describe('HTML Attributes', () => {
    it('passes through HTML attributes', () => {
      render(
        <Skeleton
          id='custom-id'
          style={{ width: '100px' }}
          data-testid='skeleton'
        />
      );
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('id', 'custom-id');
      expect(skeleton).toHaveStyle({ width: '100px' });
    });
  });
});

describe('LoadingSkeleton', () => {
  describe('Single Line', () => {
    it('renders single line by default', () => {
      render(<LoadingSkeleton />);
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveAttribute('data-lines', '1');
    });

    it('applies default height and width', () => {
      render(<LoadingSkeleton />);
      const skeleton = document.querySelector('.skeleton');
      expect(skeleton?.className).toContain('h-4');
      expect(skeleton?.className).toContain('w-full');
    });

    it('applies custom height', () => {
      render(<LoadingSkeleton height='h-8' />);
      const skeleton = document.querySelector('.skeleton');
      expect(skeleton?.className).toContain('h-8');
    });

    it('applies custom width', () => {
      render(<LoadingSkeleton width='w-48' />);
      const skeleton = document.querySelector('.skeleton');
      expect(skeleton?.className).toContain('w-48');
    });

    it('applies rounded variant', () => {
      render(<LoadingSkeleton rounded='lg' />);
      const skeleton = document.querySelector('.skeleton');
      expect(skeleton?.className).toContain('rounded-lg');
    });

    it('announces a useful loading label', () => {
      render(<LoadingSkeleton label='Loading audience' />);

      const status = screen.getByRole('status', { name: 'Loading audience' });
      expect(status).toHaveAttribute('aria-label', 'Loading audience');
      expect(status).toHaveAttribute('aria-atomic', 'true');
      expect(status).toHaveAttribute('data-slot', 'loading-skeleton');
    });

    it('falls back to a named owner when the label is blank', () => {
      render(<LoadingSkeleton label='   ' />);

      expect(
        screen.getByRole('status', { name: 'Loading content' })
      ).toHaveAttribute('aria-label', 'Loading content');
    });

    it('guards the accessible label at runtime', () => {
      render(<LoadingSkeleton label={null as unknown as string} />);

      expect(
        screen.getByRole('status', { name: 'Loading content' })
      ).toHaveAttribute('aria-label', 'Loading content');
    });

    it('can render as a decorative placeholder under a shared owner', () => {
      const { container } = render(<LoadingSkeleton announce={false} />);

      expect(
        container.querySelector('[data-slot="loading-skeleton"]')
      ).not.toHaveAttribute('role');
      expect(
        container.querySelector('[data-slot="loading-skeleton"]')
      ).not.toHaveAttribute('aria-busy');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Lines', () => {
    it('renders multiple lines', () => {
      render(<LoadingSkeleton lines={3} />);
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons).toHaveLength(3);
      expect(screen.getByRole('status')).toHaveAttribute('data-lines', '3');
    });

    it('last line has 3/4 width', () => {
      render(<LoadingSkeleton lines={3} />);
      const skeletons = document.querySelectorAll('.skeleton');
      const lastSkeleton = skeletons[2];
      expect(lastSkeleton?.className).toContain('w-3/4');
    });

    it('non-last lines have full width', () => {
      render(<LoadingSkeleton lines={3} width='w-full' />);
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons[0]?.className).toContain('w-full');
      expect(skeletons[1]?.className).toContain('w-full');
    });

    it('wraps multiple lines in container', () => {
      render(<LoadingSkeleton lines={3} />);
      const container = document.querySelector('.space-y-2');
      expect(container).toBeInTheDocument();
    });

    it('container exposes busy status for assistive tech', () => {
      render(<LoadingSkeleton lines={3} />);
      const container = document.querySelector('.space-y-2');
      expect(container).toHaveAttribute('aria-busy', 'true');
      expect(container).toHaveAttribute('role', 'status');
    });

    it.each([0, -3, 0.5])(
      'normalizes %s lines to one visible placeholder',
      lines => {
        render(<LoadingSkeleton lines={lines} />);

        expect(document.querySelectorAll('.skeleton')).toHaveLength(1);
        expect(screen.getByRole('status')).toHaveAttribute('data-lines', '1');
      }
    );

    it.each([Number.NaN, Infinity, -Infinity])(
      'normalizes non-finite %s lines to one visible placeholder',
      lines => {
        render(<LoadingSkeleton lines={lines} />);

        expect(document.querySelectorAll('.skeleton')).toHaveLength(1);
        expect(screen.getByRole('status')).toHaveAttribute('data-lines', '1');
      }
    );

    it('floors fractional line counts and keeps one named polite status owner', () => {
      const { container } = render(
        <LoadingSkeleton lines={3.9} label='  Loading profile  ' />
      );

      const status = screen.getByRole('status', { name: 'Loading profile' });
      expect(screen.getAllByRole('status')).toHaveLength(1);
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(status).toHaveAttribute('aria-busy', 'true');
      expect(status).toHaveAttribute('aria-atomic', 'true');
      expect(status).toHaveAttribute('data-lines', '3');
      const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons).toHaveLength(3);
      expect(skeletons[2]).toHaveClass('h-4', 'w-3/4');
    });
  });

  describe('Styling', () => {
    it('merges custom className', () => {
      render(<LoadingSkeleton className='custom-class' />);
      const skeleton = document.querySelector('.skeleton');
      expect(skeleton?.className).toContain('custom-class');
    });

    it('keeps reserved geometry authoritative over caller className', () => {
      render(
        <LoadingSkeleton
          className='h-[13px] w-[29px]'
          height='h-6'
          width='w-48'
        />
      );

      const skeleton = document.querySelector('[data-slot="skeleton"]');
      expect(skeleton).toHaveClass('h-6', 'w-48');
      expect(skeleton).not.toHaveClass('h-[13px]', 'w-[29px]');
    });

    it('removes important and responsive caller geometry overrides', () => {
      render(
        <LoadingSkeleton
          className='!h-[13px] sm:!w-[29px] min-h-24 max-w-0 shrink-0'
          height='h-6'
          width='w-48'
        />
      );

      const skeleton = document.querySelector('[data-slot="skeleton"]');
      expect(skeleton).toHaveClass('h-6', 'w-48', 'shrink-0');
      expect(skeleton).not.toHaveClass(
        '!h-[13px]',
        'sm:!w-[29px]',
        'min-h-24',
        'max-w-0'
      );
    });

    it.each([
      'h-[length:var(--caller-height)] w-[length:var(--caller-width)]',
      'sm:!h-[length:var(--caller-height)] md:w-[length:var(--caller-width)]!',
      'lg:hover:min-h-[length:var(--caller-height)] max-w-[length:var(--caller-width)]',
      '[&:nth-child(2)]:size-[length:var(--caller-size)]',
      "[&[data-shape='(']]:w-[length:var(--caller-width)]",
      '[&[data-shape="]"]]:h-8',
      '[&[data-shape=\\(]]:size-12',
      'supports-[width:fit-content]:h-(length:--caller-height) sm:w-(length:--caller-width)',
      '[height:13px] [width:29px]',
      'sm:![min-height:13px] md:[max-width:29px]!',
      '[max-height:13px] [min-width:29px]',
      'lg:[block-size:13px] [inline-size:29px]',
      '[min-block-size:13px] sm:[max-inline-size:29px]',
    ])('rejects dimension overrides in caller styling: %s', className => {
      const { container } = render(
        <LoadingSkeleton className={className} height='h-6' width='w-48' />
      );

      const skeleton = container.querySelector('[data-slot="skeleton"]');
      expect(skeleton).toHaveClass('h-6', 'w-48');
      for (const utility of className.split(' ')) {
        expect(skeleton).not.toHaveClass(utility);
      }
    });

    it('preserves ordinary styling including colons and dimension-like text', () => {
      const classes = [
        'shrink-0',
        'rounded-lg',
        'shadow-sm',
        'sm:hover:opacity-60',
        'bg-[color:var(--color-skeleton-base)]',
        '[mask-type:luminance]',
        '[--caller-note:w-96]',
        "before:content-['w-96:h-20']",
        'data-[size=w-96]:opacity-60',
        '[&:is([data-size=w-96])]:opacity-60',
      ];
      const { container } = render(
        <LoadingSkeleton className={` \t${classes.join('  ')}\n `} />
      );

      expect(container.querySelector('[data-slot="skeleton"]')).toHaveClass(
        'h-4',
        'w-full',
        ...classes
      );
    });

    it('protects every line and the shorter last line beneath a shared status owner', () => {
      const className = 'sm:w-[length:var(--caller-width)] [height:13px]';
      render(
        <div role='status' aria-live='polite' aria-label='Loading profile'>
          <LoadingSkeleton
            announce={false}
            lines={3}
            className={`${className} opacity-60`}
            height='h-6'
            width='w-48'
          />
        </div>
      );

      const status = screen.getByRole('status', { name: 'Loading profile' });
      expect(screen.getAllByRole('status')).toHaveLength(1);
      const skeletons = status.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons).toHaveLength(3);
      skeletons.forEach((skeleton, index) => {
        expect(skeleton).toHaveClass(
          'h-6',
          index === 2 ? 'w-3/4' : 'w-48',
          'opacity-60',
          'motion-reduce:animate-none',
          'motion-reduce:bg-none'
        );
        for (const utility of className.split(' ')) {
          expect(skeleton).not.toHaveClass(utility);
        }
        expect(skeleton).toHaveAttribute('aria-hidden', 'true');
        expect(skeleton).not.toHaveAttribute('role');
      });
      const owner = status.querySelector('[data-slot="loading-skeleton"]');
      expect(owner).not.toHaveAttribute('aria-live');
      expect(owner).not.toHaveAttribute('aria-label');
    });

    it('applies height to all lines', () => {
      render(<LoadingSkeleton lines={2} height='h-6' />);
      const skeletons = document.querySelectorAll('.skeleton');
      skeletons.forEach(skeleton => {
        expect(skeleton.className).toContain('h-6');
      });
    });

    it('declares the reserved geometry on the single loading owner', () => {
      render(
        <LoadingSkeleton lines={3} height='h-6' width='w-48' rounded='lg' />
      );

      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('data-lines', '3');
      expect(status).toHaveAttribute('data-height', 'h-6');
      expect(status).toHaveAttribute('data-width', 'w-48');
      expect(status).toHaveAttribute('data-rounded', 'lg');
      expect(status.querySelectorAll('[role="status"]')).toHaveLength(0);
      expect(status.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
    });
  });
});
