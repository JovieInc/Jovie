import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThreadsPageClient } from '@/app/app/(shell)/threads/ThreadsPageClient';
import { APP_ROUTES } from '@/constants/routes';

const { mockUseChatConversationsQuery } = vi.hoisted(() => ({
  mockUseChatConversationsQuery: vi.fn(),
}));

vi.mock('@/lib/queries/useChatConversationsQuery', () => ({
  useChatConversationsQuery: (...args: unknown[]) =>
    mockUseChatConversationsQuery(...args),
}));

describe('ThreadsPageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseChatConversationsQuery.mockReset();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders the threads shell and keeps the new thread CTA visible', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-older',
          title: 'Release rollout',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
        {
          id: 'thread-newer',
          title: 'Pitch tasks',
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ThreadsPageClient />);

    expect(mockUseChatConversationsQuery).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(
      screen.getByRole('heading', { name: 'Threads' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New thread' })).toHaveAttribute(
      'href',
      APP_ROUTES.CHAT
    );

    const threadLinks = screen
      .getAllByRole('link')
      .filter(link => link.getAttribute('href')?.startsWith('/app/chat/'));

    expect(threadLinks).toHaveLength(2);
    expect(threadLinks[0]).toHaveTextContent('Pitch tasks');
    expect(threadLinks[1]).toHaveTextContent('Release rollout');
  });

  it('filters thread rows locally and preserves unread styling', () => {
    localStorage.setItem(
      'jovie:sidebar-thread-read-at',
      JSON.stringify({
        'thread-unread': '2026-05-01T00:00:00.000Z',
      })
    );
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-unread',
          title: 'Unread answer',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'streaming',
        },
        {
          id: 'thread-pitch',
          title: 'Pitch tasks',
          createdAt: '2026-05-02T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ThreadsPageClient />);

    expect(screen.getByRole('link', { name: 'Unread answer' })).toHaveClass(
      'text-primary-token'
    );
    expect(document.querySelector('.anim-calm-breath')).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search threads' }),
      {
        target: { value: 'Pitch' },
      }
    );

    expect(screen.queryByRole('link', { name: 'Unread answer' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Pitch tasks' })
    ).toBeInTheDocument();
  });

  it('renders the empty state when the local search does not match', () => {
    mockUseChatConversationsQuery.mockReturnValue({
      data: [
        {
          id: 'thread-1',
          title: 'Release rollout',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
          latestMessageRole: 'assistant',
          latestTurnStatus: 'completed',
        },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ThreadsPageClient />);

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search threads' }),
      {
        target: { value: 'Missing' },
      }
    );

    expect(screen.getByText('No threads match "Missing".')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New thread' })).toHaveLength(2);
  });
});
