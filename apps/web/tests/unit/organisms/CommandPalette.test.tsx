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
import { type ReactNode, useCallback, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { segmentedAccessibleName } from '@/tests/utils/accessible-name';

const pushMock = vi.fn();
const assignMock = vi.fn();
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
  LoadingSkeleton: ({ label }: { label: string }) => (
    <div role='status' aria-label={label} />
  ),
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
  useArtistSearchQuery: () => {
    const [query, setQuery] = useState('');
    const clear = useCallback(() => setQuery(''), []);
    return {
      results: [],
      state: 'idle',
      error: null,
      query,
      isPending: false,
      search: setQuery,
      searchImmediate: setQuery,
      clear,
    };
  },
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

vi.mock('@/lib/queries/useChatConversationsQuery', () => {
  return {
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

function PageSearchTrigger() {
  const { openPageSearch } = useHeaderActions();
  return (
    <button
      type='button'
      onClick={() =>
        openPageSearch([
          {
            kind: 'nav',
            id: 'ov-people',
            label: 'People',
            description: 'Permitted people page',
            iconName: 'Users',
            href: '/app/ov/people',
            surfaces: ['cmdk'],
          },
        ])
      }
    >
      Find a page
    </button>
  );
}

function CommandPaletteState() {
  const { isCommandPaletteOpen } = useHeaderActions();
  return (
    <output aria-label='Command palette state'>
      {isCommandPaletteOpen ? 'open' : 'closed'}
    </output>
  );
}

function withDashboard(
  node: ReactNode,
  isAdmin = false,
  mountMainSurface = true
) {
  const dashboard = makeDashboard(isAdmin);

  return (
    <DashboardDataContext.Provider
      value={{
        ...dashboard,
        identities: dashboard.creatorProfiles,
        activeIdentity: dashboard.selectedProfile,
      }}
    >
      <HeaderActionsProvider>
        {node}
        {mountMainSurface && <CommandPaletteMainSurface />}
        <CommandPaletteHeaderHarness />
      </HeaderActionsProvider>
    </DashboardDataContext.Provider>
  );
}

describe('CommandPalette', () => {
  beforeEach(() => {
    pathnameMock.mockReturnValue('/app');
    assignMock.mockClear();
    vi.stubGlobal('location', { assign: assignMock });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing when DashboardDataContext is missing', () => {
    const { container } = render(<CommandPalette />);
    expect(container.firstChild).toBeNull();
  });

  it('opens on Cmd+K in the main plane and focuses the breadcrumb input', async () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');
    const input = await screen.findByLabelText('Command Palette Search');
    expect(input).toBeInTheDocument();
    // React applies autofocus by calling .focus() on mount, not by emitting
    // the deprecated HTML attribute — assert focus state instead.
    expect(input).toHaveFocus();
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancels a pending first open with Escape and can open again', async () => {
    const controller = (
      <>
        <button type='button'>Return target</button>
        <CommandPalette />
        <CommandPaletteState />
      </>
    );
    // Hold the lazy surface absent so this proves pending cancellation even
    // when previous tests have already loaded its dynamic import.
    const view = render(withDashboard(controller, false, false));
    const origin = screen.getByRole('button', { name: 'Return target' });
    origin.focus();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByLabelText('Command palette state')).toHaveTextContent(
      'open'
    );
    for (const guarded of [
      { repeat: true },
      { isComposing: true },
      { keyCode: 229 },
      { altKey: true },
    ]) {
      expect(fireEvent.keyDown(origin, { key: 'Escape', ...guarded })).toBe(
        true
      );
      expect(screen.getByLabelText('Command palette state')).toHaveTextContent(
        'open'
      );
    }
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(origin).toHaveFocus());
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();

    view.rerender(withDashboard(controller));
    fireEvent.keyDown(origin, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
  });

  it('continues to open on Ctrl+K independently of sidebar Search', async () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', ctrlKey: true });
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
  });

  it('honors editor and modifier ownership before opening and closing search', async () => {
    render(
      withDashboard(
        <>
          <button type='button'>Shortcut origin</button>
          <textarea aria-label='Shortcut editor' />
          <CommandPalette />
        </>
      )
    );
    const origin = screen.getByRole('button', { name: 'Shortcut origin' });
    const editor = screen.getByRole('textbox', { name: 'Shortcut editor' });
    origin.focus();
    for (const modifier of [
      {},
      { metaKey: true, shiftKey: true },
      { ctrlKey: true, altKey: true },
      { metaKey: true, ctrlKey: true },
      { metaKey: true, repeat: true },
      { metaKey: true, isComposing: true },
      { metaKey: true, keyCode: 229 },
    ]) {
      expect(fireEvent.keyDown(origin, { key: 'k', ...modifier })).toBe(true);
      expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
    }
    const handled = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    handled.preventDefault();
    fireEvent(origin, handled);
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
    editor.focus();
    expect(fireEvent.keyDown(editor, { key: 'k', metaKey: true })).toBe(true);
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();

    origin.focus();
    fireEvent.keyDown(origin, { key: 'k', metaKey: true });
    await screen.findByLabelText('Command Palette Search');
    editor.focus();
    expect(fireEvent.keyDown(editor, { key: 'k', metaKey: true })).toBe(true);
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();
    expect(editor).toHaveFocus();
    origin.focus();
    fireEvent.keyDown(origin, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
    await waitFor(() => expect(origin).toHaveFocus());
  });

  it('opens the same main plane from the sidebar Search trigger', async () => {
    render(
      withDashboard(
        <>
          <CommandPalette />
          <HeaderSearchSurfaceFromContext />
        </>
      )
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search Jovie' }));
    await screen.findByTestId('cmdk-main-plane');

    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
  });

  it('toggles the main plane closed from the active sidebar Search trigger', async () => {
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
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
  });

  it('dismisses the main plane before a persistent sidebar destination runs', async () => {
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
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByTestId('cmdk-main-plane')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
  });

  it('commits the selected sidebar-triggered main-plane result with Enter', async () => {
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
    await screen.findByTestId('cmdk-main-plane');
    const input = screen.getByLabelText('Command Palette Search');
    fireEvent.change(input, { target: { value: 'Calendar' } });
    expect(input).toHaveValue('Calendar');
    expect(
      screen.getByRole('option', {
        name: segmentedAccessibleName(
          'Calendar',
          'Plan release dates and campaign moments.',
          '⌘1'
        ),
      })
    ).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/app/calendar');
  });

  it('confines Find a page to the supplied permitted destinations without chat or skill results', async () => {
    render(
      withDashboard(
        <>
          <CommandPalette />
          <PageSearchTrigger />
        </>,
        true
      )
    );
    const trigger = screen.getByRole('button', { name: 'Find a page' });
    trigger.focus();
    fireEvent.click(trigger);
    const search = await screen.findByLabelText('Command Palette Search');
    expect(search).toHaveAttribute('placeholder', 'Find a page…');
    expect(search).toHaveFocus();
    const list = screen.getByTestId('cmdk-main-plane');
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(within(list).getByRole('option')).toHaveTextContent('People');
    expect(within(list).queryByText('Recent Chats')).toBeNull();
    expect(within(list).queryByText('Workspace')).toBeNull();
    fireEvent.change(search, { target: { value: 'People' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/app/ov/people')
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('lists recent chats with safe fallback titles', async () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByText('Recent Chats')).toBeInTheDocument();
    expect(screen.getByText('Q1 release plan')).toBeInTheDocument();
    expect(screen.getByText('Untitled chat')).toBeInTheDocument();
    expect(screen.getByText('Active chat')).toBeVisible();
    expect(screen.getByText('Needs attention')).toBeVisible();
    expect(screen.queryByText('Hidden default chat')).toBeNull();
  });

  it('prioritizes the current chat and still finds chats outside the default five', async () => {
    pathnameMock.mockReturnValue('/app/chat/thread-d');
    const { container } = render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');

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

  it('shows the admin workspace action and its shortcut', async () => {
    pathnameMock.mockReturnValue('/app');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to OV'));
    expect(action).toBeDefined();
    expect(action).toHaveTextContent('⌥ ⇧ W');
  });

  it('document-navigates the admin workspace action to the next workspace', async () => {
    pushMock.mockClear();
    pathnameMock.mockReturnValue('/app');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to OV'));
    fireEvent.mouseDown(action!);

    expect(assignMock).toHaveBeenCalledWith('/app/ov/chat');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('document-navigates the admin workspace action from OV back to Jovie', async () => {
    pushMock.mockClear();
    pathnameMock.mockReturnValue('/app/ov/ops');
    render(withDashboard(<CommandPalette />, true));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');

    const action = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Switch to Jovie'));
    fireEvent.mouseDown(action!);

    expect(assignMock).toHaveBeenCalledWith('/app');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('does not leak the workspace action to non-admins', async () => {
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');

    expect(screen.queryByText('Switch to OV')).not.toBeInTheDocument();
    expect(screen.queryByText('Switch to Jovie')).not.toBeInTheDocument();
  });

  it('routes a recent-chat commit to the chat route', async () => {
    pushMock.mockClear();
    render(withDashboard(<CommandPalette />));
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByTestId('cmdk-main-plane');
    const threadRow = screen
      .getAllByRole('option')
      .find(el => el.textContent?.includes('Q1 release plan'));
    expect(threadRow).toBeDefined();
    fireEvent.mouseDown(threadRow!);
    expect(pushMock).toHaveBeenCalledWith('/app/chat/thread-a');
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])(
    'closes from the focused search with the opening accelerator %j',
    async modifier => {
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
      fireEvent.keyDown(origin, { key: 'k', ...modifier });
      const input = await screen.findByLabelText('Command Palette Search');
      expect(input).toHaveFocus();
      fireEvent.change(input, { target: { value: 'Settings' } });
      fireEvent.keyDown(input, { key: 'k', ...modifier });
      expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
      await waitFor(() => expect(origin).toHaveFocus());
      fireEvent.keyDown(origin, { key: 'k', ...modifier });
      expect(
        await screen.findByLabelText('Command Palette Search')
      ).toHaveValue('');
    }
  );

  it('leaves sidebar activation and unrelated text editing to their owners', async () => {
    const onSidebarKeyDown = vi.fn();
    render(
      withDashboard(
        <>
          <button type='button' onKeyDown={onSidebarKeyDown}>
            Sidebar action
          </button>
          <textarea aria-label='Other editor' />
          <CommandPalette />
        </>
      )
    );
    fireEvent.keyDown(globalThis, { key: 'k', metaKey: true });
    await screen.findByLabelText('Command Palette Search');
    pushMock.mockClear();
    const sidebar = screen.getByRole('button', { name: 'Sidebar action' });
    sidebar.focus();
    expect(fireEvent.keyDown(sidebar, { key: 'Enter' })).toBe(true);
    expect(onSidebarKeyDown).toHaveBeenCalledOnce();
    const editor = screen.getByRole('textbox', { name: 'Other editor' });
    editor.focus();
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape']) {
      expect(fireEvent.keyDown(editor, { key })).toBe(true);
    }
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Command Palette Search')).toBeInTheDocument();
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
    await screen.findByTestId('cmdk-main-plane');
    expect(screen.getByLabelText('Command Palette Search')).toHaveFocus();
    fireEvent.keyDown(screen.getByLabelText('Command Palette Search'), {
      key: 'Escape',
    });
    expect(screen.queryByTestId('cmdk-main-plane')).toBeNull();
    await waitFor(() => expect(origin).toHaveFocus());
  });
});
