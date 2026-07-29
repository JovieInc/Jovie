import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  type SidebarThread,
  SidebarThreadsSection,
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
  it('anchors a long thread title fade to the row track instead of shrink-wrapping it', () => {
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
        tight
        collapsed={false}
      />
    );

    const label = screen.getByText(title);

    expect(label).toHaveClass('justify-self-stretch', 'overflow-hidden');
    expect(label).not.toHaveClass('justify-self-start', 'truncate');
    expect(label.className).toContain('mask-image:linear-gradient');
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
    expect(activeThread).toHaveClass('text-white');
    expect(activeThread).not.toHaveClass(
      'shadow-[inset_2px_0_0_0_var(--color-accent)]'
    );
    expect(inactiveThread).toHaveClass('text-secondary-token');
    expect(inactiveThread).toHaveClass('hover:bg-surface-1');
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

    fireEvent.click(newThreadButton);
    expect(onNewThread).toHaveBeenCalledTimes(1);
  });
});
