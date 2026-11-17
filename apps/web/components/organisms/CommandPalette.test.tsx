import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CommandPalette, CommandPaletteMainSurface } from './CommandPalette';
import { OPEN_COMMAND_PALETTE_EVENT } from './command-palette-events';

const { conversations, pushMock, pathnameMock } = vi.hoisted(() => ({
  conversations: {
    data: undefined as ChatConversation[] | undefined,
    isLoading: false,
    isError: false,
  },
  pushMock: vi.fn(),
  pathnameMock: vi.fn(() => '/app'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => pathnameMock(),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-alt={alt} />,
}));
vi.mock('@/lib/queries/useChatConversationsQuery', () => ({
  useChatConversationsQuery: () => conversations,
}));
vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
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

function makeDashboard(isAdmin: boolean): DashboardData {
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
      qrTipClicks: 0,
      linkTipClicks: 0,
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

function PaletteState() {
  const { isCommandPaletteOpen, commandPaletteHeader } = useHeaderActions();
  return (
    <>
      <output aria-label='Command palette state'>
        {isCommandPaletteOpen ? 'open' : 'closed'}
      </output>
      <div>{commandPaletteHeader}</div>
    </>
  );
}

function Palette({ isAdmin = false }: { readonly isAdmin?: boolean }) {
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
        <CommandPalette />
        <PaletteState />
        <main>
          <CommandPaletteMainSurface />
        </main>
      </HeaderActionsProvider>
    </DashboardDataContext.Provider>
  );
}

const paletteState = () =>
  screen.getByRole('status', { name: 'Command palette state' });

function conversation(id: string, title: string): ChatConversation {
  return {
    id,
    title,
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    latestTurnStatus: 'completed',
  };
}

beforeEach(() => {
  conversations.data = undefined;
  conversations.isLoading = false;
  conversations.isError = false;
  pathnameMock.mockReturnValue('/app');
  pushMock.mockClear();
});

describe('CommandPalette', () => {
  it('renders nothing outside an authenticated dashboard shell', () => {
    const { container } = render(
      <HeaderActionsProvider>
        <CommandPalette />
      </HeaderActionsProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles from Cmd+K and opens from the shell event', async () => {
    const user = userEvent.setup();
    render(<Palette />);

    expect(paletteState()).toHaveTextContent('closed');
    await user.keyboard('{Meta>}k{/Meta}');
    expect(paletteState()).toHaveTextContent('open');
    await screen.findByRole('combobox', { name: 'Command Palette Search' });
    await user.keyboard('{Meta>}k{/Meta}');
    expect(paletteState()).toHaveTextContent('closed');

    act(() => {
      globalThis.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
    });
    expect(paletteState()).toHaveTextContent('open');
  });

  it('opens recent chats from the palette and has no axe violations', async () => {
    const user = userEvent.setup();
    conversations.data = [conversation('thread-a', 'Plan the next release')];
    const { container } = render(<Palette />);

    await user.keyboard('{Control>}k{/Control}');
    const listbox = await screen.findByRole('listbox');
    await user.click(
      within(listbox).getByRole('option', { name: /Plan the next release/ })
    );

    expect(pushMock).toHaveBeenCalledWith('/app/chat/thread-a');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['loading recent chats', { isLoading: true }],
    ['no recent chats', { data: [] as ChatConversation[] }],
    ['an offline conversations query', { isError: true }],
    [
      'many long recent chats',
      {
        data: Array.from({ length: 8 }, (_, index) =>
          conversation(
            `thread-${index}`,
            `Release planning for The Extraordinarily Long Album Title, part ${index + 1} (Deluxe Anniversary Remastered Edition)`
          )
        ),
      },
    ],
  ])('has no axe violations with %s', async (_label, state) => {
    Object.assign(conversations, state);
    const user = userEvent.setup();
    const { container } = render(<Palette />);

    await user.keyboard('{Meta>}k{/Meta}');
    await screen.findByRole('combobox', { name: 'Command Palette Search' });
    await expectNoA11yViolations(container);
  });

  it('offers the workspace switch only to admins', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<Palette />);
    await user.keyboard('{Meta>}k{/Meta}');
    await screen.findByRole('combobox', { name: 'Command Palette Search' });
    expect(screen.queryByRole('option', { name: /Switch to/ })).toBeNull();
    await expectNoA11yViolations(container);
    unmount();

    render(<Palette isAdmin />);
    await user.keyboard('{Meta>}k{/Meta}');
    expect(
      await screen.findByRole('option', { name: /Switch to/ })
    ).toBeInTheDocument();
  });

  it('has no axe violations in a right-to-left document', async () => {
    const user = userEvent.setup();
    conversations.data = [conversation('thread-a', 'خطة الإصدار القادم')];
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <Palette />
      </div>
    );
    await user.keyboard('{Meta>}k{/Meta}');
    expect(
      await screen.findByRole('option', { name: /خطة الإصدار القادم/ })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
