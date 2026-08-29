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

    it('normalizes invalid line counts to one visible placeholder', () => {
      render(<LoadingSkeleton lines={0} />);

      expect(document.querySelectorAll('.skeleton')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveAttribute('data-lines', '1');
    });

    it('normalizes non-finite line counts to one visible placeholder', () => {
      render(<LoadingSkeleton lines={Number.NaN} />);

      expect(document.querySelectorAll('.skeleton')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveAttribute('data-lines', '1');
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
