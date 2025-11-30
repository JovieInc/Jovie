import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
});
