import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('System B typography contract', () => {
    it('keeps shared button tracking neutral and non-negative', () => {
      const source = readFileSync(
        path.join(process.cwd(), 'atoms/button.tsx'),
        {
          encoding: 'utf8',
        }
      );

      expect(source).not.toMatch(/\btracking-\[-[^\]]+\]/);

      render(
        <>
          <Button>Primary</Button>
          <Button variant='secondary'>Secondary</Button>
          <Button variant='tertiary'>Tertiary</Button>
        </>
      );

      for (const button of screen.getAllByRole('button')) {
        expect(button.className).toContain('tracking-normal');
        expect(button.className).not.toMatch(/\btracking-\[-[^\]]+\]/);
      }
    });
  });

  it('renders with text', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button', { name: /press/i });
    expect(btn).toBeInTheDocument();
  });

  it('defaults to the canonical primary md button contract', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('data-variant', 'primary');
    expect(btn).toHaveAttribute('data-size', 'md');
    expect(btn.className).toContain('h-9');
    expect(btn.className).toContain('bg-btn-primary');
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant='secondary' size='sm'>
        Press
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-btn-secondary');
    expect(btn.className).toContain('h-7');
  });

  it('maps deprecated variants to canonical variants with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <>
        <Button variant='accent'>Upgrade</Button>
        <Button variant='outline'>More</Button>
        <Button variant='destructive'>Delete</Button>
      </>
    );

    const btn = screen.getByRole('button', { name: 'Upgrade' });
    expect(btn).toHaveAttribute('data-variant', 'primary');
    expect(btn).not.toHaveAttribute('data-destructive');
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute(
      'data-variant',
      'secondary'
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-destructive',
      'true'
    );
    expect(warn).toHaveBeenCalledWith(
      '[Button] variant="accent" is deprecated. Use variant="primary" instead.'
    );
  });

  it('maps deprecated sizes to canonical sizes with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <>
        <Button size='default'>Default</Button>
        <Button size='xl'>Extra Large</Button>
        <Button size='hero'>Hero</Button>
      </>
    );

    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'data-size',
      'md'
    );
    expect(screen.getByRole('button', { name: 'Extra Large' })).toHaveAttribute(
      'data-size',
      'lg'
    );
    expect(screen.getByRole('button', { name: 'Hero' })).toHaveAttribute(
      'data-size',
      'lg'
    );
    expect(warn).toHaveBeenCalledWith(
      '[Button] size="default" is deprecated. Use size="md" instead.'
    );
  });

  it('keeps the legacy accent alias neutral instead of accent-filled', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Button variant='accent'>Upgrade</Button>);
    const btn = screen.getByRole('button', { name: 'Upgrade' });
    expect(btn.className).toContain('bg-btn-primary');
    expect(btn.className).toContain('text-btn-primary-foreground');
    expect(btn.className).not.toContain('bg-accent');
    expect(btn.className).not.toContain('text-accent-foreground');
  });

  it('uses tactile press feedback with a static opt-out', () => {
    render(
      <>
        <Button>Press</Button>
        <Button static>Static</Button>
      </>
    );

    expect(screen.getByRole('button', { name: 'Press' }).className).toContain(
      'active:scale-[0.96]'
    );
    expect(
      screen.getByRole('button', { name: 'Static' }).className
    ).not.toContain('active:scale-[0.96]');
  });

  it('uses the Jovie focus token', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain(
      'focus-visible:ring-(--linear-border-focus)'
    );
    expect(btn.className).toContain(
      'focus-visible:ring-offset-(--linear-bg-page)'
    );
  });

  it('uses raised control styling for secondary buttons', () => {
    render(<Button variant='secondary'>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('shadow-[');
    expect(btn.className).toContain('hover:border-(--linear-border-default)');
  });

  it.each([
    'primary',
    'secondary',
    'tertiary',
    'ghost',
    'link',
  ] as const)('applies destructive styling to the %s variant through a prop', variant => {
    render(
      <Button variant={variant} destructive>
        Delete
      </Button>
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('data-variant', variant);
    expect(btn).toHaveAttribute('data-destructive', 'true');
    expect(btn.className).toContain(
      variant === 'primary' ? 'bg-error' : 'text-error'
    );
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
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders spinner when loading', () => {
    render(<Button loading>Load</Button>);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });
  // href prop removed; use asChild with an anchor element instead
});
