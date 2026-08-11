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
});
