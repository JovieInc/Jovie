import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SidebarChatAction } from './SidebarChatAction';

describe('SidebarChatAction', () => {
  it('retains the search and its focus during a parent update', async () => {
    const user = userEvent.setup();
    const props = {
      current: false,
      pending: false,
      renderRecentChats: () => (
        <Link href='/app/chat/example'>Release notes</Link>
      ),
      onActivate: vi.fn(),
    };
    const { rerender } = render(
      <nav aria-label='Workspace'>
        <SidebarChatAction {...props} />
      </nav>
    );
    const chat = screen.getByRole('link', { name: 'Chat' });
    chat.focus();
    await user.keyboard('{ArrowRight}');
    const search = await screen.findByRole('searchbox', {
      name: 'Search Chats',
    });
    await user.type(search, 'release');
    rerender(
      <nav aria-label='Workspace'>
        <SidebarChatAction {...props} pending />
      </nav>
    );
    expect(search).toHaveFocus();
    expect(search).toHaveValue('release');
    await expectNoA11yViolations(document.body);
  });

  it('discloses history from the keyboard and returns focus on Escape', async () => {
    const activate = vi.fn();
    render(
      <SidebarChatAction
        current={false}
        pending={false}
        renderRecentChats={query =>
          'Release notes'.toLowerCase().includes(query.toLowerCase()) ? (
            <Link href='/app/chat/example'>Release notes</Link>
          ) : (
            <p role='status'>No chats match</p>
          )
        }
        onActivate={activate}
      />
    );
    const chat = screen.getByRole('link', { name: 'Chat' });
    chat.focus();
    fireEvent.keyDown(chat, { key: 'ArrowRight' });
    const dialog = await screen.findByRole('dialog', { name: 'Recent Chats' });
    expect(chat).toHaveAttribute('aria-controls', dialog.id);
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(activate).not.toHaveBeenCalled();
    const list = dialog.querySelector<HTMLElement>(
      '.sidebar-recent-chats-list'
    );
    if (!list) throw new Error('Missing history viewport');
    Object.defineProperties(list, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 130 },
    });
    fireEvent.scroll(list);
    expect(list).toHaveAttribute('data-scroll-more');
    list.scrollTop = 30;
    fireEvent.scroll(list);
    expect(list).not.toHaveAttribute('data-scroll-more');
    const search = screen.getByRole('searchbox', { name: 'Search Chats' });
    fireEvent.change(search, { target: { value: 'tour' } });
    expect(screen.getByRole('status')).toHaveTextContent('No chats match');
    fireEvent.change(search, { target: { value: 'LEASE' } });
    expect(screen.getByRole('link', { name: 'Release notes' })).toBeVisible();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(chat).toHaveFocus();
  });

  it('keeps click activation on the composer link even after pointer disclosure', async () => {
    const activate = vi.fn(event => event.preventDefault());
    render(
      <SidebarChatAction
        current={false}
        pending={false}
        renderRecentChats={query =>
          'Release notes'.toLowerCase().includes(query.toLowerCase()) ? (
            <Link href='/app/chat/example'>Release notes</Link>
          ) : (
            <p role='status'>No chats match</p>
          )
        }
        onActivate={activate}
      />
    );
    const chat = screen.getByRole('link', { name: 'Chat' });
    fireEvent.pointerOver(chat, { pointerType: 'mouse' });
    const dialog = await screen.findByRole('dialog', { name: 'Recent Chats' });
    expect(screen.getByRole('link', { name: 'Release notes' })).toBeVisible();
    fireEvent.click(chat);
    expect(activate).toHaveBeenCalledOnce();
    expect(chat).toHaveAttribute('href', '/app/chat');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });
});
