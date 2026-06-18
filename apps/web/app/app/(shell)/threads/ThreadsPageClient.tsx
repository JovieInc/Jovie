'use client';

import { Button } from '@jovie/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { PageShell } from '@/components/organisms/PageShell';
import {
  readThreadReadState,
  type SidebarThread,
  SidebarThreadRow,
  toSidebarThread,
  writeThreadReadState,
} from '@/components/shell/SidebarThreadsSection';
import { useChatThreadContextMenu } from '@/components/shell/useChatThreadContextMenu';
import { APP_ROUTES } from '@/constants/routes';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useDeleteConversationMutation } from '@/lib/queries';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';

const THREAD_LIMIT = 50;

function ChatListSkeleton() {
  const skeletonRows = ['a', 'b', 'c', 'd', 'e', 'f'];

  return (
    <div className='space-y-1.5'>
      {skeletonRows.map(rowId => (
        <div
          key={`chat-skeleton-${rowId}`}
          className='flex h-7 items-center gap-2 rounded-full px-2.5'
        >
          <div className='h-1.5 w-1.5 shrink-0 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-3.5 w-full max-w-[18rem] rounded-sm skeleton motion-reduce:animate-none' />
        </div>
      ))}
    </div>
  );
}

export function ChatsPageClient() {
  const [query, setQuery] = useState('');
  const [archiveAllOpen, setArchiveAllOpen] = useState(false);
  const [threadReadAtById, setThreadReadAtById] =
    useState<Record<string, string>>(readThreadReadState);
  const notifications = useNotifications();
  const deleteConversation = useDeleteConversationMutation();
  const { onThreadContextMenu, contextMenuOverlay } =
    useChatThreadContextMenu();

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch,
  } = useChatConversationsQuery({
    limit: THREAD_LIMIT,
  });

  useEffect(() => {
    if (!conversations || conversations.length === 0) return;

    setThreadReadAtById(previous => {
      if (Object.keys(previous).length > 0) return previous;

      const baseline = Object.fromEntries(
        conversations.map(conversation => [
          conversation.id,
          conversation.updatedAt,
        ])
      );
      writeThreadReadState(baseline);
      return baseline;
    });
  }, [conversations]);

  const sidebarThreads = useMemo<SidebarThread[]>(
    () =>
      (conversations ?? [])
        .map(conversation =>
          toSidebarThread(conversation, {
            readAt: threadReadAtById[conversation.id],
          })
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations, threadReadAtById]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  const filteredThreads = useMemo(
    () =>
      normalizedQuery.length === 0
        ? sidebarThreads
        : sidebarThreads.filter(thread => {
            const haystack = `${thread.title} ${thread.status}`.toLowerCase();
            return haystack.includes(normalizedQuery);
          }),
    [normalizedQuery, sidebarThreads]
  );

  const unreadCount = sidebarThreads.filter(thread => thread.unread).length;

  const handleArchiveAll = useCallback(async () => {
    if (sidebarThreads.length === 0) return;

    try {
      await Promise.all(
        sidebarThreads.map(thread =>
          deleteConversation.mutateAsync({ conversationId: thread.id })
        )
      );
      notifications.success('All conversations archived');
    } catch {
      notifications.error('Could not archive all conversations');
    }
  }, [deleteConversation, notifications, sidebarThreads]);

  return (
    <PageShell
      data-testid='chats-page'
      className='h-full'
      frame='content-container'
      contentPadding='none'
      surfaceMode='default'
    >
      <div className='flex h-full min-h-0 flex-col'>
        <div className='shrink-0 border-b border-subtle px-4 py-3 sm:px-6'>
          <div className='flex items-center gap-2'>
            <AppSearchField
              value={query}
              onChange={setQuery}
              placeholder='Search conversations'
              ariaLabel='Search Conversations'
              className='max-w-2xl flex-1'
              inputClassName='text-[13px]'
            />
            <div className='flex items-center gap-2'>
              {sidebarThreads.length > 0 ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setArchiveAllOpen(true)}
                >
                  Archive All Conversations
                </Button>
              ) : null}
              <Button asChild variant='secondary' size='sm'>
                <Link href={APP_ROUTES.CHAT}>New Conversation</Link>
              </Button>
            </div>
          </div>
          <div className='mt-2 flex items-center gap-3 text-[11px] text-tertiary-token'>
            <span>{sidebarThreads.length} conversations</span>
            <span className='inline-flex items-center gap-1'>
              <Search className='h-3 w-3' />
              Search is local to conversation titles and statuses
            </span>
            {unreadCount > 0 ? <span>{unreadCount} unread</span> : null}
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'>
          {isLoading ? (
            <ChatListSkeleton />
          ) : isError ? (
            <PageErrorState
              title='Unable to load conversations'
              message='We could not load your recent conversations. Retry the request or refresh the page.'
              error={error instanceof Error ? error : undefined}
              actionLabel='Retry load'
              onRetry={() => {
                refetch();
              }}
              secondaryAction={{
                label: 'Refresh Page',
                onClick: () => globalThis.location.reload(),
              }}
            />
          ) : filteredThreads.length === 0 ? (
            <div className='grid min-h-[18rem] place-items-center rounded-2xl border border-dashed border-subtle bg-surface-0 px-6 py-10 text-center'>
              <div className='max-w-sm space-y-3'>
                <p className='text-[14px] font-semibold text-primary-token'>
                  {normalizedQuery
                    ? `No conversations match "${trimmedQuery}".`
                    : 'No conversations yet'}
                </p>
                <p className='text-[13px] leading-6 text-secondary-token'>
                  {normalizedQuery
                    ? 'Clear the search or try a different phrase.'
                    : 'Start a new conversation and it will appear here.'}
                </p>
                <Button asChild variant='secondary' size='sm'>
                  <Link href={APP_ROUTES.CHAT}>New Conversation</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className='space-y-1.5'>
              {filteredThreads.map(thread => (
                <SidebarThreadRow
                  key={thread.id}
                  thread={thread}
                  active={false}
                  unread={!!thread.unread}
                  hasThreadActions
                  onThreadContextMenu={onThreadContextMenu}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={archiveAllOpen}
        onOpenChange={setArchiveAllOpen}
        title='Archive all conversations?'
        description={`This will archive ${sidebarThreads.length} conversation${sidebarThreads.length === 1 ? '' : 's'}. You cannot undo this action.`}
        confirmLabel='Archive All'
        variant='destructive'
        onConfirm={handleArchiveAll}
        isLoading={deleteConversation.isPending}
      />
      {contextMenuOverlay}
    </PageShell>
  );
}

export { ChatsPageClient as ThreadsPageClient };
