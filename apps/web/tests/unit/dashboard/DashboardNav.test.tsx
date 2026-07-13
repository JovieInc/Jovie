import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { APP_ROUTES, buildLibraryViewRoute } from '@/constants/routes';
import {
  mockRouterPush,
  mockUseChatConversationsQuery,
  mockUsePathname,
  mockUsePlanGate,
  mockUseTaskStatsQuery,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';
import { fastRender } from '@/tests/utils/fast-render';

describe('DashboardNav', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders the canonical 6-item nav IA (GH #12634)', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(getByRole('link', { name: 'Chat' }).getAttribute('href')).toBe(
      APP_ROUTES.CHAT
    );
    expect(getByRole('button', { name: 'Search' })).toBeDefined();
    expect(getByRole('link', { name: 'Library' }).getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
    expect(getByRole('link', { name: 'Contacts' }).getAttribute('href')).toBe(
      APP_ROUTES.CONTACTS
    );
    expect(getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe(
      APP_ROUTES.CALENDAR
    );
    expect(getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe(
      APP_ROUTES.TASKS
    );
    // Inbox is behind the INBOX_HOME rollout flag (default off) — not
    // rendered without it.
    expect(queryByRole('link', { name: 'Inbox' })).toBeNull();
    // Demoted from the primary 6-item IA — no longer primary nav rows.
    expect(queryByRole('link', { name: 'Audience' })).toBeNull();
    expect(queryByRole('button', { name: 'Artist Profile' })).toBeNull();
    expect(queryByRole('link', { name: 'Touring' })).toBeNull();
    expect(queryByRole('link', { name: 'Earnings' })).toBeNull();
  });

  it('renders Inbox first when INBOX_HOME is enabled', () => {
    const { getByRole, getAllByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { INBOX_HOME: true },
    });

    expect(getByRole('link', { name: 'Inbox' }).getAttribute('href')).toBe(
      APP_ROUTES.DASHBOARD
    );

    const links = getAllByRole('link');
    const primaryLabels = links
      .map(link => link.textContent)
      .filter((label): label is string =>
        ['Inbox', 'Chat', 'Library', 'Contacts', 'Calendar', 'Tasks'].some(
          canonical => label?.includes(canonical)
        )
      );
    expect(primaryLabels[0]).toContain('Inbox');
  });

  it('keeps Library in the shell top nav', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getByRole('link', { name: 'Library' }).getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
  });

  it('applies active state to current page', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.LIBRARY);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const activeLink = getByRole('link', { name: 'Library' });
    expect(activeLink.getAttribute('aria-current')).toBe('page');
  });

  it('keeps the legacy releases dashboard alias active', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_RELEASES);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const releasesLink = getByRole('link', { name: 'Library' });
    expect(releasesLink.getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
    expect(releasesLink.getAttribute('aria-current')).toBe('page');
  });

  it('marks Inbox active only on exactly /app, not /app/* subroutes', () => {
    mockUsePathname.mockReturnValueOnce(`${APP_ROUTES.DASHBOARD}/anything`);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { INBOX_HOME: true },
    });

    expect(
      getByRole('link', { name: 'Inbox' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('marks Inbox active on exactly /app', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { INBOX_HOME: true },
    });

    expect(
      getByRole('link', { name: 'Inbox' }).getAttribute('aria-current')
    ).toBe('page');
  });

  it('only marks Chat active on the chat root', () => {
    mockUsePathname.mockReturnValueOnce(`${APP_ROUTES.CHAT}/thread-123`);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(
      getByRole('link', { name: 'Chat' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('keeps Chat on the default shell tone when it is inactive', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    const newThreadLink = getByRole('link', { name: 'Chat' });
    expect(newThreadLink.className).toContain('text-sidebar-muted/80');
    expect(newThreadLink.className).not.toContain(
      'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,white_8%)]'
    );
  });

  it('renders one canonical Chat nav row in Design V1', () => {
    const { getAllByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getAllByRole('link', { name: 'Chat' })).toHaveLength(1);
  });

  it('opens the global command palette from Search instead of navigating', () => {
    const onOpenPalette = vi.fn();
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenPalette);

    try {
      const { getByRole, queryByRole } = renderDashboardNav({
        renderFn: fastRender,
        appFlags: { DESIGN_V1: true },
      });

      const searchButton = getByRole('button', { name: 'Search' });
      expect(queryByRole('link', { name: 'Search' })).toBeNull();

      fireEvent.click(searchButton);

      expect(onOpenPalette).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenPalette);
    }
  });

  it('maps real conversation metadata into unread and running thread rows', () => {
    localStorage.setItem(
      'jovie:sidebar-thread-read-at',
      JSON.stringify({
        'conv-unread': '2026-05-22T08:00:00.000Z',
        'conv-running': '2026-05-22T09:00:00.000Z',
      })
    );
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'conv-unread',
          title: 'Unread answer',
          createdAt: '2026-05-22T07:00:00.000Z',
          updatedAt: '2026-05-22T10:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
        {
          id: 'conv-running',
          title: 'Running task',
          createdAt: '2026-05-22T07:00:00.000Z',
          updatedAt: '2026-05-22T10:30:00.000Z',
          latestMessageRole: 'user',
          latestTurnStatus: 'streaming',
        },
      ],
      isError: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getByRole('link', { name: 'Unread answer' })).toHaveClass(
      'text-primary-token'
    );
    expect(getByRole('link', { name: 'Running task' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.CHAT}/conv-running`
    );
    expect(container.querySelector('.anim-calm-breath')).toBeTruthy();
  });

  it('handles collapsed state', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      sidebarProps: { defaultOpen: false },
      appFlags: { DESIGN_V1: true },
    });

    const newThreadLink = getByRole('link', { name: 'Chat' });
    expect(newThreadLink.className).toContain(
      'group-data-[collapsible=icon]:justify-center'
    );
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: false,
    });
  });

  it('renders the flat 6-item primary nav without a duplicate Settings row', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getByRole('link', { name: 'Chat' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
    expect(getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      buildLibraryViewRoute('releases')
    );
    expect(getByRole('link', { name: 'Contacts' })).toHaveAttribute(
      'href',
      APP_ROUTES.CONTACTS
    );
    expect(getByRole('link', { name: 'Calendar' })).toHaveAttribute(
      'href',
      APP_ROUTES.CALENDAR
    );
    expect(queryByRole('button', { name: 'Artist' })).toBeNull();
    expect(queryByRole('button', { name: 'More' })).toBeNull();
    expect(queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(queryByRole('button', { name: 'Work' })).toBeNull();
    expect(queryByRole('button', { name: 'Catalog' })).toBeNull();
    expect(queryByRole('button', { name: 'Growth' })).toBeNull();
  });

  it('renders full admin navigation for admin users', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: { isAdmin: true },
    });

    expect(getByRole('link', { name: 'People' }).getAttribute('href')).toBe(
      APP_ROUTES.ADMIN_PEOPLE
    );
    expect(getByRole('link', { name: 'Growth' }).getAttribute('href')).toBe(
      APP_ROUTES.ADMIN_GROWTH
    );
    expect(getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe(
      APP_ROUTES.ADMIN_ACTIVITY
    );
  });

  it('defaults the Admin group collapsed', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        isAdmin: true,
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(getByRole('button', { name: 'Admin' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('highlights Library when the legacy library route is current', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_LIBRARY);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('renders settings groups with canonical Account and Artist labels', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.SETTINGS_ACCOUNT);

    const { getAllByText, getByRole, queryByText } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(getAllByText('Account').length).toBeGreaterThan(0);
    expect(getAllByText('Artist').length).toBeGreaterThan(0);
    expect(
      getByRole('link', { name: 'Audience & Tracking' }).getAttribute('href')
    ).toBe(APP_ROUTES.SETTINGS_AUDIENCE);
    expect(queryByText('Workspace')).toBeNull();
  });

  it('disables task stats query on nested demo routes', () => {
    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');

    renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(mockUseTaskStatsQuery).toHaveBeenCalledWith('profile_123', {
      enabled: false,
      seenAt: null,
    });
  });

  it('renders the tasks badge when active task count is non-zero', () => {
    mockUseTaskStatsQuery.mockReturnValueOnce({
      data: {
        backlog: 1,
        todo: 2,
        inProgress: 4,
        done: 0,
        cancelled: 0,
        activeTodoCount: 7,
      },
    });

    const { getByText } = renderDashboardNav({ renderFn: fastRender });

    expect(getByText('7')).toBeDefined();
  });

  it('uses the new task count after Tasks has been opened', () => {
    localStorage.setItem('jovie:tasks-seen-at', '2026-05-24T00:00:00.000Z');
    mockUseTaskStatsQuery.mockReturnValueOnce({
      data: {
        backlog: 1,
        todo: 2,
        inProgress: 4,
        done: 0,
        cancelled: 0,
        activeTodoCount: 7,
        newActiveTodoCount: 2,
      },
    });

    const { getByText, queryByText } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(getByText('2')).toBeDefined();
    expect(queryByText('7')).toBeNull();
    expect(mockUseTaskStatsQuery).toHaveBeenCalledWith('profile_123', {
      enabled: true,
      seenAt: '2026-05-24T00:00:00.000Z',
    });
  });

  it('keeps task badges inline with Design V1 shell nav rows', () => {
    mockUseTaskStatsQuery.mockReturnValueOnce({
      data: {
        backlog: 1,
        todo: 2,
        inProgress: 4,
        done: 0,
        cancelled: 0,
        activeTodoCount: 7,
      },
    });

    const { getByRole, getByText } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    const tasksLink = getByRole('link', { name: 'Tasks 7' });
    expect(tasksLink.className).toContain('h-7');
    expect(tasksLink.className).toContain(
      'grid-cols-[22px_minmax(0,1fr)_34px]'
    );
    expect(tasksLink.className).toContain('text-xs');
    expect(getByText('7')).toBeDefined();
  });

  it('renders the Pro badge when tasks are locked', () => {
    mockUsePlanGate.mockReturnValueOnce({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });

    const { getByText } = renderDashboardNav({ renderFn: fastRender });

    expect(getByText('Pro')).toBeDefined();
    expect(mockUseTaskStatsQuery).toHaveBeenCalledWith('', {
      enabled: false,
      seenAt: null,
    });
  });

  it('does not render the Pro badge while task entitlements are loading', () => {
    mockUsePlanGate.mockReturnValueOnce({
      canAccessTasksWorkspace: false,
      isLoading: true,
    });

    const { queryByText } = renderDashboardNav({ renderFn: fastRender });

    expect(queryByText('Pro')).toBeNull();
  });
});
