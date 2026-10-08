import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarRecentMenu } from './SidebarRecentMenu';
import type { SidebarThread } from './SidebarThreadsSection';

const threads: SidebarThread[] = [
  {
    id: 'a',
    title: 'First chat',
    status: 'complete',
    updatedAt: '2026-10-07T10:00:00Z',
    href: '/app/chat/a',
    unread: true,
  },
  {
    id: 'b',
    title: 'Second chat',
    status: 'running',
    updatedAt: '2026-10-07T09:00:00Z',
    href: '/app/chat/b',
  },
];

function View({
  items = threads,
  state = 'idle',
  onRetry,
}: {
  items?: SidebarThread[];
  onRetry?: () => void;
  state?: 'idle' | 'loading' | 'error';
}) {
  return (
    <TooltipProvider>
      <SidebarRecentMenu
        threads={items}
        activeThreadId='a'
        state={state}
        onRetry={onRetry}
      />
    </TooltipProvider>
  );
}

describe('Recent chat flyout', () => {
  it('opens with keyboard, retains full history access and restores focus after Escape', async () => {
    const user = userEvent.setup();
    render(<View />);
    const trigger = screen.getByRole('button', { name: 'Recent Chats' });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('link', { name: 'First chat' })
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(dialog).getByRole('link', { name: 'All chats' })
    ).toHaveAttribute('href', '/app/chats');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('keeps history access through empty, loading, error/retry and cached states', async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <View items={[]} state='loading' onRetry={retry} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Recent Chats' }));
    expect(screen.getByRole('link', { name: 'All chats' })).toHaveAttribute(
      'href',
      '/app/chats'
    );
    rerender(<View items={[]} state='error' onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'All chats' })).toBeVisible();
    rerender(<View items={[]} />);
    expect(screen.getByText('No recent chats')).toBeVisible();
    rerender(<View state='error' />);
    expect(screen.getByRole('link', { name: 'First chat' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'All chats' })).toBeVisible();
  });
  it('accepts first successful data while open and freezes ordering while statuses update', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<View items={[]} state='loading' />);
    await user.click(screen.getByRole('button', { name: 'Recent Chats' }));
    expect(screen.getByRole('link', { name: 'All chats' })).toBeVisible();
    rerender(<View />);
    expect(screen.getByRole('link', { name: 'First chat' })).toBeVisible();
    rerender(
      <View
        items={[
          { ...threads[1], updatedAt: '2026-10-07T11:00:00Z', unread: true },
          threads[0],
        ]}
      />
    );
    const links = within(screen.getByRole('dialog')).getAllByRole('link');
    expect(links.slice(0, 2).map(link => link.getAttribute('href'))).toEqual([
      '/app/chat/a',
      '/app/chat/b',
    ]);
    fireEvent.click(links[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
