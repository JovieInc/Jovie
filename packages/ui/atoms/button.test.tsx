import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button', { name: /press/i });
    expect(btn).toBeInTheDocument();
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant='secondary' size='sm'>
        Press
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-surface-2');
    expect(btn.className).toContain('h-8');
  });

  it('applies destructive variant classes', () => {
    render(<Button variant='destructive'>Delete</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-red-500');
    expect(btn.className).toContain('text-white');
  });

  it('forwards refs', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Hi</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('has correct displayName', () => {
    expect(Button.displayName).toBe('Button');
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
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders spinner when loading', () => {
    render(<Button loading>Load</Button>);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('hides content when loading', () => {
    render(<Button loading>Load</Button>);
    const content = screen.getByText('Load').closest('span');
    expect(content).toHaveClass('opacity-0');
  });

  it('applies motion-reduce class to spinner', () => {
    render(<Button loading>Load</Button>);
    const spinner = screen.getByTestId('spinner').firstChild as HTMLElement;
    expect(spinner.className).toContain('motion-reduce:animate-none');
  });

  it('supports icon-only buttons with aria-label', () => {
    render(
      <Button size='icon' aria-label='Close dialog'>
        ×
      </Button>
    );
    const btn = screen.getByRole('button', { name: 'Close dialog' });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('h-9');
    expect(btn.className).toContain('w-9');
  });

  it('warns in development for icon-only buttons without aria-label', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use vi.stubEnv to mock NODE_ENV
    vi.stubEnv('NODE_ENV', 'development');

    render(<Button size='icon'>×</Button>);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Button: Icon-only buttons should have an aria-label for accessibility'
    );

    vi.unstubAllEnvs();
    consoleSpy.mockRestore();
  });

  it('does not warn for icon-only buttons with aria-labelledby', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Use vi.stubEnv to mock NODE_ENV
    vi.stubEnv('NODE_ENV', 'development');

    render(
      <Button size='icon' aria-labelledby='close-label'>
        ×
      </Button>
    );

    expect(consoleSpy).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
    consoleSpy.mockRestore();
  });

  it('sets correct data-state attributes', () => {
    const { rerender } = render(<Button>Normal</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'idle');

    rerender(<Button loading>Loading</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('data-state', 'loading');

    rerender(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toHaveAttribute(
      'data-state',
      'disabled'
    );
  });

  it('defaults to type="button"', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('respects custom type prop', () => {
    render(<Button type='submit'>Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  // href prop removed; use asChild with an anchor element instead
});
