import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an accessible wordmark using the requested size', () => {
    render(<Logo size='xl' tone='color' />);

    const wordmark = screen.getByRole('img', { name: 'Jovie logo' });
    expect(wordmark).toHaveClass('h-16', 'w-auto');
    expect(wordmark).toHaveAttribute('viewBox', '0 0 136 39');
  });

  it('renders the icon variant through the canonical brand mark', () => {
    render(<Logo variant='icon' size='lg' tone='muted' />);

    const icon = screen.getByRole('img', { name: 'Jovie' });
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
    expect(icon.parentElement).toHaveClass('text-muted-foreground/50');
  });
});
