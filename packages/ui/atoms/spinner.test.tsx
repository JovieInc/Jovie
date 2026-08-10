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
    expect(screen.getByRole('status')).toHaveClass('h-4', 'w-4');
  });

  it('applies tone and custom className', () => {
    render(<Spinner tone='inverse' className='custom-class' />);
    const spinner = screen.getByRole('status');
    expect(spinner).toHaveAttribute('data-tone', 'inverse');
    expect(spinner).toHaveClass('custom-class');
  });

  it('animates the ring under normal motion', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    const animated = spinner.querySelector('.border-t-transparent');
    expect(animated).toHaveClass('animate-spin');
  });

  it('renders a static ring under reduced motion', () => {
    render(<Spinner />);
    const spinner = screen.getByRole('status');
    const animated = spinner.querySelector('.border-t-transparent');
    expect(animated).toHaveClass('motion-reduce:animate-none');
    expect(animated).not.toHaveClass(
      'motion-reduce:animate-[spin_1.2s_linear_infinite]'
    );
  });
});
