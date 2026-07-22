import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { OPEN_HEADER_SEARCH_EVENT } from '@/components/shell/header-search-events';
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

vi.mock('@/app/app/(shell)/chat/ChatPageClient', () => ({
  ChatPageClient: () => null,
}));

describe('DashboardNav', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders primary navigation items', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { PROFILES_WORKSPACE: true },
    });

    expect(getByRole('link', { name: 'New Chat' }).getAttribute('href')).toBe(
      APP_ROUTES.CHAT
    );
    expect(getByRole('button', { name: 'Search' })).toBeDefined();
    expect(getByRole('link', { name: 'Releases' }).getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
    expect(getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PROFILES
    );
    expect(getByRole('link', { name: 'Touring' }).getAttribute('href')).toBe(
      APP_ROUTES.TOUR_DATES
    );
    expect(getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe(
      APP_ROUTES.TASKS
    );
    expect(getByRole('link', { name: 'Audience' })).toBeDefined();
    expect(queryByRole('link', { name: 'Calendar' })).toBeNull();
    expect(queryByRole('link', { name: 'Library' })).toBeNull();
    expect(queryByRole('link', { name: 'Earnings' })).toBeNull();
  });

  it('renders Releases in the grouped shell top nav', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true, PROFILES_WORKSPACE: true },
    });

    expect(getByRole('link', { name: 'Releases' }).getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
  });

  it('shows Profiles only when its rollout flag is enabled', () => {
    const disabled = renderDashboardNav({ renderFn: fastRender });
    expect(disabled.queryByRole('link', { name: 'Profiles' })).toBeNull();
    disabled.unmount();

    const enabled = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { PROFILES_WORKSPACE: true },
    });
    expect(
      enabled.getByRole('link', { name: 'Profiles' }).getAttribute('href')
    ).toBe(APP_ROUTES.PROFILES);
  });

  it('renders artist work under the artist group in Design V1', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true, PROFILES_WORKSPACE: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(getByRole('button', { name: 'Artist' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PROFILES
    );
    const releasesLink = getByRole('link', { name: 'Releases' });
    expect(releasesLink.getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
    expect(releasesLink.className).toContain(
      'grid-cols-[22px_minmax(0,1fr)_34px]'
    );
    expect(getByRole('link', { name: 'Touring' }).getAttribute('href')).toBe(
      APP_ROUTES.TOUR_DATES
    );
    expect(queryByRole('link', { name: 'Calendar' })).toBeNull();
  });

  it('applies active state to current page', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.LIBRARY);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const activeLink = getByRole('link', { name: 'Releases' });
    expect(activeLink.getAttribute('aria-current')).toBe('page');
  });

  it('composes one current New Chat nav link with matching page heading and title', async () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    const { generateMetadata } = await import('@/app/app/(shell)/chat/page');
    const metadata = await generateMetadata();
    const title = String(metadata.title);

    const { container, getAllByRole, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
      children: (
        <DashboardHeader
          breadcrumbs={[{ label: title, href: APP_ROUTES.CHAT }]}
        />
      ),
    });

    expect(title).toBe('New Chat');
    expect(getByRole('link', { name: title })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(
      1
    );
    expect(getAllByRole('heading', { name: title, level: 1 })).toHaveLength(1);
  });

  it('keeps the legacy releases dashboard alias active', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_RELEASES);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const releasesLink = getByRole('link', { name: 'Releases' });
    expect(releasesLink.getAttribute('href')).toBe(
      buildLibraryViewRoute('releases')
    );
    expect(releasesLink.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark New Chat active on a chat thread', () => {
    mockUsePathname.mockReturnValueOnce(`${APP_ROUTES.CHAT}/thread-123`);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true, PROFILES_WORKSPACE: true },
    });

    expect(
      getByRole('link', { name: 'New Chat' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('keeps New Chat on the default shell tone when it is inactive', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    const newThreadLink = getByRole('link', { name: 'New Chat' });
    expect(newThreadLink.className).toContain('text-sidebar-item-foreground');
    expect(newThreadLink.className).not.toContain('text-sidebar-muted/80');
    expect(newThreadLink.className).not.toContain(
      'bg-[color-mix(in_oklab,var(--linear-app-content-surface)_92%,white_8%)]'
    );
  });

  it('renders one canonical New Chat nav row in Design V1', () => {
    const { getAllByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getAllByRole('link', { name: 'New Chat' })).toHaveLength(1);
  });

  it('opens the shared header search from Search instead of navigating', () => {
    const onOpenSearch = vi.fn();
    const onOpenPalette = vi.fn();
    globalThis.addEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenPalette);

    try {
      const { getByRole, queryByRole } = renderDashboardNav({
        renderFn: fastRender,
        appFlags: { DESIGN_V1: true },
      });

      const searchButton = getByRole('button', { name: 'Search' });
      expect(queryByRole('link', { name: 'Search' })).toBeNull();

      fireEvent.click(searchButton);

      expect(onOpenSearch).toHaveBeenCalledTimes(1);
      expect(onOpenPalette).not.toHaveBeenCalled();
      expect(mockRouterPush).not.toHaveBeenCalled();
    } finally {
      globalThis.removeEventListener(OPEN_HEADER_SEARCH_EVENT, onOpenSearch);
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

    const newThreadLink = getByRole('link', { name: 'New Chat' });
    expect(newThreadLink.className).toContain(
      'group-data-[collapsible=icon]:justify-center'
    );
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: false,
    });
  });

  it('renders the grouped top nav and artist group without a duplicate Settings row', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true, PROFILES_WORKSPACE: true },
    });

    expect(getByRole('link', { name: 'New Chat' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
    expect(getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      buildLibraryViewRoute('releases')
    );
    expect(getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PROFILES
    );
    expect(getByRole('link', { name: 'Touring' })).toHaveAttribute(
      'href',
      APP_ROUTES.TOUR_DATES
    );
    expect(getByRole('button', { name: 'Artist' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(queryByRole('button', { name: 'More' })).toBeNull();
    expect(queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(queryByRole('button', { name: 'Work' })).toBeNull();
    expect(queryByRole('button', { name: 'Catalog' })).toBeNull();
    expect(queryByRole('button', { name: 'Growth' })).toBeNull();
  });

  it('keeps admin routes out of artist navigation for admin users', () => {
    const { queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: { isAdmin: true },
    });

    expect(queryByRole('button', { name: 'Admin' })).toBeNull();
    expect(queryByRole('link', { name: 'People' })).toBeNull();
    expect(queryByRole('link', { name: 'Growth' })).toBeNull();
    expect(queryByRole('link', { name: 'Activity' })).toBeNull();
  });

  it('renders with different pathname', () => {
    mockUsePathname.mockReturnValueOnce('/app/audience');

    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    const audienceLink = getByRole('link', { name: 'Audience' });
    expect(audienceLink.getAttribute('aria-current')).toBe('page');
  });

  it('highlights Releases when the legacy library route is current', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_LIBRARY);

    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    expect(getByRole('link', { name: 'Releases' })).toHaveAttribute(
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

    expect(getByText('2')).toHaveAttribute('aria-label', '2 new active tasks');
    expect(queryByText('7')).toBeNull();
    expect(mockUseTaskStatsQuery).toHaveBeenCalledWith('profile_123', {
      enabled: true,
      seenAt: '2026-05-24T00:00:00.000Z',
    });
  });

  it('separates the Tasks label and count metadata into stable grid columns', () => {
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

    const tasksLink = getByRole('link', { name: 'Tasks 7 active tasks' });
    expect(tasksLink.className).toContain('h-7');
    expect(tasksLink.className).toContain(
      'grid-cols-[22px_minmax(0,1fr)_34px]'
    );
    expect(tasksLink.className).toContain('text-xs');
    const taskBadge = getByText('7');
    const taskLabel = tasksLink.children.item(1);
    const taskMetadata = tasksLink.children.item(2);

    expect(taskLabel).toHaveTextContent('Tasks');
    expect(taskLabel).toHaveClass('justify-self-start');
    expect(taskMetadata).toHaveClass('justify-self-end', 'shrink-0');
    expect(taskMetadata).toContainElement(taskBadge);
    expect(taskBadge).toHaveAttribute('data-nav-badge', 'count');
    expect(taskBadge).toHaveAttribute('aria-label', '7 active tasks');
  });

  it('keeps the Tasks row geometry and accessible name stable without a badge', () => {
    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { DESIGN_V1: true },
    });

    const tasksLink = getByRole('link', { name: 'Tasks' });
    expect(tasksLink).toHaveClass('grid-cols-[22px_minmax(0,1fr)_34px]');
    expect(tasksLink).not.toHaveAttribute('aria-current');
    expect(
      container.querySelector('[data-nav-badge="count"]')
    ).not.toBeInTheDocument();
  });

  it('renders the Pro badge when tasks are locked', () => {
    mockUsePlanGate.mockReturnValueOnce({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });

    const { getByText } = renderDashboardNav({ renderFn: fastRender });

    expect(getByText('Pro')).toHaveAttribute('data-nav-badge', 'pro');
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
