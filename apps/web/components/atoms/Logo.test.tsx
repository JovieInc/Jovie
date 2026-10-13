import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it('renders an accessible wordmark using the requested size', () => {
    render(<Logo size='xl' tone='color' />);

    const wordmark = screen.getByRole('img', { name: 'Jovie logo' });
    expect(wordmark).toHaveClass('h-16', 'w-auto');
    expect(wordmark).toHaveAttribute('data-wordmark-master', 'display');
    expect(wordmark.querySelectorAll('path')).toHaveLength(5);
  });

  it('draws the same construction wordmark for word and wordAlt', () => {
    const { container } = render(
      <>
        <Logo variant='word' size='md' />
        <Logo variant='wordAlt' size='md' />
      </>
    );
    const [word, alt] = container.querySelectorAll('svg');
    expect(word.innerHTML).toBe(alt.innerHTML);
  });

  it('uses the Text master below 24 px', () => {
    render(<Logo size='xs' />);
    expect(screen.getByRole('img', { name: 'Jovie logo' })).toHaveAttribute(
      'data-wordmark-master',
      'text'
    );
  });

  it('renders the icon variant through the canonical brand mark', () => {
    render(<Logo variant='icon' size='lg' tone='muted' />);

    const icon = screen.getByRole('img', { name: 'Jovie' });
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
    expect(icon.parentElement).toHaveAttribute('data-brand-mark-size', '32');
    expect(icon.parentElement).toHaveClass('text-muted-foreground/50');
  });
});
