import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { run as axeRun } from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversation } from '@/lib/queries/useChatConversationsQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatHistorySwitcher } from './ChatHistorySwitcher';

const push = vi.fn();
const refetch = vi.fn();
const queryState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  calls: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/queries/useChatConversationsQuery', () => ({
  useChatConversationsQuery: (options: Record<string, unknown>) => {
    queryState.calls.push(options);
    return queryState.current;
  },
}));

function chat(
  id: string,
  title: string,
  updatedAt: string,
  latestMessageRole: ChatConversation['latestMessageRole'] = 'user'
): ChatConversation {
  return {
    id,
    title,
    createdAt: updatedAt,
    updatedAt,
    latestMessageRole,
    latestTurnStatus: 'completed',
  };
}

const CHATS: ChatConversation[] = [
  chat('c1', 'Release Plan For Spring', '2026-11-08T19:55:00Z'),
  chat('c2', 'Tour Budget', '2026-11-05T20:00:00Z', 'assistant'),
  chat('c3', 'Merch Drop Ideas', '2026-10-01T20:00:00Z'),
];

function setQuery(state: Record<string, unknown>) {
  queryState.current = {
    data: undefined,
    isLoading: false,
    isError: false,
    isPaused: false,
    refetch,
    ...state,
  };
}

async function openSwitcher(title: string | null = 'Tour Budget') {
  const user = userEvent.setup({ delay: null });
  render(<ChatHistorySwitcher title={title} activeConversationId='c2' />);
  await user.click(screen.getByTestId('chat-history-trigger'));
  const menu = await screen.findByRole('menu');
  return { user, menu };
}

describe('ChatHistorySwitcher', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(Date.parse('2026-11-08T20:00:00Z'));
    push.mockReset();
    refetch.mockReset();
    queryState.calls = [];
    localStorage.clear();
    setQuery({ data: CHATS });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the current title, or New Chat before one exists', () => {
    const { rerender } = render(
      <ChatHistorySwitcher title='Tour Budget' activeConversationId='c2' />
    );
    expect(screen.getByTestId('chat-history-trigger')).toHaveTextContent(
      'Tour Budget'
    );

    rerender(<ChatHistorySwitcher title={null} activeConversationId={null} />);
    expect(screen.getByTestId('chat-history-trigger')).toHaveTextContent(
      'New Chat'
    );

    // An existing chat still waiting on its title matches its row in the list.
    rerender(<ChatHistorySwitcher title='  ' activeConversationId='c2' />);
    expect(screen.getByTestId('chat-history-trigger')).toHaveTextContent(
      'Conversation'
    );
  });

  it('does not fetch history until the title is hovered, focused or opened', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <ChatHistorySwitcher title='Tour Budget' activeConversationId='c2' />
    );
    expect(queryState.calls.at(-1)).toMatchObject({ enabled: false });

    await user.hover(screen.getByTestId('chat-history-trigger'));
    expect(queryState.calls.at(-1)).toMatchObject({ enabled: true });
  });

  it('opens with search focused and lists chats newest first with ages', async () => {
    const { menu } = await openSwitcher();

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Chat History')).toHaveFocus()
    );
    const rows = within(menu).getAllByTestId('chat-history-row');
    expect(rows.map(row => row.textContent)).toEqual([
      'Release Plan For Spring 5m',
      'Tour Budget 3d',
      'Merch Drop Ideas 1mo',
    ]);
    expect(
      within(menu).getByRole('menuitem', { name: 'Tour Budget 3d' })
    ).toHaveAttribute('data-selected', 'true');
    // The rows' menu sits inside the scrolling list, under the pinned search.
    expect(
      menu.closest('[data-slot="common-dropdown-scroll-body"]')
    ).not.toBeNull();
  });

  it('filters as you type and shows No Matching Chats when nothing fits', async () => {
    const { user, menu } = await openSwitcher();
    const input = screen.getByPlaceholderText('Chat History');

    await user.type(input, 'spring');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
    expect(
      within(menu).getByRole('menuitem', { name: 'Release Plan For Spring 5m' })
    ).toBeVisible();

    await user.clear(input);
    await user.type(input, 'zzz');
    expect(within(menu).queryAllByTestId('chat-history-row')).toHaveLength(0);
    expect(menu).toHaveTextContent('No Matching Chats');
  });

  it('opens a chat with the keyboard: arrow down, Enter', async () => {
    const { user } = await openSwitcher();
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Chat History')).toHaveFocus()
    );

    for (const name of [
      'Release Plan For Spring 5m',
      'Tour Budget 3d',
      'Merch Drop Ideas 1mo',
    ]) {
      await user.keyboard('{ArrowDown}');
      await waitFor(() =>
        expect(screen.getByRole('menuitem', { name })).toHaveFocus()
      );
    }
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith('/app/chat/c3');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('Enter in the search opens the first match', async () => {
    const { user } = await openSwitcher();
    await user.type(screen.getByPlaceholderText('Chat History'), 'merch');
    await user.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith('/app/chat/c3');
  });

  it('Escape clears a search first, then closes', async () => {
    const { user } = await openSwitcher();
    const input = screen.getByPlaceholderText('Chat History');
    await user.type(input, 'tour');

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it('selecting the open chat closes without navigating', async () => {
    const { user } = await openSwitcher();
    await user.click(screen.getByRole('menuitem', { name: 'Tour Budget 3d' }));
    expect(push).not.toHaveBeenCalled();
  });

  it('marks a chat started in place as open, from the address bar', async () => {
    // The page writes the new id into the URL without a navigation.
    window.history.replaceState(null, '', '/app/chat/c1');
    const user = userEvent.setup({ delay: null });
    render(<ChatHistorySwitcher title='Release' activeConversationId={null} />);
    await user.click(screen.getByTestId('chat-history-trigger'));
    const row = await screen.findByRole('menuitem', {
      name: 'Release Plan For Spring 5m',
    });
    expect(row).toHaveAttribute('data-selected', 'true');
    await user.click(row);
    expect(push).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/');
  });

  it('dots unread replies once a read baseline exists, and clears on open', async () => {
    localStorage.setItem(
      'jovie:sidebar-thread-read-at',
      JSON.stringify({
        c1: '2026-11-08T19:55:00Z',
        c2: '2026-11-01T00:00:00Z',
        c3: '2026-10-01T20:00:00Z',
      })
    );
    const { user, menu } = await openSwitcher('Release Plan For Spring');
    // c2 is the active chat in this render, so it never shows a dot.
    expect(
      within(menu)
        .getAllByTestId('chat-history-row')
        .filter(row => row.dataset.unread === 'true')
    ).toHaveLength(0);
    await user.keyboard('{Escape}');

    render(
      <ChatHistorySwitcher
        title='Release Plan For Spring'
        activeConversationId='c1'
      />
    );
    await user.click(screen.getAllByTestId('chat-history-trigger').at(-1)!);
    const reopened = await screen.findByRole('menu');
    const tourRow = within(reopened)
      .getAllByTestId('chat-history-row')
      .find(row => row.textContent?.startsWith('Tour Budget'));
    expect(tourRow).toHaveAttribute('data-unread', 'true');

    await user.click(
      within(reopened).getByRole('menuitem', { name: 'Tour Budget 3d' })
    );
    expect(push).toHaveBeenCalledWith('/app/chat/c2');
    expect(
      JSON.parse(localStorage.getItem('jovie:sidebar-thread-read-at') ?? '{}')
        .c2
    ).toBe('2026-11-05T20:00:00Z');
  });

  it('shows No Chats Yet for an account without history', async () => {
    setQuery({ data: [] });
    const { menu } = await openSwitcher(null);
    expect(menu).toHaveTextContent('No Chats Yet');
  });

  it('shows a loading state that is announced', async () => {
    setQuery({ data: undefined, isLoading: true });
    const { menu } = await openSwitcher();
    expect(within(menu).getByRole('status')).toHaveTextContent(
      'Loading menu items'
    );
  });

  it('offers Retry when history fails to load', async () => {
    setQuery({ data: undefined, isError: true });
    const { user, menu } = await openSwitcher();
    expect(menu).toHaveTextContent("Couldn't Load Chats");
    await user.click(within(menu).getByRole('menuitem', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows the load error, not an empty list, when offline with nothing cached', async () => {
    setQuery({ data: undefined, isPaused: true });
    const { menu } = await openSwitcher();
    expect(menu).toHaveTextContent("Couldn't Load Chats");
    expect(within(menu).getByRole('menuitem', { name: 'Retry' })).toBeVisible();
    expect(menu).not.toHaveTextContent('No Chats Yet');
  });

  it('keeps the load error and Retry visible while a search is typed', async () => {
    setQuery({ data: undefined, isError: true });
    const { user, menu } = await openSwitcher();
    await user.type(screen.getByPlaceholderText('Chat History'), 'tour');
    expect(menu).toHaveTextContent("Couldn't Load Chats");
    expect(within(menu).getByRole('menuitem', { name: 'Retry' })).toBeVisible();
    expect(menu).not.toHaveTextContent('No Matching Chats');
  });

  it('keeps the title pill and its focus ring inside the truncating header', () => {
    render(
      <ChatHistorySwitcher title='Tour Budget' activeConversationId='c2' />
    );
    const trigger = screen.getByTestId('chat-history-trigger');
    expect(trigger.className).not.toMatch(/(^|\s)-m[xl]-/);
    expect(trigger.className).toContain('focus-visible:ring-inset');
  });

  it('has no axe violations closed, as a chat title or a new chat', async () => {
    const { container } = render(
      <div>
        <ChatHistorySwitcher title='Tour Budget' activeConversationId='c2' />
        <ChatHistorySwitcher title={null} activeConversationId={null} />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations open (besides the tracked in-menu search gap)', async () => {
    const { menu } = await openSwitcher();
    const { violations } = await axeRun(menu, {
      rules: { 'aria-required-children': { enabled: false } },
    });
    expect(violations.map(v => v.id)).toEqual([]);
  });
});
