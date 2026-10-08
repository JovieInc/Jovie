'use client';

import { useEffect, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useChatConversationQuery } from '@/lib/queries/useChatConversationQuery';
import { SidebarRecentMenu } from './SidebarRecentMenu';
import {
  readThreadReadState,
  THREAD_READ_STORAGE_KEY,
  writeThreadReadState,
} from './SidebarThreadsSection';

/** Project the existing private Summer door. Never read customer conversations. */
export function SidebarSummerRecentMenu({
  userId,
  active,
}: {
  readonly userId: string;
  readonly active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const storageKey = `${THREAD_READ_STORAGE_KEY}:${userId}:ov`;
  const [readAt, setReadAt] = useState<Record<string, string>>({});
  useEffect(() => setReadAt(readThreadReadState(storageKey)), [storageKey]);
  const history = useChatConversationQuery({
    chatMode: 'ov',
    conversationId: null,
    enabled: open,
  });
  const latest = history.data?.messages.at(-1);
  const conversation = history.data?.conversation;
  const threads =
    latest && conversation
      ? [
          {
            id: conversation.id,
            title: conversation.title ?? 'Summer',
            href: APP_ROUTES.ADMIN_CHAT,
            updatedAt: latest.createdAt,
            status: latest.summerFailed
              ? ('errored' as const)
              : ('complete' as const),
            unread:
              !active &&
              latest.role === 'assistant' &&
              (readAt[conversation.id] ?? '') < latest.createdAt,
          },
        ]
      : [];
  return (
    <SidebarRecentMenu
      threads={threads}
      activeThreadId={active ? (conversation?.id ?? null) : null}
      historyHref={APP_ROUTES.ADMIN_CHAT}
      onOpenChange={setOpen}
      state={history.isLoading ? 'loading' : history.isError ? 'error' : 'idle'}
      onRetry={() => {
        void history.refetch();
      }}
      onSelect={id => {
        if (!latest) return;
        const next = { ...readAt, [id]: latest.createdAt };
        setReadAt(next);
        writeThreadReadState(next, storageKey);
      }}
    />
  );
}
