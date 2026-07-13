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
});
