'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';
import { prefetchChatConversation } from '@/lib/queries/useChatConversationQuery';
import type { SidebarThread } from './SidebarThreadsSection';

/**
 * Hover/focus intent on a sidebar thread → warm both halves of a thread
 * switch before the click lands (JOV-5874):
 *
 * - the App Router segment for `thread.href` (RSC payload), once per thread
 *   for the life of this component;
 * - the conversation detail query, every time (a fresh cache entry is a
 *   no-op, so this is cheap and picks up new turns after the stale window).
 *
 * Returns a stable callback so memoized rows don't re-render.
 */
export function useChatThreadPrefetch(): (thread: SidebarThread) => void {
  const router = useRouter();
  const queryClient = useQueryClient();
  const routeWarmedRef = useRef<Set<string>>(new Set());

  return useCallback(
    (thread: SidebarThread) => {
      if (thread.href && !routeWarmedRef.current.has(thread.id)) {
        routeWarmedRef.current.add(thread.id);
        router.prefetch(thread.href);
      }
      void prefetchChatConversation(queryClient, thread.id);
    },
    [queryClient, router]
  );
}
