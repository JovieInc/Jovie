import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it, vi } from 'vitest';
import { SidebarChatAction } from './SidebarChatAction';

describe('SidebarChatAction', () => {
  it('discloses history from the keyboard and returns focus on Escape', async () => {
    const activate = vi.fn();
    render(
      <SidebarChatAction
        current={false}
        pending={false}
        recentChats={<Link href='/app/chat/example'>Release notes</Link>}
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
        recentChats={<Link href='/app/chat/example'>Release notes</Link>}
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
