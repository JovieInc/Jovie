import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BUTTON_SIZE_NAMES, BUTTON_VARIANT_NAMES, Button } from './button';

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

  it('renders every entry in the server-safe button registry', () => {
    render(
      <>
        {BUTTON_VARIANT_NAMES.map(variant => (
          <Button key={variant} variant={variant}>
            Variant {variant}
          </Button>
        ))}
        {BUTTON_SIZE_NAMES.map(size => (
          <Button key={size} size={size}>
            Size {size}
          </Button>
        ))}
      </>
    );

    for (const variant of BUTTON_VARIANT_NAMES) {
      expect(
        screen.getByRole('button', { name: `Variant ${variant}` })
      ).toHaveAttribute('data-variant', variant);
    }
    for (const size of BUTTON_SIZE_NAMES) {
      expect(
        screen.getByRole('button', { name: `Size ${size}` })
      ).toHaveAttribute('data-size', size);
    }
  });

  it('keeps a 44px hit target on every icon size (JOV-4871)', () => {
    const iconSizes = {
      icon: 'h-9',
      'icon-xs': 'h-6',
      'icon-sm': 'h-7',
      'icon-md': 'h-8',
      'icon-lg': 'h-10',
      'icon-xl': 'h-11',
    } as const;

    for (const [size, container] of Object.entries(iconSizes) as [
      keyof typeof iconSizes,
      string,
    ][]) {
      const { unmount } = render(<Button size={size}>Icon {size}</Button>);
      const btn = screen.getByRole('button', { name: `Icon ${size}` });
      expect(btn.className).toContain(container);
      if (size === 'icon-xl') {
        // 44px container satisfies the hit target by construction.
        expect(btn.className).not.toContain('before:h-11');
      } else {
        expect(btn.className).toContain('before:h-11');
        expect(btn.className).toContain('before:w-11');
      }
      unmount();
    }
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

  it('keeps tactile press feedback opt-in with a static override', () => {
    render(
      <>
        <Button>Default</Button>
        <Button pressFeedback>Press</Button>
        <Button pressFeedback static>
          Static
        </Button>
      </>
    );

    expect(
      screen.getByRole('button', { name: 'Default' }).className
    ).not.toContain('active:scale-[var(--scale-press)]');
    expect(screen.getByRole('button', { name: 'Press' }).className).toContain(
      'active:scale-[var(--scale-press)]'
    );
    expect(screen.getByRole('button', { name: 'Press' }).className).toContain(
      'motion-reduce:active:scale-100'
    );
    expect(
      screen.getByRole('button', { name: 'Static' }).className
    ).not.toContain('active:scale-[var(--scale-press)]');
    expect(screen.getByRole('button', { name: 'Press' })).toHaveAttribute(
      'data-press-feedback',
      'true'
    );
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

  it('keeps normal focus transitions while disabling them for reduced motion', () => {
    render(<Button>Press</Button>);
    const btn = screen.getByRole('button');

    expect(btn.className).toContain(
      'transition-[background-color,border-color,color,box-shadow,opacity,transform]'
    );
    expect(btn.className).toContain('motion-reduce:!transition-none');
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
