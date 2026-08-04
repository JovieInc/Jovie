import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockUseChatConversationsQuery,
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/app/app/(shell)/chat/ChatPageClient', () => ({
  ChatPageClient: () => null,
}));

const CANONICAL_NAV = [
  ['New Chat', APP_ROUTES.CHAT],
  ['Inbox', APP_ROUTES.DASHBOARD],
  ['Library', APP_ROUTES.LIBRARY],
  ['Contacts', APP_ROUTES.CONTACTS],
  ['Presence', APP_ROUTES.PROFILES],
  ['Calendar', APP_ROUTES.CALENDAR],
] as const;

const FORBIDDEN_PRIMARY_LABELS = [
  'Search',
  'Touring',
  'Audience',
  'Releases',
] as const;

const DASHBOARD_NAV_SOURCE =
  'components/features/dashboard/dashboard-nav/DashboardNav.tsx';

function primaryLinks(container: HTMLElement) {
  const section = container.querySelector('[data-nav-section]');
  expect(section).toBeInTheDocument();
  return [...section!.querySelectorAll<HTMLAnchorElement>('a')];
}

describe('DashboardNav', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('defers persisted navigation badges until after hydration', () => {
    const source = readFileSync(
      resolve(process.cwd(), DASHBOARD_NAV_SOURCE),
      'utf8'
    );

    expect(source).toContain(
      'const [threadReadAtById, setThreadReadAtById] = useState<'
    );
    expect(source).toContain('>({});');
    expect(source).toContain('setThreadReadAtById(readThreadReadState());');
    expect(source).not.toContain(
      'useState<Record<string, string>>(readThreadReadState)'
    );
    expect(source).not.toContain('useTaskStatsQuery');
    expect(source).not.toContain('readTasksSeenAt');
  });

  it('renders the canonical navigation in exact order and no forbidden primary rows', () => {
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

    expect(getByRole('link', { name: 'Presence' })).toHaveAttribute(
      'href',
      APP_ROUTES.PROFILES
    );
    expect(queryByRole('button', { name: 'Open Artist profile' })).toBeNull();
    expect(queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('places the shell search slot after New Chat and before remaining navigation', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      navChildren: <button type='button'>Search</button>,
    });

    const newChat = getByRole('link', { name: 'New Chat' });
    const search = getByRole('button', { name: 'Search' });
    const inbox = getByRole('link', { name: 'Inbox' });

    expect(
      newChat.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      search.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(search.parentElement).toHaveClass('h-7', 'shrink-0');
  });

  it('keeps the canonical navigation visible without rollout state', () => {
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

  it('hides a settled-empty Inbox away from its active destination', () => {
    const { getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });

    expect(queryByRole('link', { name: 'Inbox' })).toBeNull();
    expect(getByRole('link', { name: 'New Chat' })).toBeInTheDocument();
  });

  it('hides a settled-empty Inbox while its root destination is active', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    const { queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });

    expect(queryByRole('link', { name: 'Inbox' })).toBeNull();
  });

  it('keeps Inbox visible when availability is unknown', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'unknown', pendingCount: null },
      },
    });

    expect(getByRole('link', { name: 'Inbox' })).toBeInTheDocument();
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

  it('does not render a duplicate artist avatar row', () => {
    const { container, queryByRole } = renderDashboardNav({
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
    expect(primarySection).toBeInTheDocument();
    expect(container.querySelector('[data-nav-section="artist"]')).toBeNull();
    expect(
      queryByRole('button', { name: 'Open Tim White profile' })
    ).toBeNull();
  });

  it('applies active state to the canonical library route and legacy aliases', () => {
    for (const route of [
      APP_ROUTES.LIBRARY,
      APP_ROUTES.DASHBOARD_LIBRARY,
      APP_ROUTES.DASHBOARD_RELEASES,
      APP_ROUTES.RELEASES,
    ]) {
      mockUsePathname.mockReturnValue(route);
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

  it('uses New Chat consistently for the elevated nav action and page title', async () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.CHAT);
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
    expect(getByRole('link', { name: 'New Chat' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(container.querySelectorAll('a[aria-current="page"]')).toHaveLength(
      1
    );
    expect(getAllByRole('heading', { name: title, level: 1 })).toHaveLength(1);
  });

  it('does not mark New Chat active on a chat thread', () => {
    mockUsePathname.mockReturnValue(`${APP_ROUTES.CHAT}/thread-123`);
    const { getByRole } = renderDashboardNav({ renderFn: fastRender });

    expect(
      getByRole('link', { name: 'New Chat' }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('keeps inactive New Chat distinct from a selected navigation row', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.CALENDAR);
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    const chatLink = getByRole('link', { name: 'New Chat' });
    expect(chatLink).toHaveClass('w-fit');
    expect(chatLink).toHaveClass('rounded-full');
    expect(chatLink).not.toHaveClass('bg-sidebar-accent/40');
    expect(chatLink).toHaveClass('text-sidebar-item-foreground');
    expect(chatLink).toHaveClass('font-medium');
    expect(chatLink).not.toHaveClass('bg-sidebar-accent-active');
    expect(chatLink).not.toHaveClass(
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
    );
    expect(chatLink.querySelector('svg')).toHaveClass('text-sidebar-muted/70');
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
    expect(getByRole('link', { name: 'New Chat' }).className).toContain(
      'group-data-[collapsible=icon]:justify-center'
    );
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: false,
    });
  });

  it('renders settings groups only while inside Settings', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.SETTINGS_ACCOUNT);
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
});
