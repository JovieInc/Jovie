import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { APP_ROUTES } from '@/constants/routes';
import {
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

const CANONICAL_NAV = [
  ['Inbox', APP_ROUTES.DASHBOARD],
  ['Chat', APP_ROUTES.CHAT],
  ['Library', APP_ROUTES.LIBRARY],
  ['Contacts', APP_ROUTES.CONTACTS],
  ['Calendar', APP_ROUTES.CALENDAR],
  ['Tasks', APP_ROUTES.TASKS],
] as const;

const FORBIDDEN_PRIMARY_LABELS = [
  'Search',
  'Touring',
  'Audience',
  'Profiles',
  'Releases',
] as const;

function primaryLinks(container: HTMLElement) {
  const section = container.querySelector('[data-nav-section]');
  expect(section).toBeInTheDocument();
  return [...section!.querySelectorAll<HTMLAnchorElement>('a')];
}

describe('DashboardNav', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders the canonical six in exact order and no forbidden primary rows', () => {
    const { container, getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(
      primaryLinks(container).map(link => [
        link.textContent?.trim(),
        link.getAttribute('href'),
      ])
    ).toEqual(CANONICAL_NAV);

    for (const label of FORBIDDEN_PRIMARY_LABELS) {
      expect(queryByRole('link', { name: label })).toBeNull();
      expect(queryByRole('button', { name: label })).toBeNull();
    }

    expect(getByRole('button', { name: 'Open Artist profile' })).toBeDefined();
    expect(queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('keeps the canonical six visible without rollout state', () => {
    const { container } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(
      primaryLinks(container).map(link => [
        link.textContent?.trim(),
        link.getAttribute('href'),
      ])
    ).toEqual(CANONICAL_NAV);
  });

  it('keeps the exact customer IA invariant for admin users', () => {
    const standard = renderDashboardNav({ renderFn: fastRender });
    const standardContract = primaryLinks(standard.container).map(link => [
      link.textContent?.trim(),
      link.getAttribute('href'),
    ]);
    standard.unmount();

    const admin = renderDashboardNav({
      renderFn: fastRender,
      overrides: { isAdmin: true },
    });

    expect(
      primaryLinks(admin.container).map(link => [
        link.textContent?.trim(),
        link.getAttribute('href'),
      ])
    ).toEqual(standardContract);
    expect(admin.queryByRole('button', { name: 'Admin' })).toBeNull();
    expect(admin.queryByRole('link', { name: 'People' })).toBeNull();
  });

  it('renders the artist row separately from primary navigation', () => {
    const { container, getByRole } = renderDashboardNav({
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

    const primarySection = container.querySelector('[data-nav-section]');
    const artistSection = container.querySelector(
      '[data-nav-section="artist"]'
    );
    const artistButton = getByRole('button', {
      name: 'Open Tim White profile',
    });

    expect(primarySection).not.toContainElement(artistButton);
    expect(artistSection).toContainElement(artistButton);
    expect(artistSection?.textContent).toContain('Tim White');
  });

  it('applies active state to the canonical library route and legacy aliases', () => {
    for (const route of [
      APP_ROUTES.LIBRARY,
      APP_ROUTES.DASHBOARD_LIBRARY,
      APP_ROUTES.DASHBOARD_RELEASES,
      APP_ROUTES.RELEASES,
    ]) {
      mockUsePathname.mockReturnValueOnce(route);
      const view = renderDashboardNav({ renderFn: fastRender });
      expect(view.getByRole('link', { name: 'Library' })).toHaveAttribute(
        'aria-current',
        'page'
      );
      expect(view.getByRole('link', { name: 'Library' })).toHaveAttribute(
        'href',
        APP_ROUTES.LIBRARY
      );
      view.unmount();
    }
  });

  it('uses Chat as the nav label while preserving the New Chat page title', async () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    const { generateMetadata } = await import('@/app/app/(shell)/chat/page');
    const metadata = await generateMetadata();
    const title = String(metadata.title);

    const { container, getAllByRole, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      children: (
        <DashboardHeader
          breadcrumbs={[{ label: title, href: APP_ROUTES.CHAT }]}
        />
      ),
    });

    expect(title).toBe('New Chat');
    expect(getByRole('link', { name: 'Chat' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(
      1
    );
    expect(getAllByRole('heading', { name: title, level: 1 })).toHaveLength(1);
  });

  it('does not mark Chat active on a chat thread', () => {
    mockUsePathname.mockReturnValueOnce(`${APP_ROUTES.CHAT}/thread-123`);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    expect(
      getByRole('link', { name: 'Chat' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('keeps inactive Chat on the default shell tone', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CALENDAR);
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    const chatLink = getByRole('link', { name: 'Chat' });
    expect(chatLink).toHaveClass('text-sidebar-item-foreground');
    expect(chatLink).not.toHaveAttribute('aria-current');
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

  it('handles collapsed state without changing the canonical rows', () => {
    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      sidebarProps: { defaultOpen: false },
    });

    expect(primaryLinks(container)).toHaveLength(6);
    expect(getByRole('link', { name: 'Chat' }).className).toContain(
      'group-data-[collapsible=icon]:justify-center'
    );
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: false,
    });
  });

  it('renders settings groups only while inside Settings', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.SETTINGS_ACCOUNT);
    const { getAllByText, getByRole, queryByText } = renderDashboardNav({
      renderFn: fastRender,
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

  it('renders stable task count geometry and accessible metadata', () => {
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
    });
    const tasksLink = getByRole('link', { name: 'Tasks 7 active tasks' });

    expect(tasksLink).toHaveClass(
      'grid-cols-[22px_minmax(0,1fr)_minmax(34px,auto)]'
    );
    expect(getByText('7')).toHaveAttribute('data-nav-badge', 'count');
    expect(getByText('7')).toHaveAttribute('aria-label', '7 active tasks');
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

  it('reserves task metadata geometry when no badge is present', () => {
    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(getByRole('link', { name: 'Tasks' })).toHaveClass(
      'grid-cols-[22px_minmax(0,1fr)_minmax(34px,auto)]'
    );
    expect(
      container.querySelector('[data-nav-badge="count"]')
    ).not.toBeInTheDocument();
  });

  it('renders the Pro badge only after task entitlements resolve as locked', () => {
    mockUsePlanGate.mockReturnValueOnce({
      canAccessTasksWorkspace: false,
      isLoading: false,
    });
    const locked = renderDashboardNav({ renderFn: fastRender });
    expect(locked.getByText('Pro')).toHaveAttribute('data-nav-badge', 'pro');
    locked.unmount();

    mockUsePlanGate.mockReturnValueOnce({
      canAccessTasksWorkspace: false,
      isLoading: true,
    });
    const loading = renderDashboardNav({ renderFn: fastRender });
    expect(loading.queryByText('Pro')).toBeNull();
  });
});
