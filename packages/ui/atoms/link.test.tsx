import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Link } from './link';

describe('Link', () => {
  it('renders anchor with canonical link variant attrs', () => {
    render(
      <Link href='/docs' data-testid='link'>
        Documentation
      </Link>
    );

    const link = screen.getByTestId('link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-state', 'idle');
    expect(link.className).toContain('text-(--color-link-default)');
    expect(link.className).toContain('visited:text-(--color-link-visited)');
    expect(link.className).toContain('active:opacity-80');
  });

  it('marks visited preview state', () => {
    render(
      <Link href='/visited' visited data-testid='visited-link'>
        Visited
      </Link>
    );

    expect(screen.getByTestId('visited-link')).toHaveAttribute(
      'data-state',
      'visited'
    );
  });

  it('supports disabled state without navigation', () => {
    render(
      <Link href='/disabled' disabled data-testid='disabled-link'>
        Disabled
      </Link>
    );

    const link = screen.getByTestId('disabled-link');
    expect(link).toHaveAttribute('data-state', 'disabled');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('supports asChild composition', () => {
    render(
      <Link asChild variant='subtle' data-testid='slot-link'>
        <a href='/composed'>Composed</a>
      </Link>
    );

    const link = screen.getByTestId('slot-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/composed');
    expect(link.className).toContain('text-(--linear-text-secondary)');
  });
});
