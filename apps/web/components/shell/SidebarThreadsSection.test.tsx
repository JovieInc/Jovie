import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  getSidebarThreadStatus,
  isTimestampAfter,
  readThreadReadState,
  type SidebarThread,
  SidebarThreadsSection,
  THREAD_READ_STORAGE_KEY,
  toSidebarThread,
  writeThreadReadState,
} from './SidebarThreadsSection';

const threads: SidebarThread[] = [
  {
    id: 'thread-older',
    href: '/app/chat/thread-older',
    title: 'Release rollout',
    status: 'complete',
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
  {
    id: 'thread-newer',
    href: '/app/chat/thread-newer',
    title: 'Pitch tasks',
    status: 'complete',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
];

describe('SidebarThreadsSection', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('routes thread utility glyphs through the shared sidebar icon contracts', () => {
    const { rerender } = render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        onThreadContextMenu={vi.fn()}
        tight
        collapsed={false}
      />
    );

    const chatActionIcon = screen
      .getByRole('button', { name: 'Chat Actions for Pitch tasks' })
      .querySelector('svg');
    const allChatsIcon = screen
      .getByRole('link', { name: 'All Chats' })
      .querySelector('svg');

    expect(chatActionIcon).toHaveClass('h-3', 'w-3', 'text-sidebar-muted/70');
    expect(allChatsIcon).toHaveClass('h-3', 'w-3', 'text-sidebar-muted/70');

    rerender(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        state='error'
        onRetry={vi.fn()}
        tight
        collapsed={false}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Retry Chats' }).querySelector('svg')
    ).toHaveClass('h-3', 'w-3', 'text-sidebar-muted/70');

    rerender(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        onNewThread={vi.fn()}
        tight
        collapsed={false}
      />
    );

    expect(
      screen.getByRole('button', { name: 'New Chat' }).querySelector('svg')
    ).toHaveClass('h-3', 'w-3', 'text-sidebar-muted/70');
  });

  it('uses the full middle track at rest and layers chat actions over a visible cross-engine faded edge', () => {
    const title =
      'Reply with exactly one short sentence confirming the artist release plan';

    render(
      <SidebarThreadsSection
        threads={[
          {
            id: 'thread-long-title',
            href: '/app/chat/thread-long-title',
            title,
            status: 'complete',
            updatedAt: '2026-05-12T00:00:00.000Z',
          },
        ]}
        activeThreadId={null}
        onThreadContextMenu={vi.fn()}
        tight
        collapsed={false}
      />
    );

    const label = screen.getByText(title);

    expect(label).toHaveClass(
      'w-full',
      'justify-self-stretch',
      'overflow-hidden'
    );
    expect(label).not.toHaveClass('justify-self-start', 'truncate');
    expect(label.className).toContain(
      'mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)'
    );
    expect(label.className).toContain(
      '-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)'
    );
    const row = screen.getByRole('link', { name: title });
    const action = screen.getByRole('button', {
      name: `Chat Actions for ${title}`,
    });

    expect(row).toHaveClass('grid-cols-[18px_minmax(0,1fr)]');
    expect(row).not.toHaveClass(
      'grid-cols-[18px_minmax(0,1fr)_20px]',
      'grid-cols-[18px_minmax(0,1fr)_minmax(34px,auto)]',
      'pr-8'
    );
    expect(action).toHaveClass('right-2.5', 'group-hover/thread:bg-surface-0');
    expect(action).toHaveClass('absolute', 'opacity-0');
  });

  it('renders dense thread links with canonical shell row state', () => {
    render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId='thread-newer'
        tight
        collapsed={false}
      />
    );

    const activeThread = screen.getByRole('link', { name: 'Pitch tasks' });
    const inactiveThread = screen.getByRole('link', {
      name: 'Release rollout',
    });

    expect(activeThread).toHaveAttribute('href', '/app/chat/thread-newer');
    expect(activeThread).toHaveAttribute('aria-current', 'page');
    expect(activeThread).toHaveClass('h-6');
    expect(activeThread).toHaveClass('bg-sidebar-accent-active');
    expect(activeThread).toHaveClass('text-primary-token');
    expect(activeThread).not.toHaveClass(
      'shadow-[inset_2px_0_0_0_var(--color-accent)]'
    );
    expect(inactiveThread).toHaveClass('text-secondary-token');
    expect(inactiveThread).toHaveClass('hover:bg-sidebar-accent');
    expect(inactiveThread).not.toHaveClass(
      'hover:bg-surface-1',
      'focus-visible:bg-surface-1'
    );
    expect(inactiveThread).toHaveClass('focus-visible:ring-2');
  });

  it('keeps thread action affordances opt-in and wired to the row thread', () => {
    const onThreadContextMenu = vi.fn();

    render(
      <SidebarThreadsSection
        threads={threads.slice(1)}
        activeThreadId={null}
        onThreadContextMenu={onThreadContextMenu}
        tight
        collapsed={false}
      />
    );

    const threadLink = screen.getByRole('link', { name: 'Pitch tasks' });
    const actionsButton = screen.getByRole('button', {
      name: 'Chat Actions for Pitch tasks',
    });

    fireEvent.contextMenu(threadLink);
    fireEvent.click(actionsButton);

    expect(onThreadContextMenu).toHaveBeenCalledTimes(2);
    expect(onThreadContextMenu.mock.calls[0][1]).toMatchObject({
      id: 'thread-newer',
    });
    expect(onThreadContextMenu.mock.calls[1][1]).toMatchObject({
      id: 'thread-newer',
    });
  });

  it('shows an all chats link when chats are present', () => {
    render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        allThreadsActive
        tight
        collapsed={false}
      />
    );

    const allThreadsLink = screen.getByRole('link', {
      name: 'All Chats',
    });

    expect(allThreadsLink).toHaveAttribute('href', APP_ROUTES.CHATS);
    expect(allThreadsLink).toHaveAttribute('aria-current', 'page');
  });

  it('announces the unread chat count through the canonical nav badge', () => {
    render(
      <SidebarThreadsSection
        threads={[threads[0], { ...threads[1], unread: true }]}
        activeThreadId={null}
        tight
        collapsed={false}
      />
    );

    const unreadBadge = screen.getByLabelText('1 unread chat');
    expect(unreadBadge).toHaveTextContent('1');
    expect(unreadBadge).toHaveAttribute('data-nav-badge', 'count');
  });

  it('groups Recent threads through spacing without a visible section divider', () => {
    render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        tight
        collapsed={false}
      />
    );

    const sectionHeader = screen.getByText('Recent').parentElement;

    expect(sectionHeader).toHaveClass('px-2.5', 'pb-0.5', 'pt-2');
    expect(sectionHeader).not.toHaveClass('border-t');
    expect(sectionHeader?.className).not.toContain(
      'border-[color-mix(in_oklab,var(--linear-app-frame-seam)_44%,transparent)]'
    );
  });

  it('renders selectable button rows when no href is provided', () => {
    const onSelect = vi.fn();

    render(
      <SidebarThreadsSection
        threads={[
          {
            id: 'draft-thread',
            title: 'Draft thread',
            status: 'running',
            updatedAt: '2026-05-12T00:00:00.000Z',
          },
        ]}
        activeThreadId='draft-thread'
        onSelect={onSelect}
        tight
        collapsed={false}
      />
    );

    const threadButton = screen.getByRole('button', { name: 'Draft thread' });

    expect(threadButton).toHaveAttribute('aria-pressed', 'true');
    expect(threadButton).toHaveClass('h-6', 'bg-sidebar-accent-active');
    expect(threadButton).not.toHaveClass('h-auto', 'hover:bg-transparent');
    fireEvent.click(threadButton);
    expect(onSelect).toHaveBeenCalledWith('draft-thread');
  });

  it('shows a new chat empty-state action when no chats are available', () => {
    const onNewThread = vi.fn();

    render(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        onNewThread={onNewThread}
        tight
        collapsed={false}
      />
    );

    const newThreadButton = screen.getByRole('button', {
      name: 'New Chat',
    });

    expect(newThreadButton).toHaveClass(
      'h-6',
      'bg-sidebar-accent/70',
      'hover:bg-sidebar-accent-active'
    );
    expect(newThreadButton).not.toHaveClass('h-auto', 'hover:bg-transparent');
    fireEvent.click(newThreadButton);
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });

  it('keeps loading and error rows on the same reserved geometry', () => {
    const onRetry = vi.fn();
    const { container, rerender } = render(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        state='loading'
        collapsed={false}
      />
    );

    const loadingRow =
      container.querySelector('.skeleton')?.parentElement?.parentElement;
    expect(loadingRow).toHaveClass('h-7');

    rerender(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        state='error'
        onRetry={onRetry}
        collapsed={false}
      />
    );

    const errorRow = screen.getByText(
      'Conversations unavailable'
    ).parentElement;
    expect(errorRow).toHaveClass('h-7');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('maps conversation status, unread state, and fallback titles deterministically', () => {
    expect(getSidebarThreadStatus(null)).toBe('complete');
    expect(getSidebarThreadStatus('streaming')).toBe('running');
    expect(getSidebarThreadStatus('failed_network')).toBe('errored');
    expect(getSidebarThreadStatus('complete')).toBe('complete');

    const conversation = {
      id: 'thread / one',
      title: '  ',
      updatedAt: '2026-05-12T00:00:00.000Z',
      latestMessageRole: 'assistant' as const,
      latestTurnStatus: 'streaming' as const,
    };

    expect(
      toSidebarThread(conversation, {
        readAt: '2026-05-11T00:00:00.000Z',
      })
    ).toMatchObject({
      href: `${APP_ROUTES.CHAT}/thread%20%2F%20one`,
      title: 'Untitled chat',
      status: 'running',
      unread: true,
    });
    expect(
      toSidebarThread(conversation, {
        activeThreadId: conversation.id,
        readAt: '2026-05-11T00:00:00.000Z',
      }).unread
    ).toBe(false);
  });

  it('persists valid read timestamps and degrades safely for invalid storage', () => {
    const readState = { 'thread-one': '2026-05-12T00:00:00.000Z' };
    writeThreadReadState(readState);
    expect(readThreadReadState()).toEqual(readState);

    localStorage.setItem(
      THREAD_READ_STORAGE_KEY,
      JSON.stringify({ ...readState, invalid: 42 })
    );
    expect(readThreadReadState()).toEqual(readState);

    localStorage.setItem(THREAD_READ_STORAGE_KEY, '{invalid json');
    expect(readThreadReadState()).toEqual({});
  });

  it('compares valid and fallback timestamps without marking missing candidates unread', () => {
    expect(isTimestampAfter(undefined, undefined)).toBe(false);
    expect(isTimestampAfter('2026-05-12T00:00:00.000Z', undefined)).toBe(true);
    expect(
      isTimestampAfter('2026-05-12T00:00:00.000Z', '2026-05-13T00:00:00.000Z')
    ).toBe(false);
    expect(isTimestampAfter('zeta', 'alpha')).toBe(true);
  });
});
