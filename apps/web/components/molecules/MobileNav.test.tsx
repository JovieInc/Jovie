import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MobileNav } from './MobileNav';

const authState = vi.hoisted(() => ({ signedIn: false }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/about',
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: authState.signedIn }),
}));

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => authState.signedIn,
}));

describe('MobileNav', () => {
  afterEach(() => {
    authState.signedIn = false;
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

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('data-slot', 'plain-button');
    expect(toggle).toHaveAttribute('type', 'button');
    fireEvent.click(toggle);

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
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute(
      'href',
      '/signin'
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
    expect(source).not.toContain("label: 'Log In'");
  });

  it('lands the public CTA in the /start flow by default', () => {
    render(<MobileNav navLinks={[{ href: '/pricing', label: 'Pricing' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

    const signupLink = screen.getByRole('link', { name: 'Sign up' });
    expect(signupLink).toHaveAttribute('href', '/start');
    expect(signupLink.getAttribute('href')).not.toContain('/waitlist');
  });

  it('documents the sentence-case login label as an intentional casing exception', () => {
    const source = readFileSync(resolve(__dirname, './MobileNav.tsx'), 'utf8');
    expect(source).toContain('ui-casing-allow:');
    expect(source).toContain("label: 'Log in'");
  });
});

// State and accessibility coverage for the menu toggle and the open sheet.
// The sheet is portalled to document.body, so axe runs over the whole body.
describe('MobileNav states', () => {
  const LINKS = [
    { href: '/', label: 'Jovie' },
    { href: '/pricing', label: 'Pricing' },
  ];

  afterEach(() => {
    authState.signedIn = false;
    document.body.style.removeProperty('overflow');
  });

  it('renders only the closed toggle until it is pressed', async () => {
    const { container } = render(<MobileNav navLinks={LINKS} />);

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mobile-nav-panel');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('navigation')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('opens the sheet from the keyboard and closes it with Escape back on the toggle', async () => {
    const user = userEvent.setup();
    render(
      <MobileNav
        navLinks={LINKS}
        publicCtaHref='/start'
        publicCtaLabel='Get Started'
      />
    );

    await user.tab();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');

    const sheet = screen.getByRole('navigation', { name: 'Mobile Navigation' });
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(
      within(sheet)
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Jovie', 'Pricing', 'Log in', 'Get Started']);
    await expectNoA11yViolations(document.body);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes when a link or the scrim is pressed', async () => {
    const user = userEvent.setup();
    render(<MobileNav navLinks={LINKS} />);

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(screen.getByRole('link', { name: 'Pricing' }));
    expect(screen.queryByRole('navigation')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const scrim = document.body.querySelector('.fixed.inset-0');
    expect(scrim).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(scrim as Element);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('keeps Log in and the CTA when there are no nav links', async () => {
    render(<MobileNav navLinks={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const sheet = screen.getByRole('navigation', { name: 'Mobile Navigation' });
    expect(
      within(sheet)
        .getAllByRole('link')
        .map(link => link.textContent)
    ).toEqual(['Log in', 'Sign up']);
    await expectNoA11yViolations(document.body);
  });

  it('drops Log in when the caller turns it off', () => {
    render(<MobileNav navLinks={LINKS} includePublicLogin={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
  });

  it('shows Open App and the account slot to a signed-in user', async () => {
    authState.signedIn = true;
    render(
      <MobileNav
        navLinks={LINKS}
        authenticatedUserSlot={<span>Account Menu</span>}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open App' })).toHaveAttribute(
      'href',
      '/app'
    );
    expect(screen.getByText('Account Menu')).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('has no axe violations for long labels in a right-to-left page', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <MobileNav
          navLinks={[
            {
              href: '/artist-profiles',
              label: 'Artist Profiles And Press Kits',
            },
          ]}
          publicCtaLabel='Claim Your Artist Profile Today'
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(
      screen.getByRole('link', { name: 'Artist Profiles And Press Kits' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });
});

describe('prerendered homepage pathname', () => {
  it('MobileNav.tsx reads "/index" as "/" via usePublicPathname', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'components/molecules/MobileNav.tsx'),
      'utf8'
    );
    expect(source).toContain('usePublicPathname');
    expect(source).not.toMatch(/\busePathname\b/);
  });
});
