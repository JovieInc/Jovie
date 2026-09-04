import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileNav } from './MobileNav';

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: false }),
}));

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => false,
}));

describe('MobileNav', () => {
  afterEach(() => {
    document.body.style.removeProperty('overflow');
  });

  it('keeps every navigation action reachable on short viewports', () => {
    render(
      <MobileNav
        navLinks={Array.from({ length: 12 }, (_, index) => ({
          href: `/route-${index}`,
          label: `Route ${index}`,
        }))}
        publicCtaHref='/start'
        publicCtaLabel='Get Started'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(
      screen.getByRole('navigation', { name: 'Mobile Navigation' })
    ).toHaveStyle({
      maxHeight: 'calc(100dvh - env(safe-area-inset-top))',
      overflowY: 'auto',
      overscrollBehavior: 'contain',
    });
    expect(screen.getByRole('link', { name: 'Get Started' })).toHaveAttribute(
      'href',
      '/start'
    );
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
  });

  it('uses the canonical public login label when adding the mobile utility link', () => {
    render(
      <MobileNav
        navLinks={[{ href: '/pricing', label: 'Pricing' }]}
        publicCtaHref='/start'
        publicCtaLabel='Find yourself'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
    );
    expect(screen.queryByRole('link', { name: 'Log In' })).toBeNull();
  });

  it('uses the canonical button shadow token', () => {
    const source = readFileSync(resolve(__dirname, './MobileNav.tsx'), 'utf8');
    expect(source).toContain('var(--shadow-button)');
    expect(source).not.toContain('--linear-shadow-button');
  });

  it('documents the sentence-case login label as an intentional casing exception', () => {
    const source = readFileSync(resolve(__dirname, './MobileNav.tsx'), 'utf8');
    expect(source).toContain('ui-casing-allow:');
    expect(source).toContain("label: 'Log in'");
  });
});
