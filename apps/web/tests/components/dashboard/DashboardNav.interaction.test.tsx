import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { APP_ROUTES, buildLibraryViewRoute } from '@/constants/routes';
import {
  mockClearPendingShell,
  mockOpenPreviewPanel,
  mockRouterPush,
  mockShowPendingShell,
  mockToastInfo,
  mockUseChatConversationsQuery,
  mockUsePathname,
  renderDashboardNav,
  resetDashboardNavTestMocks,
} from '@/tests/utils/dashboard-nav-test-support';

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    clear: vi.fn(),
    error: null,
    isPending: false,
    query: '',
    results: [],
    search: vi.fn(),
    searchImmediate: vi.fn(),
    state: 'idle',
  }),
}));

function CommandPaletteHarness() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openPalette = () => setOpen(true);
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    return () => {
      globalThis.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette);
    };
  }, []);

  return open ? <input aria-label='Command palette search' /> : null;
}

describe('DashboardNav interactions', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders the full primary navigation config', () => {
    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'New Chat' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      buildLibraryViewRoute('releases')
    );
    expect(
      screen.getByRole('button', { name: 'Artist Profile' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Artist Profile' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Touring' })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_TOURING
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.AUDIENCE
    );
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull();
  });

  it('keeps Releases in the grouped top navigation when the design flag is enabled', () => {
    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      buildLibraryViewRoute('releases')
    );
    expect(screen.getByRole('link', { name: 'New Chat' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );
  });

  it('shows grouped admin navigation with growth links for admin users', () => {
    renderDashboardNav({
      renderFn: render,
      overrides: { isAdmin: true },
    });

    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Growth' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_GROWTH
    );
    expect(screen.getByRole('link', { name: 'People' })).toHaveAttribute(
      'href',
      APP_ROUTES.ADMIN_PEOPLE
    );
  });

  it('highlights the active route based on pathname', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.LIBRARY);

    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('highlights the canonical Audience nav item from the legacy dashboard path', () => {
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.DASHBOARD_AUDIENCE);

    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.AUDIENCE
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('exposes icon and label content for each navigation item', () => {
    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    // In the new shell nav design (DESIGN_V1 on by default), the icon is rendered
    // directly as an SVG element rather than inside a data-sidebar-icon wrapper span.
    const iconNode = releasesLink.querySelector('svg');
    const labelNode = releasesLink.querySelector('span.truncate');

    expect(iconNode).toBeTruthy();
    expect(labelNode).toHaveTextContent('Releases');
    expect(labelNode).toHaveClass('group-data-[collapsible=icon]:hidden');
  });

  it('opens the in-chat profile rail from the artist name on chat routes', async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Tim White' }));

    expect(mockOpenPreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('opens command search from the Design V1 sidebar search row', async () => {
    const user = userEvent.setup();
    const listener = vi.fn();
    globalThis.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);

    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(listener).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  });

  it('opens the command palette when clicking the Design V1 sidebar search row', async () => {
    const user = userEvent.setup();

    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
      children: <CommandPaletteHarness />,
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByLabelText('Command palette search')).toBeInTheDocument();
  });

  it('groups the Design V1 shell into top nav and artist sections without duplicate Settings', () => {
    const { container } = renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    const primarySection = container.querySelector('[data-nav-section="true"]');
    expect(primarySection).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Work' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Catalog' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Growth' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Releases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Artist' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      buildLibraryViewRoute('releases')
    );
    expect(
      screen.getByRole('button', { name: 'Tim White' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tim White' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Touring' })).toHaveAttribute(
      'href',
      APP_ROUTES.SETTINGS_TOURING
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.AUDIENCE
    );
    expect(container.querySelector('[data-nav-section="more"]')).toBeNull();
  });

  it('renders recent chats in the Design V1 sidebar as App Router links', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-older',
          title: 'Release rollout',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
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
      appFlags: { DESIGN_V1: true },
    });

    expect(screen.getByText('Chats')).toBeInTheDocument();
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: true,
    });

    expect(screen.getByRole('link', { name: 'Pitch tasks' })).toHaveAttribute(
      'href',
      '/app/chat/thread-newer'
    );
    expect(
      screen.getByRole('button', {
        name: 'Chat Actions for Pitch tasks',
      })
    ).toBeInTheDocument();
  });

  it('renders compact chat loading without adding duplicate empty-state chat controls', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    const { unmount } = renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    expect(document.querySelector('.skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Loading chats')).not.toBeInTheDocument();
    unmount();

    mockUseChatConversationsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    expect(screen.getAllByRole('link', { name: 'New Chat' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'New Chat' })).toBeNull();
  });

  it('navigates to chat and opens the profile rail from artist name off chat routes', async () => {
    const user = userEvent.setup();
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.AUDIENCE);
    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
      overrides: {
        selectedProfile: {
          id: 'profile_123',
          displayName: 'Tim White',
          username: 'tim',
          usernameNormalized: 'tim',
        } as DashboardData['selectedProfile'],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Tim White' }));

    expect(mockRouterPush).toHaveBeenCalledWith(APP_ROUTES.CHAT);
    expect(mockOpenPreviewPanel).toHaveBeenCalledTimes(1);
  });

  it('shows the releases pending shell once for a pointer click', async () => {
    const user = userEvent.setup();

    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());

    await user.click(releasesLink);

    expect(mockShowPendingShell).toHaveBeenCalledTimes(1);
    expect(mockShowPendingShell).toHaveBeenCalledWith('releases');
  });

  it('does not show the releases pending shell when releases is already active', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);
    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());

    await user.click(releasesLink);

    expect(mockShowPendingShell).not.toHaveBeenCalled();
    expect(mockClearPendingShell).not.toHaveBeenCalled();
  });

  it('does not hijack modified releases link clicks', async () => {
    renderDashboardNav({ renderFn: render });

    const releasesLink = screen.getByRole('link', { name: 'Releases' });
    releasesLink.addEventListener('click', event => event.preventDefault());
    fireEvent.pointerDown(releasesLink, {
      button: 0,
      metaKey: true,
    });
    fireEvent.click(releasesLink, {
      button: 0,
      metaKey: true,
    });

    expect(mockShowPendingShell).toHaveBeenCalledTimes(1);
    expect(mockClearPendingShell).toHaveBeenCalledTimes(1);
  });

  it('keeps demo-disabled items as links on nested demo routes', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce('/demo/showcase/settings');
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

    const tasksLink = screen.getByRole('link', { name: 'Tasks' });
    expect(tasksLink).toHaveAttribute('href', APP_ROUTES.TASKS);
    tasksLink.addEventListener('click', event => event.preventDefault());

    await user.click(tasksLink);

    expect(mockToastInfo).toHaveBeenCalledWith(
      'Tasks is not available in demo mode'
    );
  });
});
