import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders with text and default test id', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByTestId('button');
    expect(btn).toHaveTextContent('Press');
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant='secondary' size='sm'>
        Press
      </Button>
    );
    const btn = screen.getByTestId('button');
    expect(btn.className).toContain('bg-surface-2');
    expect(btn.className).toContain('h-8');
  });

  it('forwards refs', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Hi</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('supports asChild', () => {
    render(
      <Button asChild>
        <a href='https://example.com'>Link</a>
      </Button>
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('respects disabled state', () => {
    render(<Button disabled>Off</Button>);
    expect(screen.getByTestId('button')).toBeDisabled();
  });

  it('renders spinner when loading', () => {
    render(<Button loading>Load</Button>);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByTestId('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders anchor when href is provided', () => {
    render(<Button href='https://example.com'>Go</Button>);
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });
});
