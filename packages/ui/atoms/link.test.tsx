import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    expect(link).toHaveAttribute('data-appearance', 'default');
    expect(link).toHaveAttribute('data-state', 'idle');
    expect(link.className).toContain('text-app');
    expect(link.className).toContain('font-medium');
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

  it('ships active state styling via :active and data-state selectors', () => {
    render(
      <Link href='/current' active data-testid='active-link'>
        Current
      </Link>
    );

    const link = screen.getByTestId('active-link');
    expect(link).toHaveAttribute('data-state', 'active');
    expect(link.className).toContain('active:text-(--color-accent)');
    expect(link.className).toContain(
      'data-[state=active]:text-(--color-accent)'
    );
  });

  it('applies disabled state with aria-disabled and state tokens', () => {
    render(
      <Link href='/off' disabled data-testid='disabled-link'>
        Disabled
      </Link>
    );

    const link = screen.getByTestId('disabled-link');
    expect(link).toHaveAttribute('data-state', 'disabled');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link.className).toContain('pointer-events-none');
    expect(link.className).toContain('text-(--color-text-disabled-token)');
    expect(link.className).toContain('opacity-[var(--state-disabled-opacity)]');
  });

  it('prevents disabled links from navigating or calling consumer handlers', () => {
    const onClick = vi.fn();
    render(
      <Link href='/off' disabled onClick={onClick} data-testid='disabled-link'>
        Disabled
      </Link>
    );

    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    const dispatched = screen.getByTestId('disabled-link').dispatchEvent(click);

    expect(dispatched).toBe(false);
    expect(click.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls consumer handlers for enabled links', () => {
    const onClick = vi.fn(event => event.preventDefault());
    render(
      <Link href='/docs' onClick={onClick}>
        Documentation
      </Link>
    );

    screen.getByRole('link', { name: 'Documentation' }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('prioritizes disabled over active and visited in data-state', () => {
    render(
      <Link href='/off' disabled active visited data-testid='precedence-link'>
        Precedence
      </Link>
    );

    expect(screen.getByTestId('precedence-link')).toHaveAttribute(
      'data-state',
      'disabled'
    );
  });

  it('composes onto a single child element via asChild (Radix Slot)', () => {
    const onClick = vi.fn();
    render(
      <Link asChild active data-testid='slot-link'>
        <button type='button' onClick={onClick}>
          Composed
        </button>
      </Link>
    );

    const child = screen.getByTestId('slot-link');
    expect(child.tagName).toBe('BUTTON');
    expect(child).toHaveAttribute('data-variant', 'link');
    expect(child).toHaveAttribute('data-state', 'active');
    expect(child.className).toContain('text-(--color-link-default)');
    child.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('lets consumer className override base classes in the variant={null} composition path', () => {
    // This is the composition contract the ad-hoc anchor migrations rely on:
    // with variant={null}, a consumer className prop merges over the base via
    // tailwind-merge (font-size is a deduped conflict group, so the base size
    // is dropped).
    render(
      <Link
        href='/plain'
        variant={null}
        className='text-sm'
        data-testid='override-link'
      >
        Override
      </Link>
    );

    const link = screen.getByTestId('override-link');
    expect(link.className).toContain('text-sm');
    expect(link.className).not.toContain('text-app');
  });

  it('omits variant classes when variant is null (composition escape hatch)', () => {
    render(
      <Link href='/plain' variant={null} data-testid='null-variant-link'>
        Plain
      </Link>
    );

    const link = screen.getByTestId('null-variant-link');
    expect(link).toHaveAttribute('data-variant', 'link');
    expect(link).toHaveAttribute('data-appearance', 'unstyled');
    expect(link.className).not.toContain('text-(--color-link-default)');
    expect(link.className).not.toContain('visited:text-(--color-link-visited)');
  });
});
