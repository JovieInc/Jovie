import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressIndicator, Spinner } from './spinner';

describe('ProgressIndicator', () => {
  it('renders with default props and accessibility', () => {
    render(<ProgressIndicator />);

    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-label', 'Loading');
    expect(indicator).toHaveAttribute('data-size', 'md');
    expect(indicator).toHaveAttribute('data-tone', 'primary');
    expect(indicator).toHaveAttribute('data-slot', 'progress-indicator');
  });

  it('applies size classes', () => {
    render(<ProgressIndicator size='sm' />);
    expect(screen.getByRole('status')).toHaveClass('h-4', 'w-4');
  });

  it('applies tone and custom className', () => {
    render(<ProgressIndicator tone='inverse' className='custom-class' />);
    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('data-tone', 'inverse');
    expect(indicator).toHaveClass('custom-class');
  });

  it('uses a static reduced-motion fallback', () => {
    render(<ProgressIndicator />);
    const indicator = screen.getByRole('status');
    const animated = indicator.querySelector('.border-t-transparent');
    expect(animated).toHaveClass('motion-reduce:animate-none');
    expect(animated).toHaveClass('motion-reduce:will-change-auto');
  });

  it('keeps Spinner as a behavior-compatible alias', () => {
    render(<Spinner label='Saving' size='sm' tone='muted' />);
    const indicator = screen.getByRole('status');
    expect(indicator).toHaveAttribute('aria-label', 'Saving');
    expect(indicator).toHaveAttribute('data-size', 'sm');
    expect(indicator).toHaveAttribute('data-tone', 'muted');
  });
});
