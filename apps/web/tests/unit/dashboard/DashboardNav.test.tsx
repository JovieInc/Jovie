import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardHeader } from '@/components/features/dashboard/organisms/DashboardHeader';
import { APP_ROUTES } from '@/constants/routes';
import {
  calendarNavItem,
  canonicalSidebarNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import {
  mockUseChatConversationsQuery,
  mockUsePathname,
  mockUseSearchParams,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/app/app/(shell)/chat/ChatPageClient', () => ({
  ChatPageClient: () => null,
}));

const CANONICAL_NAV = [
  ['Home', APP_ROUTES.DASHBOARD],
  ['Profiles', APP_ROUTES.PRESENCE],
  ['Work', APP_ROUTES.LIBRARY],
  ['Audience', APP_ROUTES.CONTACTS_AUDIENCE],
] as const;

const FORBIDDEN_PRIMARY_LABELS = [
  'Calendar',
  'Contacts',
  'Events',
  'Library',
  'Links',
  'Products',
  'Releases',
  'Tasks',
  'Videos',
] as const;

const DASHBOARD_NAV_SOURCE =
  'components/features/dashboard/dashboard-nav/DashboardNav.tsx';

function primaryLinks(container: HTMLElement) {
  const sections = container.querySelectorAll('[data-nav-section]');
  expect(sections.length).toBeGreaterThan(0);
  return [
    ...container.querySelectorAll<HTMLAnchorElement>('[data-nav-section] a'),
  ];
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
    expect(source).toContain(
      'setThreadReadAtById(readThreadReadState(threadReadStorageKey));'
    );
    expect(source).not.toContain(
      'useState<Record<string, string>>(readThreadReadState)'
    );
    expect(source).not.toContain('useTaskStatsQuery');
    expect(source).not.toContain('readTasksSeenAt');
  });

  it('renders the canonical navigation in exact order and no forbidden primary rows', () => {
    const { container, getByRole, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { PROFILES_WORKSPACE: true },
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

    expect(getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PRESENCE
    );
    expect(queryByRole('button', { name: 'Open Artist profile' })).toBeNull();
    expect(queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('places search, Inbox, and New Chat together before navigation', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      navChildren: <button type='button'>Search</button>,
    });

    const inbox = document.querySelector('[data-navigation-item-id="inbox"]');
    expect(inbox).toBeInstanceOf(HTMLElement);
    if (!(inbox instanceof HTMLElement)) return;
    expect(inbox).toHaveAccessibleName('Home');
    const search = getByRole('button', { name: 'Search' });
    const newChat = getByRole('link', { name: 'New Chat' });

    expect(
      search.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      search.compareDocumentPosition(newChat) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(search.parentElement).toHaveClass('h-9', 'shrink-0');
  });

  it('hides Identity when PROFILES_WORKSPACE is off so the rail cannot 404', () => {
    const { container, queryByRole } = renderDashboardNav({
      renderFn: fastRender,
    });

    expect(
      primaryLinks(container).map(link => [
        link.textContent?.trim(),
        link.getAttribute('href'),
      ])
    ).toEqual([
      ['Home', APP_ROUTES.DASHBOARD],
      ['Work', APP_ROUTES.LIBRARY],
      ['Audience', APP_ROUTES.CONTACTS_AUDIENCE],
    ]);
    expect(queryByRole('link', { name: 'Profiles' })).toBeNull();
    expect(
      container.querySelector(`a[href="${APP_ROUTES.PRESENCE}"]`)
    ).toBeNull();
  });

  it('keeps the Inbox attention center visible when it is settled empty', () => {
    const { getByRole } = renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });

    expect(
      document.querySelector('[data-navigation-item-id="inbox"]')
    ).toHaveAccessibleName('Home');
    expect(getByRole('link', { name: 'New Chat' })).toBeInTheDocument();
  });

  it('gives Home sole current-page ownership at the shell root', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'empty', pendingCount: 0 },
      },
    });

    expect(
      document.querySelector('[data-navigation-item-id="home"]')
    ).toHaveAttribute('aria-current', 'page');
    expect(
      document.querySelector('[data-navigation-item-id="inbox"]')
    ).not.toHaveAttribute('aria-current');
  });

  it('keeps Inbox visible when availability is unknown', () => {
    renderDashboardNav({
      renderFn: fastRender,
      overrides: {
        inboxNavigation: { state: 'unknown', pendingCount: null },
      },
    });

    expect(
      document.querySelector('[data-navigation-item-id="inbox"]')
    ).toHaveAccessibleName('Home');
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

  it('keeps a single artist flat without adding a redundant group control', () => {
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

    expect(
      container.querySelector('[data-nav-section="primary"]')
    ).not.toBeNull();
    expect(queryByRole('button', { name: 'Tim White' })).toBeNull();
    expect(
      queryByRole('button', { name: 'Open Tim White profile' })
    ).toBeNull();
  });

  it('keeps the approved flat navigation when multiple profiles exist', () => {
    const selectedProfile = {
      id: 'profile_123',
      displayName: 'Tim White',
      username: 'tim',
      usernameNormalized: 'tim',
    } as DashboardData['selectedProfile'];
    const secondProfile = {
      id: 'profile_456',
      displayName: 'Night Drive',
      username: 'night-drive',
      usernameNormalized: 'night-drive',
    } as DashboardData['creatorProfiles'][number];
    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { PROFILES_WORKSPACE: true },
      overrides: {
        selectedProfile,
        creatorProfiles: [
          selectedProfile as DashboardData['creatorProfiles'][number],
          secondProfile,
        ],
      },
    });

    expect(
      container.querySelector('[data-nav-section="primary"] [aria-expanded]')
    ).toBeNull();
    expect(getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PRESENCE
    );
    const artistSection = container.querySelector(
      '[data-nav-section="primary"]'
    );
    expect(artistSection).not.toBeNull();
    expect(getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.CONTACTS_AUDIENCE
    );
  });

  it('applies active state inside canonical top-level contexts', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.LIBRARY);
    const work = renderDashboardNav({ renderFn: fastRender });
    expect(work.getByRole('link', { name: 'Work' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(work.getByRole('link', { name: 'New Chat' })).not.toHaveAttribute(
      'aria-current'
    );
    work.unmount();

    mockUsePathname.mockReturnValue(APP_ROUTES.CONTACTS);
    mockUseSearchParams.mockReturnValue(new URLSearchParams('tab=audience'));
    const audience = renderDashboardNav({ renderFn: fastRender });
    expect(audience.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    audience.unmount();

    mockUsePathname.mockReturnValue(APP_ROUTES.INSIGHTS);
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    const insights = renderDashboardNav({ renderFn: fastRender });
    expect(insights.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'aria-current',
      'page'
    );
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
    expect(chatLink).toHaveClass('h-7', 'text-primary-token');
    expect(chatLink.querySelector('svg')).toHaveClass('text-accent');
    expect(chatLink).not.toHaveClass('bg-sidebar-accent-active');
    expect(chatLink).not.toHaveAttribute('aria-current');
  });

  it('maps real conversation metadata into unread and running thread rows', () => {
    localStorage.setItem(
      'jovie:sidebar-thread-read-at:user_123:',
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

    const { getByRole } = renderDashboardNav({});
    fireEvent.click(getByRole('button', { name: 'Recent Chats' }));

    expect(getByRole('link', { name: 'Unread answer' })).toHaveClass(
      'text-primary-token'
    );
    expect(getByRole('link', { name: 'Running task' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.CHAT}/conv-running`
    );
    expect(getByRole('status', { name: 'Running' })).toHaveClass(
      'anim-calm-breath'
    );
  });

  it('opening Recent does not persist read timestamps; only selecting the chat does', async () => {
    localStorage.clear();
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'unread-contract',
          title: 'Unread answer',
          updatedAt: '2026-10-07T20:00:00Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
    });
    const { getByRole } = renderDashboardNav({
      overrides: { user: { id: 'read-contract-user' } },
      appFlags: { PROFILES_WORKSPACE: true },
    });
    fireEvent.click(getByRole('button', { name: 'Recent Chats' }));
    const recent = getByRole('dialog');
    const answer = within(recent).getByRole('link', { name: 'Unread answer' });
    expect(answer).toHaveAccessibleDescription('Unread');
    expect(
      Object.keys(localStorage).filter(key => key.includes('thread-read'))
    ).toEqual([]);
    fireEvent.click(answer);
    await waitFor(() =>
      expect(
        Object.keys(localStorage).some(key => key.includes('thread-read'))
      ).toBe(true)
    );
  });

  it('keeps Recent selection usable when read-state storage is denied', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.DASHBOARD);
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'denied',
          title: 'Offline draft',
          updatedAt: '2026-10-07T20:00:00Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
    });
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage denied', 'SecurityError');
      });
    try {
      const { getByRole, queryByRole } = renderDashboardNav({});
      fireEvent.click(getByRole('button', { name: 'Recent Chats' }));
      const answer = within(getByRole('dialog')).getByRole('link', {
        name: 'Offline draft',
      });
      expect(answer).toHaveAccessibleDescription('Unread');
      fireEvent.click(answer);
      expect(queryByRole('dialog')).toBeNull();
      fireEvent.click(getByRole('button', { name: 'Recent Chats' }));
      expect(
        within(getByRole('dialog')).getByRole('link', { name: 'Offline draft' })
      ).not.toHaveAccessibleDescription('Unread');
    } finally {
      storage.mockRestore();
    }
  });

  it('new permitted destinations default to More and flag denial excludes them', () => {
    const registry = canonicalSidebarNavigation as unknown as NavItem[];
    registry.push({ ...calendarNavItem, requiredFlag: 'PROFILES_WORKSPACE' });
    try {
      const result = renderDashboardNav({
        appFlags: { PROFILES_WORKSPACE: true },
      });
      expect(
        primaryLinks(result.container).map(link => link.textContent)
      ).toEqual(['Home', 'Profiles', 'Work', 'Audience']);
      fireEvent.pointerDown(
        result.getByRole('button', { name: 'More Pages' }),
        { button: 0, ctrlKey: false, pointerType: 'mouse' }
      );
      expect(
        result.getByRole('menuitem', { name: 'Calendar', exact: true })
      ).toHaveAttribute('href', APP_ROUTES.CALENDAR);
      result.unmount();
      const denied = renderDashboardNav({
        appFlags: { PROFILES_WORKSPACE: false },
      });
      expect(denied.queryByRole('button', { name: 'More Pages' })).toBeNull();
      expect(denied.queryByRole('link', { name: 'Calendar' })).toBeNull();
    } finally {
      registry.pop();
    }
  });

  it('handles collapsed state without changing the canonical rows', () => {
    const { container, getByRole } = renderDashboardNav({
      renderFn: fastRender,
      appFlags: { PROFILES_WORKSPACE: true },
      sidebarProps: { defaultOpen: false },
    });

    expect(primaryLinks(container)).toHaveLength(4);
    // JOV-4522: the search/inbox pill stages out (max-height + opacity +
    // travel) rather than popping to display:none at frame one.
    expect(getByRole('link', { name: 'New Chat' }).parentElement).toHaveClass(
      'group-data-[collapsible=icon]:max-h-0',
      'group-data-[collapsible=icon]:opacity-0'
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
