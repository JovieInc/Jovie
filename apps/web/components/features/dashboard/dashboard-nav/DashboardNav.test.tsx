import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSidebar } from '@/components/shell/SidebarContext';
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

function CollapseFixture() {
  const { toggleSidebar } = useSidebar();
  return (
    <button type='button' onClick={toggleSidebar}>
      Toggle Fixture Rail
    </button>
  );
}

describe('Linear-scale density (founder lock 2026-09-25)', () => {
  it('retains creation and destination order when the shared header owns Home', () => {
    renderDashboardNav({ renderFn: render, headerOwnsInbox: true });
    const destinations = Array.from(
      document.querySelectorAll('[data-navigation-item-id]')
    ).map(element => element.getAttribute('data-navigation-item-id'));
    expect(destinations).toEqual(['chat', 'presence', 'library', 'audience']);
  });
});

describe('DashboardNav route warming', () => {
  afterEach(() => {
    vi.useRealTimers();
    runtimeUpdateState.available = false;
    resetDashboardNavTestMocks();
  });

  it('keeps history out of Settings while preserving New Chat on Work', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.SETTINGS);
    const settings = renderDashboardNav({ renderFn: render });
    expect(screen.queryByRole('button', { name: 'Chat History' })).toBeNull();
    settings.unmount();
    mockUsePathname.mockReturnValue(APP_ROUTES.LIBRARY);
    renderDashboardNav({ renderFn: render });
    expect(
      screen.getByRole('button', { name: 'Chat History' })
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'New Chat' })).toBeInTheDocument();
  });

  it('leaves home attention to the brand row and retains destinations', () => {
    const destinations = () =>
      screen.getAllByRole('link').map(link => ({
        label: link.getAttribute('aria-label') ?? link.textContent?.trim(),
        href: link.getAttribute('href'),
      }));
    const baseline = renderDashboardNav({
      renderFn: render,
    });
    const attention = document.querySelector('[data-inbox-attention]');
    // Qualified so it does not collide with the Home nav row.
    expect(attention).toHaveAccessibleName('Home — notifications');
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
    });
    expect(document.querySelector('[data-inbox-attention]')).toBeNull();
    // The header bell is the Home entry, so the rail's Home row goes too;
    // every other destination is retained.
    expect(destinations()).toEqual(
      retained.filter(destination => destination.href !== APP_ROUTES.DASHBOARD)
    );
    expect(
      screen.queryByRole('link', { name: 'Home', exact: true })
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar-search-divider]')).toBeNull();
  });

  it('gives New Chat a labeled row on the icon column when the header owns Home and search', () => {
    renderDashboardNav({
      renderFn: render,
      headerOwnsInbox: true,
    });
    // The command slot used to hold a lone "+" here, leaving an empty row.
    expect(document.querySelector('[data-sidebar-search-slot]')).toBeNull();
    const createSection = document.querySelector('[data-nav-section="create"]');
    expect(createSection).toBeInTheDocument();
    const newChat = screen.getByRole('link', { name: 'New Chat' });
    expect(createSection).toContainElement(newChat);
    expect(newChat).toHaveTextContent('New Chat');
  });

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

  it('does not full-prefetch customer routes on mount', () => {
    renderDashboardNav({
      renderFn: render,
    });

    for (const label of ['New Chat', 'Identity', 'Work', 'Audience']) {
      expect(screen.getByRole('link', { name: label })).toHaveAttribute(
        'data-prefetch',
        'false'
      );
    }
    // Exact "Home" is the nav row only; the rail bell uses a qualified name.
    const homeLinks = screen.getAllByRole('link', { name: 'Home', exact: true });
    expect(homeLinks).toHaveLength(1);
    for (const link of homeLinks) {
      expect(link).toHaveAttribute('data-prefetch', 'false');
    }
    const attention = document.querySelector('[data-inbox-attention]');
    expect(attention).toHaveAttribute('data-prefetch', 'false');
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
    expect(newChat).toHaveClass('size-6', 'opacity-70');
    expect(newChat.parentElement).toHaveAttribute('data-sidebar-search-slot');
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

  it.each(['chat', 'home'] as const)(
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

  it('keeps opportunity counts on the Home bell and leaves app updates to the shell pill', () => {
    // The update now lives in the shell's corner pill; Home shows
    // no update, so the bell must not point there for one.
    runtimeUpdateState.available = true;
    const pending = renderDashboardNav({
      renderFn: render,
      overrides: {
        inboxNavigation: { state: 'available', pendingCount: 3 },
      },
    });
    const pendingLink = pending.container.querySelector(
      '[data-navigation-item-id="home"]'
    );
    expect(pendingLink).toHaveAccessibleName(
      'Home — 3 Items Need Attention'
    );
    expect(pendingLink).toHaveAttribute('href', APP_ROUTES.DASHBOARD);
    expect(pendingLink).toHaveAttribute('data-inbox-attention', 'available');
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
    expect(
      updateOnly.queryByRole('link', { name: /App Update Available/ })
    ).toBeNull();
    const link = updateOnly.container.querySelector(
      '[data-navigation-item-id="home"]'
    );
    expect(link).toHaveAccessibleName('Home — all caught up');
    expect(link).toHaveAttribute('data-inbox-attention', 'empty');
    expect(link?.querySelector('[data-inbox-runtime-update]')).toBeNull();
    runtimeUpdateState.available = false;
  });

  it('labels the rail Home bell with a qualified accessible name', () => {
    const view = renderDashboardNav({
      renderFn: render,
    });
    expect(
      view.container.querySelector('[data-navigation-item-id="home"]')
    ).toHaveAccessibleName('Home — notifications');
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
    expect(newChatAction.className).toContain('focus-visible:ring-inset');
    expect(newChatAction.closest('nav')?.className).not.toContain(
      'transform-gpu'
    );
    expect(newChatAction.closest('nav')?.className).toContain('overflow-clip');
    expect(newChatAction.closest('nav')?.className).toContain(
      'overflow-anchor-none'
    );
    const commandSlot = newChatAction.closest('[data-sidebar-search-slot]');
    expect(commandSlot?.className).toContain('lg:overflow-hidden');
    // The slot sits on the sidebar column: no private margin beside nav rows.
    expect(commandSlot?.className).not.toMatch(/(^|\s)mx-\d/);

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
      secondary?.querySelector('[data-navigation-item-id="home"]')
    ).not.toBeNull();
  });

  it('keeps the one canonical action at the top in expanded and compact modes', () => {
    const view = renderDashboardNav({ renderFn: render });
    const expanded = screen.getByRole('link', { name: 'New Chat' });
    expect(expanded).toHaveAttribute('href', APP_ROUTES.CHAT);
    expect(expanded.parentElement).toHaveAttribute('data-sidebar-search-slot');
    expect(
      document.querySelector(
        '[data-sidebar-search-slot] a[aria-label="New Chat"]'
      )
    ).toBe(expanded);
    expect(
      screen.queryByRole('button', { name: 'Filter Unread Chats' })
    ).toBeNull();
    view.unmount();
    renderDashboardNav({
      renderFn: render,
      sidebarProps: { defaultOpen: false },
    });
    const compact = screen.getByRole('link', { name: 'New Chat' });
    expect(compact.closest('[data-sidebar-search-slot]')).not.toBeNull();
    expect(compact).toHaveAttribute('href', expanded.getAttribute('href'));
  });

  it('preserves the mounted action and focus through sidebar changes', () => {
    renderDashboardNav({ renderFn: render, children: <CollapseFixture /> });
    const create = screen.getByRole('link', { name: 'New Chat' });
    create.focus();
    expect(create).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle Fixture Rail' })
    );
    const compact = screen.getByRole('link', { name: 'New Chat' });
    expect(compact.closest('[data-sidebar-search-slot]')).not.toBeNull();
    expect(compact).toBe(create);
    expect(compact).toHaveFocus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle Fixture Rail' })
    );
    const expanded = screen.getByRole('link', { name: 'New Chat' });
    expect(expanded.parentElement).toHaveAttribute('data-sidebar-search-slot');
    expect(expanded).toBe(create);
    expect(expanded).toHaveFocus();
  });

  it('imports sidebar chrome from the modular sidebar specifier', () => {
    const source = readWebSource(
      'components/features/dashboard/dashboard-nav/DashboardNav.tsx'
    );
    expect(source).toContain("@/components/organisms/sidebar'");
    expect(source).not.toContain(`@/components/organisms/${'Sidebar'}'`);
  });
});
