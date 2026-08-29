import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnimatedSkeletonWithoutReducedMotionFixture } from './fixtures/animated-skeleton-without-reduced-motion';
import { CompetingSkeletonAnnouncerFixture } from './fixtures/competing-skeleton-announcer';
import { UnreservedSkeletonFixture } from './fixtures/unreserved-skeleton';
import { LoadingSkeleton, Skeleton } from './skeleton';

const ATOM_SOURCE = readFileSync(path.join(__dirname, 'skeleton.tsx'), 'utf8');

function dimensionClasses(className: string): readonly string[] {
  return className
    .split(/\s+/)
    .filter(token =>
      /^(h-|w-|size-|min-h-|min-w-|max-h-|max-w-|rounded-)/.test(token)
    )
    .toSorted();
}

function competingAnnouncers(owner: HTMLElement): readonly Element[] {
  return Array.from(
    owner.querySelectorAll('[role="status"], [aria-busy="true"], [aria-live]')
  ).filter(element => element !== owner);
}

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
      expect(skeleton.className).toContain('bg-(--color-skeleton-base)');
      expect(skeleton.className.split(/\s+/)).not.toContain('bg-surface-1');
    });

    it('binds the canonical skeleton fill token in both states', () => {
      const { rerender } = render(<Skeleton data-testid='skeleton' shimmer />);
      expect(screen.getByTestId('skeleton').className).toContain(
        'bg-(--color-skeleton-base)'
      );

      rerender(<Skeleton data-testid='skeleton' shimmer={false} />);
      expect(screen.getByTestId('skeleton').className).toContain(
        'bg-(--color-skeleton-base)'
      );
    });

    it('is hidden from screen readers', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });

    it('keeps decorative placeholders from becoming announcement owners', () => {
      render(
        <Skeleton
          data-testid='skeleton'
          role='status'
          aria-busy='true'
          aria-live='polite'
          aria-label='Loading audience'
          aria-hidden={false}
        />
      );

      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(skeleton).not.toHaveAttribute('role');
      expect(skeleton).not.toHaveAttribute('aria-busy');
      expect(skeleton).not.toHaveAttribute('aria-live');
      expect(skeleton).not.toHaveAttribute('aria-label');
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
      expect(skeleton.className).toContain(
        'motion-reduce:[background-image:none]'
      );
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

  describe('Layout stability', () => {
    it('preserves declared dimensions when shimmer turns off', () => {
      const { rerender } = render(
        <Skeleton className='h-10 w-48' data-testid='skeleton' shimmer />
      );
      const shimmerDimensions = dimensionClasses(
        screen.getByTestId('skeleton').className
      );

      rerender(
        <Skeleton
          className='h-10 w-48'
          data-testid='skeleton'
          shimmer={false}
        />
      );
      const staticDimensions = dimensionClasses(
        screen.getByTestId('skeleton').className
      );

      expect(shimmerDimensions).toEqual(['h-10', 'rounded-sm', 'w-48']);
      expect(staticDimensions).toEqual(shimmerDimensions);
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

      expect(screen.getByRole('status')).toHaveTextContent('Loading audience');
      expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
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
      expect(container).toHaveAttribute('data-state', 'loading');
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

    it('applies height to all lines', () => {
      render(<LoadingSkeleton lines={2} height='h-6' />);
      const skeletons = document.querySelectorAll('.skeleton');
      skeletons.forEach(skeleton => {
        expect(skeleton.className).toContain('h-6');
      });
    });
  });

  describe('Announcement ownership', () => {
    it('owns status, busy, and live-region announcements once', () => {
      render(<LoadingSkeleton lines={3} label='Loading profile details' />);

      const owners = screen.getAllByRole('status');
      expect(owners).toHaveLength(1);

      const owner = owners[0];
      expect(owner).toHaveAttribute('aria-busy', 'true');
      expect(owner).toHaveAttribute('aria-live', 'polite');
      expect(owner).toHaveAttribute('data-state', 'loading');
      expect(owner).toHaveTextContent('Loading profile details');
      expect(competingAnnouncers(owner)).toEqual([]);

      const placeholders = owner.querySelectorAll('[data-state]');
      expect(placeholders).toHaveLength(3);
      placeholders.forEach(placeholder => {
        expect(placeholder).toHaveAttribute('aria-hidden', 'true');
        expect(placeholder).not.toHaveAttribute('role');
        expect(placeholder).not.toHaveAttribute('aria-busy');
        expect(placeholder).not.toHaveAttribute('aria-live');
      });
    });
  });

  describe('Layout stability', () => {
    it('keeps the reserved slot classes through loading-to-content', () => {
      function ReservedTitle({ loading }: { readonly loading: boolean }) {
        return (
          <div data-testid='title-slot' className='h-4 w-48'>
            {loading ? (
              <LoadingSkeleton
                height='h-4'
                width='w-48'
                label='Loading title'
              />
            ) : (
              <p className='h-4 w-48 truncate'>Loaded title</p>
            )}
          </div>
        );
      }

      const { rerender } = render(<ReservedTitle loading />);
      const loadingSlot = screen.getByTestId('title-slot');
      const loadingPlaceholder = loadingSlot.querySelector('.skeleton');

      expect(loadingSlot).toHaveClass('h-4', 'w-48');
      expect(loadingPlaceholder?.className).toContain('h-4');
      expect(loadingPlaceholder?.className).toContain('w-48');

      rerender(<ReservedTitle loading={false} />);
      const loadedSlot = screen.getByTestId('title-slot');
      expect(loadedSlot).toHaveClass('h-4', 'w-48');
      expect(loadedSlot.querySelector('.skeleton')).toBeNull();
      expect(screen.getByText('Loaded title')).toHaveClass('h-4', 'w-48');
    });
  });

  describe('Reduced motion', () => {
    it('removes nonessential animation without changing loading meaning', () => {
      render(<LoadingSkeleton height='h-4' width='w-64' label='Loading' />);

      const owner = screen.getByRole('status');
      const placeholder = owner.querySelector('.skeleton');

      expect(owner).toHaveAttribute('data-state', 'loading');
      expect(owner).toHaveAttribute('aria-busy', 'true');
      expect(placeholder).toHaveAttribute('data-state', 'shimmer');
      expect(placeholder?.className).toContain('motion-reduce:animate-none');
      expect(placeholder?.className).toContain(
        'motion-reduce:[background-image:none]'
      );
      expect(placeholder?.className).toContain('h-4');
      expect(placeholder?.className).toContain('w-64');
    });
  });
});

describe('Skeleton deliberate-red fixtures', () => {
  it('rejects an unreserved collapsing placeholder', () => {
    render(
      <>
        <UnreservedSkeletonFixture />
        <Skeleton className='h-4 w-full' data-testid='production-skeleton' />
      </>
    );

    const fixture = screen.getByTestId('unreserved-skeleton-fixture');
    const production = screen.getByTestId('production-skeleton');

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(dimensionClasses(fixture.className)).not.toContain('h-4');
    expect(dimensionClasses(production.className)).toEqual(
      expect.arrayContaining(['h-4', 'w-full'])
    );
    expect(ATOM_SOURCE).not.toContain('unreserved-skeleton');
  });

  it('rejects a shimmer that ignores reduced motion', () => {
    render(
      <>
        <AnimatedSkeletonWithoutReducedMotionFixture />
        <Skeleton className='h-4 w-48' data-testid='production-skeleton' />
      </>
    );

    const fixture = screen.getByTestId(
      'animated-skeleton-without-reduced-motion-fixture'
    );
    const production = screen.getByTestId('production-skeleton');

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(fixture.className).toContain('animate-pulse');
    expect(fixture.className).not.toContain('motion-reduce:animate-none');
    expect(production.className).toContain('motion-reduce:animate-none');
    expect(production.className).not.toContain('animate-pulse');
    expect(ATOM_SOURCE).not.toContain(
      'animated-skeleton-without-reduced-motion'
    );
  });

  it('rejects nested competing live-region announcements', () => {
    const { rerender } = render(<CompetingSkeletonAnnouncerFixture />);
    const fixture = screen.getByTestId('competing-skeleton-announcer-fixture');

    expect(fixture).toHaveAttribute('data-deliberate-red', '');
    expect(screen.getAllByRole('status').length).toBeGreaterThan(1);
    expect(competingAnnouncers(fixture).length).toBeGreaterThan(0);

    rerender(<LoadingSkeleton label='Loading content' />);
    const owner = screen.getByRole('status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(competingAnnouncers(owner)).toEqual([]);
    expect(ATOM_SOURCE).not.toContain('competing-skeleton-announcer');
  });
});
