import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HEADER_DOCK_SCROLL_THRESHOLD_PX,
  HeaderNav,
} from '@/components/organisms/HeaderNav';

// next/link prefetch needs IntersectionObserver; a plain anchor lets this file
// exercise the docked header's no-IntersectionObserver fallback in isolation.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: ReactNode;
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useSession: () => ({ isLoaded: true, isSignedIn: false, session: null }),
  useClerk: () => ({ setActive: async () => {} }),
  useSignIn: () => ({ fetchStatus: 'idle', errors: [], signIn: null }),
  SignedIn: () => null,
  SignedOut: ({ children }: { children: ReactNode }) => children,
}));

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value });
}

describe('HeaderNav docked scroll state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setScrollY(0);
  });

  it('falls back to a passive scroll listener without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    setScrollY(0);

    const { unmount } = render(
      <HeaderNav authMode='public-static' presentation='marketing-glass' />
    );
    const header = screen.getByTestId('header-nav');

    expect(header).toHaveClass('header-nav--docked');
    expect(header).not.toHaveAttribute('data-scrolled');
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function), {
      passive: true,
    });

    setScrollY(HEADER_DOCK_SCROLL_THRESHOLD_PX);
    fireEvent.scroll(window);
    expect(header).not.toHaveAttribute('data-scrolled');

    setScrollY(HEADER_DOCK_SCROLL_THRESHOLD_PX + 1);
    fireEvent.scroll(window);
    expect(header).toHaveAttribute('data-scrolled', 'true');

    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('starts scrolled when the page loads below the threshold', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    setScrollY(400);

    render(
      <HeaderNav authMode='public-static' presentation='homepage-embedded' />
    );

    expect(screen.getByTestId('header-nav')).toHaveAttribute(
      'data-scrolled',
      'true'
    );
  });

  it('keeps the default presentation undocked with no sentinel or listener', () => {
    const add = vi.spyOn(window, 'addEventListener');

    render(<HeaderNav authMode='public-static' />);

    expect(screen.getByTestId('header-nav')).not.toHaveClass(
      'header-nav--docked'
    );
    expect(screen.queryByTestId('header-nav-scroll-sentinel')).toBeNull();
    expect(add).not.toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      expect.anything()
    );
  });

  it('reveals the wordmark only for an icon logo', () => {
    const { rerender } = render(
      <HeaderNav
        authMode='public-static'
        presentation='marketing-glass'
        logoVariant='icon'
        logoReveal
      />
    );
    expect(screen.getByTestId('site-logo-link')).toHaveClass('logo-reveal');

    rerender(
      <HeaderNav
        authMode='public-static'
        presentation='marketing-glass'
        logoVariant='word'
        logoReveal
      />
    );
    expect(screen.getByTestId('site-logo-link')).not.toHaveClass('logo-reveal');
  });
});
