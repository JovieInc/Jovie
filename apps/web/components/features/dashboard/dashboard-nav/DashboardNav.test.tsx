import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { NAVIGATION_DROP_OFF_MS } from '@/lib/tracking/navigation-telemetry';
import {
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

const runtimeUpdateState = vi.hoisted(() => ({ available: false }));
vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () =>
    runtimeUpdateState.available ? { available: true } : null,
}));

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch, ...props }, ref) {
    return <a {...props} data-prefetch={String(prefetch)} ref={ref} />;
  }),
}));

function readWebSource(sourcePath: string): string {
  const webRoot = process.cwd().endsWith('/apps/web')
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
  return readFileSync(resolve(webRoot, sourcePath), 'utf8');
}

describe('Linear-scale density (founder lock 2026-09-25)', () => {
  it('gives the nav sections and threads block the wider pt-5 top gap', () => {
    const source = readFileSync(
      resolve(__dirname, './DashboardNav.tsx'),
      'utf8'
    );
    expect(source).not.toContain("SidebarGroupContent className='pb-2 pt-4'");
    expect(source).toContain("SidebarGroupContent className='pb-2 pt-5'");
    expect(source).not.toContain("<div className='pt-4'>");
    expect(source).toContain("<div className='pt-5'>");
  });
});

describe('DashboardNav route warming', () => {
  afterEach(() => {
    vi.useRealTimers();
    runtimeUpdateState.available = false;
    resetDashboardNavTestMocks();
  });

  it.each([false, true])(
    'leaves home attention to the brand row and retains destinations with INBOX_HOME=%s',
    inboxHome => {
      const label = inboxHome ? 'Inbox' : 'Home';
      const destinations = () =>
        screen.getAllByRole('link').map(link => ({
          label: link.getAttribute('aria-label') ?? link.textContent?.trim(),
          href: link.getAttribute('href'),
        }));
      const baseline = renderDashboardNav({
        renderFn: render,
        appFlags: { INBOX_HOME: inboxHome },
      });
      const attention = document.querySelector('[data-inbox-attention]');
      expect(attention).toHaveAccessibleName(label);
      expect(attention).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
      const retained = destinations();
      const attentionIndex = screen
        .getAllByRole('link')
        .findIndex(link => link === attention);
      retained.splice(attentionIndex, 1);
      expect(retained.length).toBeGreaterThan(0);
      baseline.unmount();
      renderDashboardNav({
        renderFn: render,
        headerOwnsInbox: true,
        appFlags: { INBOX_HOME: inboxHome },
      });
      expect(document.querySelector('[data-inbox-attention]')).toBeNull();
      expect(destinations()).toEqual(retained);
      expect(
        document.querySelector('[data-sidebar-search-divider]')
      ).toBeNull();
    }
  );

  it('keeps the divider when a search surface precedes navigation actions', () => {
    renderDashboardNav({
      renderFn: render,
      navChildren: <button type='button'>Search</button>,
    });
    expect(screen.getByRole('button', { name: 'Search' })).toBeVisible();
    expect(
      document.querySelector('[data-sidebar-search-divider]')
    ).toBeInTheDocument();
  });

  it('fully prefetches every canonical dynamic customer route', () => {
    renderDashboardNav({
      renderFn: render,
      appFlags: { PROFILES_WORKSPACE: true },
    });

    for (const label of ['New Chat', 'Identity', 'Work', 'Audience']) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'data-prefetch',
        'true'
      );
    }
    const homeLinks = screen.getAllByRole('link', { name: 'Home' });
    expect(homeLinks).toHaveLength(2);
    for (const link of homeLinks) {
      expect(link).toHaveAttribute('data-prefetch', 'true');
    }
    for (const label of ['Library', 'Links', 'Contacts', 'Calendar', 'Tasks']) {
      expect(
        screen.queryByRole('link', { name: label })
      ).not.toBeInTheDocument();
    }
  });

  it('acknowledges New Chat immediately while retaining authenticated content', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({
      renderFn: render,
      children: (
        <main data-testid='authenticated-route-content'>Current route</main>
      ),
    });

    const newChat = screen.getByRole('link', { name: 'New Chat' });
    newChat.addEventListener('click', event => event.preventDefault());
    fireEvent.click(newChat);

    expect(newChat).toHaveAttribute('aria-busy', 'true');
    expect(newChat).toHaveAttribute('data-navigation-item-id', 'chat');
    expect(newChat).toHaveAttribute('data-navigation-pending', 'true');
    expect(newChat).toHaveClass('size-6', 'rounded-full', 'opacity-70');
    expect(screen.getByTestId('authenticated-route-content')).toHaveTextContent(
      'Current route'
    );
  });

  it('acknowledges a sidebar destination on click without changing row geometry', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render });

    const work = screen.getByRole('link', { name: 'Work' });
    work.addEventListener('click', event => event.preventDefault());
    fireEvent.click(work);

    expect(work).toHaveAttribute('aria-busy', 'true');
    expect(work).toHaveAttribute('data-navigation-item-id', 'library');
    expect(work).toHaveAttribute('data-navigation-pending', 'true');
    expect(work.className).toContain('bg-sidebar-accent-active');
  });

  it('recovers the pending acknowledgment after a failed no-URL transition', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render });

    const work = screen.getByRole('link', { name: 'Work' });
    work.addEventListener('click', event => event.preventDefault());

    vi.useFakeTimers();
    try {
      fireEvent.click(work);
      expect(work).toHaveAttribute('data-navigation-pending', 'true');

      // The URL never commits (the transition failed or was aborted), so the
      // acknowledgment must recover on the navigation drop-off window.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(work).not.toHaveAttribute('data-navigation-pending');
      expect(work).not.toHaveAttribute('aria-busy');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['inbox', 'chat', 'home'] as const)(
    'clears a stalled %s acknowledgment and accepts a retry without replacing the source content',
    itemId => {
      vi.useFakeTimers();
      mockUsePathname.mockReturnValue(APP_ROUTES.CALENDAR);
      const view = renderDashboardNav({
        renderFn: render,
        children: <main data-testid='retained-route'>Source content</main>,
      });
      const link = view.container.querySelector(
        `[data-navigation-item-id="${itemId}"]`
      );
      expect(link).toBeInstanceOf(HTMLElement);
      if (!(link instanceof HTMLElement)) return;
      link.addEventListener('click', event => event.preventDefault());
      fireEvent.click(link);
      expect(link).toHaveAttribute('aria-busy', 'true');

      act(() => vi.advanceTimersByTime(NAVIGATION_DROP_OFF_MS));

      expect(link).not.toHaveAttribute('aria-busy');
      expect(link).not.toHaveAttribute('data-navigation-pending');
      expect(screen.getByTestId('retained-route')).toHaveTextContent(
        'Source content'
      );
      fireEvent.click(link);
      expect(link).toHaveAttribute('aria-busy', 'true');
    }
  );

  it('clears a pending acknowledgment immediately when connectivity is lost', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({ renderFn: render });
    const link = screen.getByRole('link', { name: 'New Chat' });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
    expect(link).toHaveAttribute('aria-busy', 'true');

    act(() => globalThis.dispatchEvent(new Event('offline')));

    expect(link).not.toHaveAttribute('aria-busy');
  });

  it('shows runtime update attention on the existing Inbox bell while preserving opportunity counts', () => {
    runtimeUpdateState.available = true;
    const pending = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'available', pendingCount: 3 },
      },
    });
    expect(
      pending.getByRole('link', { name: 'Home — App Update Available' })
    ).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(
      pending.getByRole('status', { name: '3 pending items' })
    ).toHaveTextContent('3');
    // text-background emits no CSS (no --color-background token); the badge
    // count must use the base-color token on its accent fill.
    expect(
      pending.getByRole('status', { name: '3 pending items' })
    ).toHaveClass('bg-accent', 'text-(--color-bg-base)');
    pending.unmount();

    const updateOnly = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });
    const updateLink = updateOnly.getByRole('link', {
      name: 'Home — App Update Available',
    });
    expect(updateLink).toHaveAttribute('data-inbox-attention', 'available');
    expect(
      updateLink.querySelector('[data-inbox-runtime-update]')
    ).not.toBeNull();
    updateOnly.unmount();

    runtimeUpdateState.available = false;
    const caughtUp = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });
    const link = caughtUp.container.querySelector(
      '[data-navigation-item-id="inbox"]'
    );
    expect(link).toHaveAccessibleName('Home');
    if (!(link instanceof HTMLElement)) return;
    expect(link).toHaveAttribute('data-inbox-attention', 'empty');
    expect(link.querySelector('[data-inbox-runtime-update]')).toBeNull();
  });

  it('labels the header bell Inbox only when INBOX_HOME is on', () => {
    const view = renderDashboardNav({
      renderFn: render,
      appFlags: { INBOX_HOME: true },
    });
    expect(
      view.container.querySelector('[data-navigation-item-id="inbox"]')
    ).toHaveAccessibleName('Inbox');
  });

  // JOV-6181: the rail's New Chat affordance must never carry the terminal
  // label fade — on the compact create treatment it sheared the trailing "t"
  // ("Chat" -> "Cha") with rail space free. The canonical rail renders the
  // action icon-only inside the search slot; this walks the real production
  // tree so any future labelled New Chat row stays unmasked.
  it('keeps the New Chat affordance unmasked in the production rail', () => {
    const { container } = renderDashboardNav({ renderFn: render });

    const newChatAction = screen.getByRole('link', { name: 'New Chat' });
    expect(newChatAction).toBeInTheDocument();
    expect(newChatAction).toHaveAttribute('aria-label', 'New Chat');

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    for (const el of Array.from(nav?.querySelectorAll('*') ?? [])) {
      if (el.textContent?.trim() === 'New Chat') {
        expect(el.className).not.toContain('mask-image');
      }
    }
  });

  it('retains New Chat while secondary commands leave collapsed keyboard and AX navigation', () => {
    const view = renderDashboardNav({
      renderFn: render,
      sidebarProps: { defaultOpen: false },
      navChildren: <button type='button'>Search fixture</button>,
    });
    const create = view.getByRole('link', { name: 'New Chat' });
    expect(create.closest('[inert], [aria-hidden="true"]')).toBeNull();
    expect(view.queryByRole('button', { name: 'Search fixture' })).toBeNull();
    const secondary = view.container.querySelector(
      '[data-sidebar-search-slot] > [inert]'
    );
    expect(secondary).toHaveAttribute('aria-hidden', 'true');
    expect(
      secondary?.querySelector('[data-navigation-item-id="inbox"]')
    ).not.toBeNull();
  });

  it('imports sidebar chrome from the modular sidebar specifier', () => {
    const source = readWebSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );
    expect(source).toContain("@/components/organisms/sidebar'");
    expect(source).not.toContain(`@/components/organisms/${'Sidebar'}'`);
  });
});
