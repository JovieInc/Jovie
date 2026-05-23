import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { APP_ROUTES } from '@/constants/routes';
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

  it('renders primary navigation items', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(getByRole('button', { name: 'Profile' })).toBeDefined();
    expect(getByRole('link', { name: 'Releases' })).toBeDefined();
    expect(getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe(
      APP_ROUTES.CALENDAR
    );
    expect(getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe(
      APP_ROUTES.TASKS
    );
    expect(getByRole('link', { name: 'Audience' })).toBeDefined();
    expect(getByRole('link', { name: 'Library' })).toBeDefined();
    expect(queryByRole('link', { name: 'Earnings' })).toBeNull();
  });

  it('renders Library navigation only when the new design flag is enabled', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { SHELL_CHAT_V1: true },
    });

    expect(getByRole('link', { name: 'Library' }).getAttribute('href')).toBe(
      APP_ROUTES.LIBRARY
    );
  });

  it('renders Calendar in the Design V1 user work section', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    const calendarLink = getByRole('link', { name: 'Calendar' });
    expect(calendarLink.getAttribute('href')).toBe(APP_ROUTES.CALENDAR);
    expect(calendarLink.className).toContain(
      'grid-cols-[20px_minmax(0,1fr)_40px]'
    );
  });

  it('applies active state to current page', () => {
    mockUsePathname.mockReturnValueOnce('/app/releases');
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const activeLink = getByRole('link', { name: 'Releases' });
    expect(activeLink.getAttribute('aria-current')).toBe('page');
  });

  it('keeps the legacy releases dashboard alias active', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_RELEASES);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const releasesLink = getByRole('link', { name: 'Releases' });
    expect(releasesLink.getAttribute('href')).toBe(APP_ROUTES.RELEASES);
    expect(releasesLink.getAttribute('aria-current')).toBe('page');
  });

  it('only marks New chat active on the chat root', () => {
    mockUsePathname.mockReturnValueOnce(`${APP_ROUTES.CHAT}/thread-123`);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { SHELL_CHAT_V1: true },
    });

    expect(
      getByRole('link', { name: 'New chat' }).getAttribute('aria-current')
    ).toBeNull();
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
    const { container } = renderDashboardNav({
      renderFn: fastRender,
      sidebarProps: { defaultOpen: false },
      appFlags: { DESIGN_V1: true },
    });

    const profileButton = container.querySelector('button[aria-pressed]');
    expect(profileButton).toBeTruthy();
    expect(profileButton?.className).toContain('justify-center');
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: false,
    });
  });

  it('differentiates primary and secondary nav styling', () => {
    const { container } = renderDashboardNav({ renderFn: fastRender });

    const nav = container.querySelector('nav');
    const menus = nav?.querySelectorAll('[data-sidebar="menu"]') ?? [];

    expect(menus.length).toBeGreaterThanOrEqual(1);

    const primaryMenuParent = (menus[0] as HTMLElement | undefined)
      ?.parentElement;
    const primaryGroup = primaryMenuParent?.parentElement;

    expect(primaryGroup?.className).toMatch(/space-y-/);
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

  it('defaults artist workspace and admin groups collapsed', () => {
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

    expect(getByRole('button', { name: 'Tim White' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(getByRole('button', { name: 'Admin' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('remembers an expanded artist workspace group', () => {
    localStorage.setItem('jovie:sidebar-section:artist-workspace', 'open');

    const { getByRole } = renderDashboardNav({
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

    expect(getByRole('button', { name: 'Tim White' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('renders with different pathname', () => {
    mockUsePathname.mockReturnValueOnce('/app/audience');

    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const audienceLink = getByRole('link', { name: 'Audience' });
    expect(audienceLink.getAttribute('aria-current')).toBe('page');
  });

  it('applies active state to Library when the flagged route is current', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_LIBRARY);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { SHELL_CHAT_V1: true },
    });

    expect(
      getByRole('link', { name: 'Library' }).getAttribute('aria-current')
    ).toBe('page');
  });

  it('renders settings groups with the selected artist name', () => {
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

    expect(getAllByText('General').length).toBeGreaterThan(0);
    expect(getAllByText('Tim White').length).toBeGreaterThan(0);
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
    expect(tasksLink.className).toContain('h-6.5');
    expect(tasksLink.className).toContain(
      'grid-cols-[20px_minmax(0,1fr)_40px]'
    );
    expect(tasksLink.className).toContain('text-[12.5px]');
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
