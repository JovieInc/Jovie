import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Circle, Home, Settings, Users } from 'lucide-react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiquidGlassMenu,
  type LiquidGlassMenuItem,
} from '@/components/dashboard/organisms/LiquidGlassMenu';
import { fastRender } from '@/tests/utils/fast-render';

const mockUsePathname = vi.fn(() => '/app/dashboard');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useParams: () => ({}),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) => (
    <a
      href={href}
      onClick={event => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

const PRIMARY_ITEMS: LiquidGlassMenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/app/dashboard', icon: Home },
  { id: 'audience', label: 'Audience', href: '/app/audience', icon: Users },
];

const EXPANDED_ITEMS: LiquidGlassMenuItem[] = [
  { id: 'settings', label: 'Settings', href: '/app/settings', icon: Settings },
];

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof LiquidGlassMenu>> = {}
) {
  return fastRender(
    <LiquidGlassMenu
      primaryItems={PRIMARY_ITEMS}
      expandedItems={EXPANDED_ITEMS}
      adminItems={[
        { id: 'admin', label: 'Admin', href: '/app/admin', icon: Circle },
      ]}
      {...overrides}
    />
  );
}

describe('LiquidGlassMenu', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/app/dashboard');
  });

  it('starts collapsed and toggles expanded state', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderMenu();

    const toggle = getByRole('button', { name: 'More options' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    const { container, getByRole } = renderMenu();

    const toggle = getByRole('button', { name: 'More options' });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const backdrop = container.querySelector('[data-testid="menu-backdrop"]');
    expect(backdrop).toBeTruthy();
    await user.click(backdrop as HTMLElement);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and restores focus to toggle button', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderMenu();

    const toggle = getByRole('button', { name: 'More options' });
    await user.click(toggle);

    const expandedNav = getByRole('navigation', {
      name: 'Expanded navigation menu',
    });
    const firstExpandedLink = expandedNav.querySelector(
      'a[href="/app/dashboard"]'
    );
    expect(firstExpandedLink).toBe(document.activeElement);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle).toBe(document.activeElement);
  });

  it('closes on pathname change', async () => {
    const user = userEvent.setup();
    const { getByRole, rerender } = renderMenu();

    const toggle = getByRole('button', { name: 'More options' });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    mockUsePathname.mockReturnValue('/app/settings');

    rerender(
      <LiquidGlassMenu
        primaryItems={PRIMARY_ITEMS}
        expandedItems={EXPANDED_ITEMS}
      />
    );

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when selecting an expanded menu item', async () => {
    const user = userEvent.setup();
    const { getByRole } = renderMenu();

    const toggle = getByRole('button', { name: 'More options' });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(getByRole('link', { name: 'Settings' }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('wires aria-controls and keeps safe-area inset bottom padding', () => {
    const { container, getByRole } = renderMenu();

    const expandedNav = getByRole('navigation', {
      name: 'Expanded navigation menu',
    });
    const toggle = getByRole('button', { name: 'More options' });

    expect(toggle.getAttribute('aria-controls')).toBe(expandedNav.id);
    expect(container.innerHTML).toContain(
      'pb-[calc(env(safe-area-inset-bottom)+0.5rem)]'
    );
  });
});
