'use client';

import { Button, ConfirmDialog } from '@jovie/ui';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import { PageToolbar } from '@/components/organisms/table';
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
    <div
      className='space-y-1.5'
      role='status'
      aria-live='polite'
      aria-label='Loading Chats'
    >
      {skeletonRows.map(rowId => (
        <div
          key={`chat-skeleton-${rowId}`}
          className='flex h-7 items-center gap-2 rounded-full px-2.5'
        >
          <div className='h-1.5 w-1.5 shrink-0 rounded-full skeleton motion-reduce:animate-none' />
          <div className='h-3.5 w-full max-w-72 rounded-sm skeleton motion-reduce:animate-none' />
        </div>
      ))}
    </div>
  );
}

export function ChatsEmptyState({ query }: Readonly<{ query: string }>) {
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  return (
    <EmptyState
      variant={hasQuery ? 'search' : 'default'}
      heading={hasQuery ? `No chats match "${trimmedQuery}".` : 'No chats yet'}
      description={
        hasQuery
          ? 'Clear the search or try a different phrase.'
          : 'Start a new chat and it will appear here.'
      }
      action={{
        href: APP_ROUTES.CHAT,
        label: 'New Chat',
        variant: 'secondary',
      }}
      className='min-h-72'
      testId='chats-empty-state'
    />
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
      notifications.success('All chats archived');
    } catch {
      notifications.error('Could not archive all chats');
    }
  }, [deleteConversation, notifications, sidebarThreads]);

  return (
    <PageShell
      data-testid='chats-page'
      className='h-full'
      frame='content-container'
      contentPadding='none'
      surfaceMode='default'
      toolbar={
        <PageToolbar
          className='border-b border-subtle'
          start={
            <AppSearchField
              value={query}
              onChange={setQuery}
              placeholder='Search chats'
              ariaLabel='Search Chats'
              className='max-w-2xl flex-1'
              inputClassName='text-app'
            />
          }
          end={
            <>
              {sidebarThreads.length > 0 ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  onClick={() => setArchiveAllOpen(true)}
                >
                  Archive All Chats
                </Button>
              ) : null}
              <Button asChild variant='secondary' size='sm'>
                <Link href={APP_ROUTES.CHAT}>New Chat</Link>
              </Button>
            </>
          }
        />
      }
    >
      <div className='flex h-full min-h-0 flex-col'>
        <div className='shrink-0 border-b border-subtle px-3 py-2'>
          <div className='flex flex-wrap items-center gap-3 text-2xs text-tertiary-token'>
            <span>{sidebarThreads.length} chats</span>
            <span className='inline-flex items-center gap-1'>
              <Search className='h-3 w-3' />
              Search is local to chat titles and statuses
            </span>
            {unreadCount > 0 ? <span>{unreadCount} unread</span> : null}
          </div>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'>
          {isLoading ? (
            <ChatListSkeleton />
          ) : isError ? (
            <PageErrorState
              title='Unable to load chats'
              message='We could not load your recent chats. Retry the request or refresh the page.'
              error={error instanceof Error ? error : undefined}
              actionLabel='Retry load'
              onRetry={() => {
                refetch();
              }}
            />
          ) : filteredThreads.length === 0 ? (
            <ChatsEmptyState query={trimmedQuery} />
          ) : (
            <div className='space-y-1.5'>
              {filteredThreads.map(thread => (
                <SidebarThreadRow
                  key={thread.id}
                  thread={thread}
                  active={false}
                  unread={!!thread.unread}
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
        title='Archive all chats?'
        description={`This will archive ${sidebarThreads.length} chat${sidebarThreads.length === 1 ? '' : 's'}. You cannot undo this action.`}
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
