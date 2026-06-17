'use client';

import { Archive, Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type MouseEvent, useCallback, useState } from 'react';
import { ContextMenuOverlay } from '@/components/shell/ContextMenuOverlay';
import type {
  ContextMenuItem,
  ContextMenuState,
} from '@/components/shell/context-menu.types';
import type { SidebarThread } from '@/components/shell/SidebarThreadsSection';
import { APP_ROUTES } from '@/constants/routes';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDeleteConversationMutation } from '@/lib/queries';

type ThreadContextMenuState = ContextMenuState;

export type UseChatThreadContextMenuOptions = {
  readonly activeThreadId?: string | null;
};

export function useChatThreadContextMenu(
  options: UseChatThreadContextMenuOptions = {}
) {
  const router = useRouter();
  const notifications = useNotifications();
  const deleteConversation = useDeleteConversationMutation();
  const { copy: copySessionId } = useClipboard({
    onSuccess: () => notifications.success('Session ID copied'),
    onError: () => notifications.error('Could not copy session ID'),
  });
  const [contextMenu, setContextMenu] = useState<ThreadContextMenuState | null>(
    null
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const archiveThread = useCallback(
    async (threadId: string) => {
      try {
        await deleteConversation.mutateAsync({ conversationId: threadId });
        notifications.success('Conversation archived');
        if (options.activeThreadId === threadId) {
          router.push(APP_ROUTES.CHAT);
        }
      } catch {
        notifications.error('Could not archive conversation');
      }
    },
    [deleteConversation, notifications, options.activeThreadId, router]
  );

  const buildMenuItems = useCallback(
    (thread: SidebarThread): ContextMenuItem[] => [
      {
        label: 'Copy Session ID',
        icon: Copy,
        onSelect: () => {
          void copySessionId(thread.id);
        },
      },
      {
        label: 'Archive',
        icon: Archive,
        tone: 'danger',
        onSelect: () => {
          void archiveThread(thread.id);
        },
      },
    ],
    [archiveThread, copySessionId]
  );

  const onThreadContextMenu = useCallback(
    (event: MouseEvent, thread: SidebarThread) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        items: buildMenuItems(thread),
      });
    },
    [buildMenuItems]
  );

  const contextMenuOverlay = (
    <ContextMenuOverlay state={contextMenu} onClose={closeContextMenu} />
  );

  return {
    onThreadContextMenu,
    contextMenuOverlay,
  };
}
