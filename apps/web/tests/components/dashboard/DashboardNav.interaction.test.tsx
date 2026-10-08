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

const PRIMARY_LABELS = ['New Chat', 'Profiles', 'Work', 'Audience'] as const;

describe('DashboardNav interactions', () => {
  afterEach(() => {
    vi.useRealTimers();
    prefetchForRouteMock.mockReset();
    resetDashboardNavTestMocks();
  });

  it('exposes an icon and label for each canonical navigation item', () => {
    renderDashboardNav({
      renderFn: render,
      appFlags: { PROFILES_WORKSPACE: true },
    });

    for (const label of PRIMARY_LABELS) {
      const link = screen.getByRole('link', { name: label });
      expect(link.querySelector('svg')).toBeTruthy();
      expect(link).toHaveAccessibleName(label);
    }
    const homeLinks = screen.getAllByRole('link', { name: 'Home' });
    expect(homeLinks).toHaveLength(2);
    for (const link of homeLinks) {
      expect(link.querySelector('svg')).toBeTruthy();
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
    const inbox = container.querySelector('[data-navigation-item-id="inbox"]');
    expect(inbox).toBeInstanceOf(HTMLElement);
    if (!(inbox instanceof HTMLElement)) return;
    expect(inbox).toHaveAccessibleName('Home');

    expect(newChat).toHaveClass('h-7', 'rounded-md', 'text-primary-token');
    expect(newChat).not.toHaveClass('bg-sidebar-accent-active', 'w-full');
    expect(searchSlot).toHaveClass('h-9', 'shrink-0');
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);
    expect(searchSlot).toContainElement(inbox);
    expect(searchSlot).toContainElement(newChat);
  });

  it('wires a plain nav click to one canonical privacy-safe activation', async () => {
    const user = userEvent.setup();
    renderDashboardNav({ renderFn: render });

    const workLink = screen.getByRole('link', { name: 'Work' });
    workLink.addEventListener('click', event => event.preventDefault());
    await user.click(workLink);

    expect(mockStartNavigationTelemetry).toHaveBeenCalledExactlyOnceWith({
      itemId: 'library',
      sourcePathname: APP_ROUTES.CHAT,
      destinationHref: APP_ROUTES.LIBRARY,
      inputMethod: 'pointer',
      context: {
        isElectron: false,
        isMobile: false,
        navVariant: 'canonical_identity_work_v1',
      },
    });
  });

  it('keeps entity categories and retired workflows out of root navigation', () => {
    renderDashboardNav({ renderFn: render });

    for (const label of [
      'Calendar',
      'Contacts',
      'Events',
      'Library',
      'Links',
      'Products',
      'Releases',
      'Tasks',
      'Videos',
    ]) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('routes Profiles through root navigation without a duplicate avatar button', () => {
    renderDashboardNav({
      renderFn: render,
      appFlags: { PROFILES_WORKSPACE: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    expect(screen.getByRole('link', { name: 'Profiles' })).toHaveAttribute(
      'href',
      APP_ROUTES.PRESENCE
    );
    expect(
      screen.queryByRole('button', { name: 'Open Tim White profile' })
    ).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockOpenPreviewPanel).not.toHaveBeenCalled();
  });

  it('marks Work active on the canonical library route', () => {
    mockUsePathname.mockReturnValue(APP_ROUTES.LIBRARY);
    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Work' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(
      document.querySelector('[data-navigation-item-id="home"]')
    ).not.toHaveAttribute('aria-current');
  });

  it('renders recent chats as App Router links when Recent opens', async () => {
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

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Recent Chats' }));
    expect(screen.getByText('Earlier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pitch tasks' })).toHaveAttribute(
      'href',
      '/app/chat/thread-newer'
    );
  });

  it('keeps compact loading and empty thread states free of duplicate New Chat controls', async () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    const loading = renderDashboardNav({
      renderFn: render,
    });

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Recent Chats' }));
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
        JSON.parse(
          localStorage.getItem('jovie:sidebar-thread-read-at:user_123:')!
        )
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
      appFlags: { PROFILES_WORKSPACE: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    fireEvent.mouseEnter(screen.getByRole('link', { name: 'Profiles' }));
    expect(prefetchForRouteMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);

    expect(prefetchForRouteMock).toHaveBeenCalledWith(
      'presence',
      expect.anything(),
      'profile_123'
    );
  });

  it('does not warm Work without an interaction', async () => {
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

    await vi.advanceTimersByTimeAsync(300);

    expect(prefetchForRouteMock).not.toHaveBeenCalledWith(
      'library',
      expect.anything(),
      'profile_123'
    );
  });

  it('keeps demo-disabled rows as links while intercepting unavailable content', async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValue('/demo/showcase/settings');
    renderDashboardNav({
      renderFn: render,
      appFlags: { PROFILES_WORKSPACE: true },
    });

    const identityLink = screen.getByRole('link', { name: 'Profiles' });
    expect(identityLink).toHaveAttribute('href', APP_ROUTES.PRESENCE);
    await user.click(identityLink);

    expect(mockToastInfo).toHaveBeenCalledWith(
      'Profiles is not available in demo mode'
    );
  });
});
