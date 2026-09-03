import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarThread } from './SidebarThreadsSection';
import { useChatThreadPrefetch } from './useChatThreadPrefetch';

const { routerPrefetch, prefetchChatConversation } = vi.hoisted(() => ({
  routerPrefetch: vi.fn(),
  prefetchChatConversation: vi.fn((_client: unknown, _conversationId: string) =>
    Promise.resolve()
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ prefetch: routerPrefetch }),
}));

vi.mock('@/lib/queries/useChatConversationQuery', () => ({
  prefetchChatConversation,
}));

const thread: SidebarThread = {
  id: 'thread-1',
  href: '/app/chat/thread-1',
  title: 'Release rollout',
  status: 'complete',
  updatedAt: '2026-05-10T00:00:00.000Z',
};

function renderPrefetchHook() {
  const queryClient = new QueryClient();
  const view = renderHook(() => useChatThreadPrefetch(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, queryClient };
}

describe('useChatThreadPrefetch', () => {
  beforeEach(() => {
    routerPrefetch.mockClear();
    prefetchChatConversation.mockClear();
  });

  it('warms the route once per thread and the conversation query on every intent', () => {
    const { result, queryClient } = renderPrefetchHook();

    result.current(thread);
    result.current(thread);

    expect(routerPrefetch).toHaveBeenCalledTimes(1);
    expect(routerPrefetch).toHaveBeenCalledWith('/app/chat/thread-1');
    expect(prefetchChatConversation).toHaveBeenCalledTimes(2);
    expect(prefetchChatConversation).toHaveBeenCalledWith(
      queryClient,
      'thread-1'
    );
  });

  it('skips the route prefetch for experiment rows without an href', () => {
    const { result } = renderPrefetchHook();

    result.current({ ...thread, href: undefined });

    expect(routerPrefetch).not.toHaveBeenCalled();
    expect(prefetchChatConversation).toHaveBeenCalledTimes(1);
  });

  it('returns a stable callback across re-renders so memoized rows stay memoized', () => {
    const { result, rerender } = renderPrefetchHook();
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
