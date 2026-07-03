import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Spinner } from './spinner';

describe('Spinner', () => {
  it('renders with default props and accessibility', () => {
    render(<Spinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('aria-label', 'Loading');
    expect(spinner).toHaveAttribute('data-size', 'md');
    expect(spinner).toHaveAttribute('data-tone', 'primary');
  });

  it('applies size classes', () => {
    render(<Spinner size='sm' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('h-4', 'w-4');
  });

  it('applies custom className and tone', () => {
    render(<Spinner className='custom-class' tone='inverse' />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('custom-class');
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
  });

  it('includes reduced-motion alternatives on animated elements', () => {
    render(<Spinner />);

    const spinner = screen.getByRole('status');
    expect(spinner).toHaveClass('motion-reduce:transition-none');

    const animatedElements = spinner.querySelectorAll('[class*="animate-"]');
    expect(animatedElements.length).toBeGreaterThan(0);
    animatedElements.forEach(element => {
      expect(element.className).toContain('motion-reduce:');
    });
  });
});