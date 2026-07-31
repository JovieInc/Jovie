import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockOpenPreviewPanel,
  mockRouterPush,
  mockStartNavigationTelemetry,
  mockToastInfo,
  mockUseChatConversationsQuery,
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

const { prefetchForRouteMock } = vi.hoisted(() => ({
  prefetchForRouteMock: vi.fn(),
}));

vi.mock('@/lib/queries/prefetch-dashboard', () => ({
  prefetchForRoute: prefetchForRouteMock,
}));

const PRIMARY_LABELS = [
  'New Chat',
  'Inbox',
  'Library',
  'Contacts',
  'Connections',
  'Calendar',
] as const;

describe('DashboardNav interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
    prefetchForRouteMock.mockReset();
    resetDashboardNavTestMocks();
  });

  it('exposes an icon and label for each canonical navigation item', () => {
    renderDashboardNav({ renderFn: render });

    for (const label of PRIMARY_LABELS) {
      const link = screen.getByRole('link', { name: label });
      expect(link.querySelector('svg')).toBeTruthy();
      expect(link.querySelector('span.truncate')).toHaveTextContent(label);
    }
  });

  it('keeps New Chat a compact create CTA with a larger utility-to-navigation gap', () => {
    const { container } = renderDashboardNav({
      renderFn: render,
      navChildren: <button type='button'>Search</button>,
    });

    const newChat = screen.getByRole('link', { name: 'New Chat' });
    const searchSlot = container.querySelector<HTMLElement>(
      '[data-sidebar-search-slot="true"]'
    );
    const inbox = screen.getByRole('link', { name: 'Inbox' });

    expect(newChat).toHaveClass('w-fit', 'rounded-full', 'bg-btn-primary');
    expect(newChat).not.toHaveClass('bg-sidebar-accent-active', 'w-full');
    expect(newChat.querySelector('svg')).toHaveClass(
      'text-btn-primary-foreground'
    );
    expect(searchSlot).toHaveClass('mt-1.5', 'mb-3');
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);
    expect(
      newChat.compareDocumentPosition(searchSlot!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      searchSlot!.compareDocumentPosition(inbox) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('wires a plain nav click to one canonical privacy-safe activation', async () => {
    const user = userEvent.setup();
    renderDashboardNav({ renderFn: render });

    const libraryLink = screen.getByRole('link', { name: 'Library' });
    libraryLink.addEventListener('click', event => event.preventDefault());
    await user.click(libraryLink);

    expect(mockStartNavigationTelemetry).toHaveBeenCalledExactlyOnceWith({
      itemId: 'library',
      sourcePathname: APP_ROUTES.CHAT,
      destinationHref: APP_ROUTES.LIBRARY,
      inputMethod: 'pointer',
      context: {
        isElectron: false,
        isMobile: false,
        navVariant: 'canonical_customer_ia_v1',
      },
    });
  });

  it('does not duplicate sidebar Search or removed primary destinations', () => {
    renderDashboardNav({ renderFn: render });

    for (const label of ['Search', 'Touring', 'Audience', 'Releases']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('routes Connections through the canonical navigation row without a duplicate avatar button', () => {
    renderDashboardNav({
      renderFn: render,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(screen.getByRole('link', { name: 'Connections' })).toHaveAttribute(
      'href',
      APP_ROUTES.PROFILES
    );
    expect(
      screen.queryByRole('button', { name: 'Open Tim White profile' })
    ).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockOpenPreviewPanel).not.toHaveBeenCalled();
  });

  it('keeps Library active throughout a canonical release workspace', () => {
    mockUsePathname.mockReturnValue('/app/releases/release-123/tasks');
    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('renders recent chats as App Router links', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-newer',
          title: 'Pitch tasks',
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
        },
      ],
    });

    renderDashboardNav({
      renderFn: render,
    });

    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pitch tasks' })).toHaveAttribute(
      'href',
      '/app/chat/thread-newer'
    );
  });

  it('keeps compact loading and empty thread states free of duplicate New Chat controls', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const loading = renderDashboardNav({
      renderFn: render,
    });

    expect(document.querySelector('.skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Loading chats')).not.toBeInTheDocument();
    loading.unmount();

    mockUseChatConversationsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    renderDashboardNav({
      renderFn: render,
    });

    expect(screen.getAllByRole('link', { name: 'New Chat' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'New Chat' })).toBeNull();
  });

  it('marks an active thread read without changing primary navigation', async () => {
    mockUsePathname.mockReturnValue(`${APP_ROUTES.CHAT}/thread-1`);
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-1',
          title: 'Active thread',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    renderDashboardNav({
      renderFn: render,
    });

    await waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem('jovie:sidebar-thread-read-at')!)
      ).toMatchObject({ 'thread-1': '2026-05-12T00:00:00.000Z' });
    });
    expect(screen.getByRole('link', { name: 'New Chat' })).not.toHaveAttribute(
      'aria-current'
    );
  });

  it('debounces route prefetch on hover for canonical items', async () => {
    vi.useFakeTimers();
    renderDashboardNav({
      renderFn: render,
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Calendar' }));
    expect(prefetchForRouteMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);

    expect(prefetchForRouteMock).toHaveBeenCalledWith(
      'calendar',
      expect.anything(),
      'profile_123'
    );
  });

  it('keeps demo-disabled rows as links while intercepting unavailable content', async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue('/demo/showcase/settings');
    renderDashboardNav({ renderFn: render });

    const calendarLink = screen.getByRole('link', { name: 'Calendar' });
    expect(calendarLink).toHaveAttribute('href', APP_ROUTES.CALENDAR);
    await user.click(calendarLink);

    expect(mockToastInfo).toHaveBeenCalledWith(
      'Calendar is not available in demo mode'
    );
  });
});
