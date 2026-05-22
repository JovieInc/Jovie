import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { CommandPalette } from '@/components/organisms/CommandPalette';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { APP_ROUTES } from '@/constants/routes';
import {
  mockClearPendingShell,
  mockOpenPreviewPanel,
  mockRouterPush,
  mockShowPendingShell,
  mockToastInfo,
  mockTogglePreviewPanel,
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

describe('DashboardNav interactions', () => {
  afterEach(() => {
    resetDashboardNavTestMocks();
  });

  it('renders the full primary navigation config', () => {
    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      APP_ROUTES.RELEASES
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.AUDIENCE
    );
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  });

  it('adds Library to navigation when the new design flag is enabled', () => {
    renderDashboardNav({
      renderFn: render,
      appFlags: { SHELL_CHAT_V1: true },
    });

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      APP_ROUTES.LIBRARY
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
    mockUsePathname.mockReturnValueOnce(APP_ROUTES.RELEASES);

    renderDashboardNav({ renderFn: render });

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: 'Profile' })).not.toHaveAttribute(
      'aria-pressed',
      'true'
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

    const profileButton = screen.getByRole('button', { name: 'Profile' });
    // In the new shell nav design (DESIGN_V1 on by default), the icon is rendered
    // directly as an SVG element rather than inside a data-sidebar-icon wrapper span.
    const iconNode = profileButton.querySelector('svg');
    const labelNode = profileButton.querySelector('span.truncate');

    expect(iconNode).toBeTruthy();
    expect(labelNode).toHaveTextContent('Profile');
    expect(labelNode).toHaveClass('group-data-[collapsible=icon]:hidden');
  });

  it('profile button toggles the drawer when already on chat', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    renderDashboardNav({ renderFn: render });

    const profileButton = screen.getByRole('button', { name: 'Profile' });
    await user.click(profileButton);

    expect(mockTogglePreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it('keeps the shell nav profile button wired to the same drawer action', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.CHAT);
    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    await user.click(screen.getByRole('button', { name: 'Profile' }));

    expect(mockTogglePreviewPanel).toHaveBeenCalledTimes(1);
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
      children: <CommandPalette />,
    });

    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(screen.getByLabelText('Command palette search')).toBeInTheDocument();
  });

  it('groups artist-owned routes under the artist name after Threads in Design V1', () => {
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

    const threadsHeading = screen.getByText('Threads');
    const artistGroupButton = screen.getByRole('button', {
      name: 'Tim White',
    });
    expect(artistGroupButton).toBeInTheDocument();
    expect(screen.queryByText('Artist Workspace')).not.toBeInTheDocument();
    expect(
      threadsHeading.compareDocumentPosition(artistGroupButton) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute(
      'href',
      APP_ROUTES.RELEASES
    );
    expect(screen.getByRole('link', { name: 'Audience' })).toHaveAttribute(
      'href',
      APP_ROUTES.AUDIENCE
    );
    expect(
      container.querySelector('[data-nav-section="artist-workspace"]')
    ).toBeInTheDocument();
  });

  it('renders recent threads in the Design V1 sidebar as App Router links', () => {
    mockUseChatConversationsQuery.mockReturnValueOnce({
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

    expect(screen.getByText('Threads')).toBeInTheDocument();
    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 10,
      enabled: true,
    });

    expect(screen.getByRole('link', { name: 'Pitch tasks' })).toHaveAttribute(
      'href',
      '/app/chat/thread-newer'
    );
    expect(
      screen.queryByRole('button', { name: 'Thread actions' })
    ).not.toBeInTheDocument();
  });

  it('renders compact thread loading and empty states from the real conversations query', async () => {
    const user = userEvent.setup();

    mockUseChatConversationsQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
    });

    const { unmount } = renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    expect(document.querySelector('.skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Loading threads')).not.toBeInTheDocument();
    unmount();

    mockUseChatConversationsQuery.mockReturnValueOnce({
      data: [],
      isLoading: false,
      isError: false,
    });

    renderDashboardNav({
      renderFn: render,
      appFlags: { DESIGN_V1: true },
    });

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(mockRouterPush).toHaveBeenCalledWith(APP_ROUTES.CHAT);
  });

  it('profile button navigates to chat before opening the drawer off chat routes', async () => {
    const user = userEvent.setup();

    mockUsePathname.mockReturnValueOnce(APP_ROUTES.AUDIENCE);
    renderDashboardNav({ renderFn: render });

    await user.click(screen.getByRole('button', { name: 'Profile' }));

    expect(mockRouterPush).toHaveBeenCalledWith(APP_ROUTES.CHAT);
    expect(mockOpenPreviewPanel).toHaveBeenCalledTimes(1);
    expect(mockTogglePreviewPanel).not.toHaveBeenCalled();
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
