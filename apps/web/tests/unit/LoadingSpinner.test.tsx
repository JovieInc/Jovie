import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default props and has proper accessibility', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner).toHaveAttribute('data-size', 'md');
    expect(spinner).toHaveAttribute('data-tone', 'primary');
  });

  it('applies correct size classes', () => {
    render(<LoadingSpinner size='sm' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('applies custom className', () => {
    render(<LoadingSpinner className='custom-class' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-class');
  });

  it('honors tone prop for readable contrast', () => {
    render(<LoadingSpinner tone='inverse' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
  });

  describe('reduced motion support', () => {
    it('outer container has motion-reduce classes for accessibility', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      // The outer span should have motion-reduce:transition-none and motion-reduce:animate-none
      expect(spinner).toHaveClass('motion-reduce:transition-none');
      expect(spinner).toHaveClass('motion-reduce:animate-none');
    });

    it('background ring has motion-reduce:transition-none class', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      // The first span child is the relative container, its first child is the background ring
      const innerContainer = spinner.querySelector('[aria-hidden="true"]');
      expect(innerContainer).not.toBeNull();

      const backgroundRing = innerContainer?.querySelector(
        '.border-current\\/20'
      );
      expect(backgroundRing).not.toBeNull();
      expect(backgroundRing).toHaveClass('motion-reduce:transition-none');
    });

    it('spinning element uses slower animation for reduced motion users', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      const innerContainer = spinner.querySelector('[aria-hidden="true"]');
      expect(innerContainer).not.toBeNull();

      // The spinning element has border-t-transparent class
      const spinningElement = innerContainer?.querySelector(
        '.border-t-transparent'
      );
      expect(spinningElement).not.toBeNull();
      // motion-reduce:animate-[spin_1.2s_linear_infinite] provides a slower, more comfortable animation
      expect(spinningElement).toHaveClass(
        'motion-reduce:animate-[spin_1.2s_linear_infinite]'
      );
    });

    it('has proper structure with accessible and hidden elements', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');
      // aria-hidden inner content ensures screen readers don't read decorative elements
      const hiddenContent = spinner.querySelector('[aria-hidden="true"]');
      expect(hiddenContent).not.toBeNull();
      expect(hiddenContent).toHaveAttribute('aria-hidden', 'true');

      // The status element itself should have a proper label for screen readers
      expect(spinner).toHaveAttribute('aria-label', 'Loading');
    });

    it('all animated elements have reduced motion alternatives', () => {
      render(<LoadingSpinner />);

      const spinner = screen.getByRole('status');

      // Verify the main spinner has transition-none for reduced motion
      expect(spinner.className).toContain('motion-reduce:');

      // Get all elements with animate- classes
      const animatedElements = spinner.querySelectorAll('[class*="animate-"]');
      expect(animatedElements.length).toBeGreaterThan(0);

      // Each animated element should have a motion-reduce alternative
      animatedElements.forEach(element => {
        const hasMotionReduceClass =
          element.className.includes('motion-reduce:');
        expect(hasMotionReduceClass).toBe(true);
      });
    });
  });
});
