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

    it('is hidden from screen readers', () => {
      render(<Skeleton data-testid='skeleton' />);
      const skeleton = screen.getByTestId('skeleton');
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
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
  });

  describe('Multiple Lines', () => {
    it('renders multiple lines', () => {
      render(<LoadingSkeleton lines={3} />);
      const skeletons = document.querySelectorAll('.skeleton');
      expect(skeletons).toHaveLength(3);
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

    it('container is hidden from screen readers', () => {
      render(<LoadingSkeleton lines={3} />);
      const container = document.querySelector('.space-y-2');
      expect(container).toHaveAttribute('aria-hidden', 'true');
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
});
