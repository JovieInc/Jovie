import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SidebarSummerRecentMenu } from './SidebarSummerRecentMenu';

function View({
  userId = 'founder',
  active = false,
  client,
}: {
  userId?: string;
  active?: boolean;
  client: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <SidebarSummerRecentMenu key={userId} userId={userId} active={active} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
const history = {
  chatMode: 'ov',
  conversation: { id: 'summer-session:current', title: 'Summer' },
  hasMore: false,
  messages: [
    {
      id: 'private:1',
      role: 'assistant',
      content: 'Private company transcript',
      createdAt: '2026-10-07T12:00:00Z',
      clientMessageId: null,
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('private Summer Recent adapter', () => {
  it('reads only the existing private door after opening and preserves Ovie history links', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(history), { status: 200 })
      );
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(<View client={client} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recent Chats' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Summer' })).toBeVisible()
    );
    expect(
      fetch.mock.calls.every(([url]) => url === '/api/ovie/summer/history')
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Summer' })).toHaveAttribute(
      'href',
      '/app/ov/chat'
    );
    expect(screen.getByRole('link', { name: 'All chats' })).toHaveAttribute(
      'href',
      '/app/ov/chat'
    );
    expect(
      screen.queryByText('Private company transcript')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Summer' }));
    expect(
      localStorage.getItem('jovie:sidebar-thread-read-at:founder:ov')
    ).toContain('summer-session:current');
  });
  it('discards the prior private projection on account switch and keeps refusal retryable', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(history), { status: 200 })
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: 'Denied' }), { status: 403 })
        )
      );
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(<View client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recent Chats' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Summer' })).toBeVisible()
    );
    rerender(<View client={client} userId='other' active />);
    fireEvent.click(screen.getByRole('button', { name: 'Recent Chats' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry Chats' })).toBeVisible()
    );
    expect(
      screen.queryByRole('link', { name: 'Summer' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Chats' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });
});
