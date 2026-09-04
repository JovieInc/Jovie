/**
 * Tests for the global Cmd+K shell that wraps CmdKPalette.
 *
 * Asserts: the palette stays mounted (no-op) when there's no DashboardData
 * context, opens on Cmd+K, surfaces recent chats from the conversations
 * query, and renders the autofocused search input.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  CommandPalette,
  CommandPaletteMainSurface,
} from '@/components/organisms/CommandPalette';
import { HeaderSearchSurfaceFromContext } from '@/components/shell/HeaderSearchSurfaceFromContext';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';

const pushMock = vi.fn();
const prefetchMock = vi.fn();
const pathnameMock = vi.hoisted(() => vi.fn(() => '/app'));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: prefetchMock,
    replace: vi.fn(),
  }),
  usePathname: () => pathnameMock(),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@jovie/ui', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div role='dialog'>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Title: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Description: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: {
      tools: {
        albumArt: {
          availability: 'available',
          reason: null,
          reasonCode: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/lib/queries', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/queries')>('@/lib/queries');
  return {
    ...actual,
    useChatConversationsQuery: () => ({
      data: [
        {
          id: 'thread-active',
          title: 'Active rollout',
          createdAt: '2026-08-12T00:00:00.000Z',
          updatedAt: '2026-08-12T00:00:00.000Z',
          latestTurnStatus: 'streaming',
        },
        {
          id: 'thread-failed',
          title: 'Needs review',
          createdAt: '2026-08-13T00:00:00.000Z',
          updatedAt: '2026-08-13T00:00:00.000Z',
          latestTurnStatus: 'failed_timeout',
        },
        {
          id: 'thread-a',
          title: 'Q1 release plan',
          createdAt: '2026-08-18T00:00:00.000Z',
          updatedAt: '2026-08-18T00:00:00.000Z',
          latestTurnStatus: 'completed',
        },
        {
          id: 'thread-b',
          title: null,
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
          latestTurnStatus: 'completed',
        },
        {
          id: 'thread-c',
          title: 'Campaign planning',
          createdAt: '2026-08-16T00:00:00.000Z',
          updatedAt: '2026-08-16T00:00:00.000Z',
          latestTurnStatus: 'completed',
        },
        {
          id: 'thread-d',
          title: 'Hidden default chat',
          createdAt: '2026-08-15T00:00:00.000Z',
          updatedAt: '2026-08-15T00:00:00.000Z',
          latestTurnStatus: 'completed',
        },
        {
          id: 'thread-e',
          title: 'Older hidden chat',
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
          latestTurnStatus: 'completed',
        },
      ],
      isLoading: false,
    }),
  };
});

function makeDashboard(isAdmin = false): DashboardData {
  return {
    user: { id: 'user-1' },
    creatorProfiles: [],
    selectedProfile: { id: 'profile-1' } as DashboardData['selectedProfile'],
    needsOnboarding: false,
    sidebarCollapsed: false,
    hasSocialLinks: false,
    hasMusicLinks: false,
    isAdmin,
    tippingStats: {
      tipClicks: 0,
      tipsSubmitted: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    },
    profileCompletion: {
      percentage: 0,
      completedCount: 0,
      totalCount: 0,
      steps: [],
      profileIsLive: false,
    },
  };
}

function CommandPaletteHeaderHarness() {
  const { commandPaletteHeader } = useHeaderActions();
  return <div>{commandPaletteHeader}</div>;
}

function withDashboard(node: ReactNode, isAdmin = false) {
  return (
    <DashboardDataContext.Provider value={makeDashboard(isAdmin)}>
      <HeaderActionsProvider>
        {node}
        <CommandPaletteMainSurface />
        <CommandPaletteHeaderHarness />
      </HeaderActionsProvider>
    </DashboardDataContext.Provider>
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/app');
  });

  it('renders nothing when DashboardDataContext is missing', () => {
    const { container } = render(<CommandPalette />);
    expect(container.firstChild).toBeNull();
  });

  it('opens on Cmd+K in the main plane and focuses the breadcrumb input', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    const input = screen.getByLabelText('Command Palette Search');
    expect(input).toBeInTheDocument();
    // React applies autofocus by calling .focus() on mount, not by emitting
    // the deprecated HTML attribute — assert focus state instead.
    expect(input).toHaveFocus();
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('continues to open on Ctrl+K independently of sidebar Search', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', ctrlKey: true });
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
  });

  it('opens the same main plane from the sidebar Search trigger', () => {
    render(
      withDashboard(
        <>
          <CommandPalette />
          <HeaderSearchSurfaceFromContext />
        </>
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));

    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
  });

  it('toggles the main plane closed from the active sidebar Search trigger', () => {
    render(
      withDashboard(
        <>
          <CommandPalette />
          <HeaderSearchSurfaceFromContext />
        </>
      )
    );

    const trigger = screen.getByRole('button', { name: 'Search Jovie' });
    fireEvent.click(trigger);
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
  });

  it('dismisses the main plane before a persistent sidebar destination runs', () => {
    render(
      withDashboard(
        <div data-app-shell-sidebar-mount='true'>
          <HeaderSearchSurfaceFromContext />
          <button type='button'>Library</button>
          <CommandPalette />
        </div>
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
  });

  it('commits the selected sidebar-triggered main-plane result with Enter', () => {
    pushMock.mockClear();
    render(
      withDashboard(
        <>
          <CommandPalette />
          <HeaderSearchSurfaceFromContext />
        </>
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
    const input = screen.getByLabelText('Command Palette Search');
    fireEvent.change(input, { target: { value: 'Calendar' } });
    expect(input).toHaveValue('Calendar');
    expect(
      screen.getByRole('option', {
        name: 'Calendar Plan release dates and campaign moments. ⌘1',
      })
    ).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/app/calendar');
  });

  it('lists recent chats with safe fallback titles', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(screen.getByText('Recent Chats')).toBeInTheDocument();
    expect(screen.getByText('Q1 release plan')).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
    expect(screen.getByText('Active chat')).toBeVisible();
    expect(screen.getByText('Needs attention')).toBeVisible();
    expect(screen.queryByText('Hidden default chat')).toBeNull();
  });

  it('prioritizes the current chat and still finds chats outside the default five', () => {
    pathnameMock.mockReturnValue('/app/chat/thread-d');
    const { container } = render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });

    const recentSection = container.querySelector(
      '[data-palette-section="recent-chats"]'
    );
    expect(recentSection).not.toBeNull();
    const rows = within(recentSection as HTMLElement).getAllByRole('option');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Hidden default chat');
    expect(rows[0]).toHaveTextContent('Current chat');

    fireEvent.change(screen.getByLabelText('Command Palette Search'), {
      target: { value: 'Older hidden chat' },
    });
    expect(screen.getByText('Older hidden chat')).toBeVisible();
  });

  it('shows the admin workspace action and its shortcut', () => {
    pathnameMock.mockReturnValue('/app');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to OV'));
    expect(action).toBeDefined();
    expect(action).toHaveTextContent('⌥ ⇧ W');
  });

  it('routes the admin workspace action to the next workspace', () => {
    pushMock.mockClear();
    pathnameMock.mockReturnValue('/app');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to OV'));
    fireEvent.mouseDown(action!);

    expect(pushMock).toHaveBeenCalledWith('/app/ov/chat');
  });

  it('routes the admin workspace action from OV back to Jovie', () => {
    pushMock.mockClear();
    pathnameMock.mockReturnValue('/app/ov/ops');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to Jovie'));
    fireEvent.mouseDown(action!);

    expect(pushMock).toHaveBeenCalledWith('/app');
  });

  it('does not leak the workspace action to non-admins', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });

    expect(screen.queryByText('Switch to OV')).not.toBeInTheDocument();
    expect(screen.queryByText('Switch to Jovie')).not.toBeInTheDocument();
  });

  it('routes a recent-chat commit to the chat route', () => {
    pushMock.mockClear();
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    const threadRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Q1 release plan'));
    expect(threadRow).toBeDefined();
    fireEvent.mouseDown(threadRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/chat/thread-a');
  });

  it('toggles closed when Cmd+K is pressed again', () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(
      screen.queryByLabelText('Command Palette Search')
    ).toBeInTheDocument();
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(
      screen.queryByLabelText('Command Palette Search')
    ).not.toBeInTheDocument();
  });

  it('escapes back to the prior focus target', async () => {
    render(
      withDashboard(
        <>
          <button type='button'>Return target</button>
          <CommandPalette />
        </>
      )
    );
    const origin = screen.getByRole('button', { name: 'Return target' });
    origin.focus();
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
    fireEvent.keyDown(globalThis, { key: 'Escape' });
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
    await waitFor(() => expect(origin).toHaveFocus());
  });
});
