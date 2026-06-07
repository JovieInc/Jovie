import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
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
          <Button variant='whitePill'>White Pill</Button>
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

  it('keeps the legacy accent variant neutral instead of accent-filled', () => {
    const source = readFileSync(path.join(process.cwd(), 'atoms/button.tsx'), {
      encoding: 'utf8',
    });
    const accentVariantSource = source.match(/accent:\s*'(?<classes>[^']+)'/)
      ?.groups?.classes;

    expect(accentVariantSource).toBeDefined();
    expect(accentVariantSource).toContain('bg-btn-primary');
    expect(accentVariantSource).toContain('text-btn-primary-foreground');
    expect(accentVariantSource).not.toMatch(
      /\bbg-accent\b|text-accent-foreground|text-on-accent|hover:bg-accent|\bbg-(?:blue|purple|violet|indigo)-\d/
    );

    render(<Button variant='accent'>Upgrade</Button>);
    const btn = screen.getByRole('button', { name: 'Upgrade' });
    expect(btn.className).toContain('bg-btn-primary');
    expect(btn.className).toContain('text-btn-primary-foreground');
    expect(btn.className).not.toContain('bg-accent');
    expect(btn.className).not.toContain('text-accent-foreground');
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
  it('applies xl size classes', () => {
    render(<Button size='xl'>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('h-12');
    expect(btn.className).toContain('rounded-full');
  });

  it('applies hero size classes', () => {
    render(<Button size='hero'>Press</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('h-14');
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('font-semibold');
  });
  // href prop removed; use asChild with an anchor element instead
});
