import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockUsePathname,
  mockUseSearchParams,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';
import { canonicalSidebarNavigation, chatNavItem } from './config';

/**
 * Guard for Tim's 2026-11-14 screenshot: on `/app`, Home and Audience were
 * both painted selected while a navigation resolved. At most one nav row may
 * carry `aria-current="page"`, and at most one may paint the selected style.
 */

vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => null,
}));

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

const SELECTED_PAINT = 'bg-sidebar-accent-active';

function navRows() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-navigation-item-id]')
  );
}

function selection() {
  const rows = navRows();
  return {
    current: rows
      .filter(row => row.getAttribute('aria-current') === 'page')
      .map(row => row.dataset.navigationItemId),
    painted: rows
      .filter(
        row =>
          row.hasAttribute('data-nav-highlighted') ||
          row.classList.contains(SELECTED_PAINT)
      )
      .map(row => row.dataset.navigationItemId),
  };
}

function expectAtMostOneSelected(route: string) {
  const { current, painted } = selection();
  expect(current.length, `${route} aria-current: ${current}`).toBeLessThan(2);
  expect(painted.length, `${route} selected paint: ${painted}`).toBeLessThan(2);
}

function setRoute(href: string) {
  const url = new URL(href, 'https://jovie.local');
  mockUsePathname.mockReturnValue(url.pathname);
  mockUseSearchParams.mockReturnValue(url.searchParams);
}

const routes = Array.from(
  new Set([
    APP_ROUTES.DASHBOARD,
    chatNavItem.href,
    ...canonicalSidebarNavigation.map(item => item.href),
  ])
);

describe('DashboardNav selection', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it.each(
    routes.flatMap(route => [
      { route, headerOwnsInbox: false },
      { route, headerOwnsInbox: true },
    ])
  )(
    'selects at most one row on $route (header owns Home: $headerOwnsInbox)',
    ({ route, headerOwnsInbox }) => {
      setRoute(route);
      renderDashboardNav({ renderFn: render, headerOwnsInbox });
      expectAtMostOneSelected(route);
    }
  );

  it('moves the selected paint to a pending destination instead of doubling it', () => {
    setRoute(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render });
    // Rail Home owns aria-current; the command-slot bell shares id `home`
    // without page ownership when the header does not own the bell.
    const home = document.querySelector<HTMLElement>(
      '[data-navigation-item-id="home"][aria-current="page"]'
    );
    expect(home).toBeInstanceOf(HTMLElement);
    expect(home).toHaveAttribute('data-nav-highlighted', 'true');

    const audience = screen.getByRole('link', { name: 'Audience' });
    audience.addEventListener('click', event => event.preventDefault());
    fireEvent.click(audience);

    // The route has not committed yet: `/app` is still the page...
    expect(home).toHaveAttribute('aria-current', 'page');
    // ...but only the destination paints selected while it loads.
    expect(home).not.toHaveAttribute('data-nav-highlighted');
    expect(home?.className).not.toContain(SELECTED_PAINT);
    expect(audience).toHaveAttribute('data-nav-highlighted', 'true');
    expectAtMostOneSelected(`${APP_ROUTES.DASHBOARD} -> Audience pending`);
  });

  it('drops the Home row when the header bell owns the inbox', () => {
    setRoute(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render, headerOwnsInbox: true });
    expect(
      screen.queryByRole('link', { name: 'Home' })
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-navigation-item-id="home"]')
    ).toBeNull();
    // New Chat still reaches the app from the rail.
    expect(screen.getByRole('link', { name: 'New Chat' })).toBeVisible();
  });
});
